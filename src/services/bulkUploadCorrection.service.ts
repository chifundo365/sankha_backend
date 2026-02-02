/**
 * Bulk Upload Correction Service v4.0
 * ====================================
 * Generates correction CSV files for invalid staging rows.
 * Enables sellers to fix errors and re-upload only problematic rows.
 */

import * as XLSX from 'xlsx';
import prisma from '../prismaClient';
import { RowError, RawExcelRow, TemplateType } from '../types/bulkUpload.types';
import { errorMessages, getLocalizedError, ErrorCode } from '../utils/errorMessages';

// ============================================================================
// TYPES
// ============================================================================

interface InvalidStagingRow {
  id: string;
  row_number: number;
  raw_data: RawExcelRow;
  errors: RowError[] | null;
  template_type: string;
  product_name: string | null;
  category_name: string | null;
  missing_specs: string[] | null;
}

interface CorrectionRow extends Record<string, any> {
  Row_Reference: number;
  Error_Reason: string;
  Error_Reason_Chichewa: string;
}

interface CorrectionSummary {
  batchId: string;
  totalInvalid: number;
  errorBreakdown: Record<string, number>;
  generatedAt: Date;
}

// ============================================================================
// ERROR CODE MAPPING
// ============================================================================

/**
 * Map raw validation errors to standardized error codes
 */
function mapToErrorCode(error: RowError): ErrorCode {
  const field = error.field?.toLowerCase() || '';
  const message = error.message?.toLowerCase() || '';

  // Price errors
  if (field.includes('price') || message.includes('price')) {
    if (message.includes('positive')) return 'INVALID_PRICE';
    return 'MISSING_PRICE';
  }

  // Stock errors
  if (field.includes('stock') || field.includes('quantity')) {
    return 'INVALID_STOCK';
  }

  // Product name errors
  if (field.includes('product') && field.includes('name')) {
    if (message.includes('exists') || message.includes('duplicate')) {
      return 'DUPLICATE_PRODUCT';
    }
    return 'MISSING_PRODUCT_NAME';
  }

  // SKU errors
  if (field.includes('sku')) {
    if (message.includes('duplicate')) return 'DUPLICATE_SKU';
    return 'INVALID_SKU';
  }

  // Spec errors
  if (field.includes('spec') || message.includes('spec')) {
    return 'MISSING_TECH_SPECS';
  }

  // Condition errors
  if (field.includes('condition')) {
    return 'INVALID_CONDITION';
  }

  // Category errors
  if (field.includes('category')) {
    return 'INVALID_CATEGORY';
  }

  // JSON/format errors
  if (message.includes('json') || message.includes('format')) {
    return 'INVALID_JSON_FORMAT';
  }

  // File-level errors
  if (field === 'file') {
    return 'FILE_PARSE_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Generate human-readable error summary from validation errors
 */
function generateErrorSummary(
  errors: RowError[] | null,
  missingSpecs: string[] | null,
  language: 'en' | 'ny' = 'en'
): string {
  if (!errors || errors.length === 0) {
    if (missingSpecs && missingSpecs.length > 0) {
      const specList = missingSpecs.join(', ');
      return language === 'en'
        ? `Missing required specs: ${specList}`
        : `Kulibe zidziwitso zofunikira: ${specList}`;
    }
    return language === 'en' ? 'Unknown error' : 'Vuto losadziwika';
  }

  const errorCodes = errors.map(e => mapToErrorCode(e));
  const uniqueCodes = [...new Set(errorCodes)];

  const messages = uniqueCodes.map(code => {
    const localized = getLocalizedError(code, language);
    return localized;
  });

  // Add missing specs if present
  if (missingSpecs && missingSpecs.length > 0) {
    const specList = missingSpecs.join(', ');
    const specMessage = language === 'en'
      ? `Missing specs: ${specList}`
      : `Kulibe: ${specList}`;
    messages.push(specMessage);
  }

  return messages.join('; ');
}

// ============================================================================
// CORRECTION CSV SERVICE
// ============================================================================

export const bulkUploadCorrectionService = {
  /**
   * Get all invalid rows for a batch
   */
  async getInvalidRows(batchId: string): Promise<InvalidStagingRow[]> {
    const rows = await prisma.$queryRaw<InvalidStagingRow[]>`
      SELECT 
        id,
        row_number,
        raw_data,
        errors,
        template_type,
        product_name,
        category_name,
        missing_specs
      FROM bulk_upload_staging
      WHERE batch_id = ${batchId}
      AND validation_status IN ('INVALID', 'SKIPPED')
      ORDER BY row_number
    `;

    return rows;
  },

  /**
   * Generate correction data with localized error messages
   */
  async generateCorrectionData(
    batchId: string,
    includeChichewa: boolean = true
  ): Promise<{ rows: CorrectionRow[]; summary: CorrectionSummary }> {
    const invalidRows = await this.getInvalidRows(batchId);

    if (invalidRows.length === 0) {
      return {
        rows: [],
        summary: {
          batchId,
          totalInvalid: 0,
          errorBreakdown: {},
          generatedAt: new Date()
        }
      };
    }

    // Track error breakdown
    const errorBreakdown: Record<string, number> = {};

    const correctionRows: CorrectionRow[] = invalidRows.map(row => {
      // Count errors by type
      const errors = row.errors || [];
      errors.forEach(e => {
        const code = mapToErrorCode(e);
        errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
      });

      // Add missing specs to breakdown
      if (row.missing_specs && row.missing_specs.length > 0) {
        errorBreakdown['MISSING_TECH_SPECS'] = 
          (errorBreakdown['MISSING_TECH_SPECS'] || 0) + 1;
      }

      // Build correction row
      const correctionRow: CorrectionRow = {
        Row_Reference: row.row_number,
        ...row.raw_data,
        Error_Reason: generateErrorSummary(row.errors, row.missing_specs, 'en'),
        Error_Reason_Chichewa: includeChichewa 
          ? generateErrorSummary(row.errors, row.missing_specs, 'ny')
          : ''
      };

      return correctionRow;
    });

    return {
      rows: correctionRows,
      summary: {
        batchId,
        totalInvalid: invalidRows.length,
        errorBreakdown,
        generatedAt: new Date()
      }
    };
  },

  /**
   * Generate correction CSV/Excel file
   */
  async generateCorrectionFile(
    batchId: string,
    format: 'xlsx' | 'csv' = 'xlsx',
    includeChichewa: boolean = true
  ): Promise<{ buffer: Buffer; filename: string; summary: CorrectionSummary }> {
    const { rows, summary } = await this.generateCorrectionData(batchId, includeChichewa);

    if (rows.length === 0) {
      throw new Error('No invalid rows found for this batch');
    }

    // Get original upload info
    const upload = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId },
      select: { file_name: true, template_type: true }
    });

    // Determine column order based on template type
    const templateType = (upload?.template_type as TemplateType) || TemplateType.GENERAL;
    
    // Build ordered headers
    const baseHeaders = [
      'Row_Reference',
      'Product Name',
      'Category',
      'Brand',
      'SKU',
      'Base Price (MWK)',
      'Stock Quantity',
      'Condition',
      'Description'
    ];

    // Add template-specific headers
    let templateHeaders: string[] = [];
    if (templateType === TemplateType.ELECTRONICS) {
      // Get spec columns from first row
      const specKeys = Object.keys(rows[0] || {})
        .filter(k => k.toLowerCase().startsWith('spec:'));
      templateHeaders = specKeys;
    } else {
      // General template: Label/Value pairs
      templateHeaders = [];
      for (let i = 1; i <= 10; i++) {
        if (rows.some(r => r[`Label_${i}`] || r[`Value_${i}`])) {
          templateHeaders.push(`Label_${i}`, `Value_${i}`);
        }
      }
    }

    // Error columns at the end
    const errorHeaders = ['Error_Reason'];
    if (includeChichewa) {
      errorHeaders.push('Error_Reason_Chichewa');
    }

    const allHeaders = [...baseHeaders, ...templateHeaders, ...errorHeaders];

    // Reorder rows to match headers
    const orderedRows = rows.map(row => {
      const ordered: Record<string, any> = {};
      allHeaders.forEach(h => {
        ordered[h] = row[h] ?? '';
      });
      return ordered;
    });

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Instructions sheet
    const instructions = [
      ['CORRECTION FILE - Fix and Re-upload'],
      [''],
      ['This file contains rows that failed validation.'],
      [''],
      ['HOW TO FIX:'],
      ['1. Review the "Error_Reason" column for each row'],
      ['2. Fix the highlighted issues in the data columns'],
      ['3. Do NOT change the "Row_Reference" column'],
      ['4. Save and re-upload this file'],
      [''],
      ['SUMMARY:'],
      [`Total rows to fix: ${summary.totalInvalid}`],
      [''],
      ['ERROR BREAKDOWN:'],
      ...Object.entries(summary.errorBreakdown).map(([code, count]) => [
        `- ${code}: ${count} rows`
      ]),
      [''],
      ['CHILANKHULO CHA CHICHEWA:'],
      ['Onetsetsani kolamu ya "Error_Reason_Chichewa" kuti mumvetse vuto.']
    ];

    const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
    instructionSheet['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');

    // Data sheet
    const dataSheet = XLSX.utils.json_to_sheet(orderedRows, { header: allHeaders });
    
    // Set column widths
    dataSheet['!cols'] = allHeaders.map(h => ({
      wch: h.includes('Error') ? 50 : Math.max(h.length + 5, 15)
    }));

    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Corrections');

    // Generate buffer
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: format === 'csv' ? 'csv' : 'xlsx' 
    });

    // Generate filename
    const originalName = upload?.file_name?.replace(/\.[^.]+$/, '') || 'upload';
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${originalName}_corrections_${timestamp}.${format}`;

    return { buffer, filename, summary };
  },

  /**
   * Get correction preview (for API response)
   */
  async getCorrectionPreview(
    batchId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    rows: CorrectionRow[];
    summary: CorrectionSummary;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const { rows, summary } = await this.generateCorrectionData(batchId, true);

    const totalCount = rows.length;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;

    const paginatedRows = rows.slice(offset, offset + limit);

    return {
      rows: paginatedRows,
      summary,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  },

  /**
   * Mark correction as downloaded (for tracking)
   */
  async markCorrectionDownloaded(batchId: string, userId: string): Promise<void> {
    await prisma.bulk_uploads.updateMany({
      where: { batch_id: batchId },
      data: {
        // @ts-ignore - custom field tracking
        correction_downloaded_at: new Date(),
        correction_downloaded_by: userId
      }
    });
  }
};

export default bulkUploadCorrectionService;

/**
 * Bulk Upload Correction Service v4.0
 * =====================================
 * Handles generating correction files for failed/invalid rows
 * allowing sellers to fix errors and re-upload only the problem rows.
 */
import * as XLSX from 'xlsx';
import prisma from '../prismaClient';
import { RowError } from '../types/bulkUpload.types';

// ============================================================================
// TYPES
// ============================================================================

interface CorrectionRow {
  row_number: number;
  product_name?: string;
  category_name?: string;
  brand?: string;
  sku?: string;
  base_price?: number;
  stock_quantity?: number;
  condition?: string;
  description?: string;
  errors: string;
  validation_status: string;
  [key: string]: any; // For spec columns
}

interface CorrectionSummary {
  total_invalid: number;
  total_skipped: number;
  error_types: Record<string, number>;
}

// ============================================================================
// SERVICE
// ============================================================================

export const bulkUploadCorrectionService = {
  /**
   * Generate a correction Excel file for invalid/skipped rows
   */
  async generateCorrectionFile(
    shopId: string,
    batchId: string
  ): Promise<{ buffer: Buffer; filename: string; summary: CorrectionSummary }> {
    // Get all invalid and skipped rows
    const invalidRows = await prisma.bulk_upload_staging.findMany({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: { in: ['INVALID', 'SKIPPED'] }
      },
      orderBy: { row_number: 'asc' }
    });

    if (invalidRows.length === 0) {
      throw new Error('No invalid rows found in this batch');
    }

    // Get bulk upload info for filename
    const bulkUpload = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId, shop_id: shopId }
    });

    // Build correction rows
    const correctionRows: CorrectionRow[] = [];
    const errorTypes: Record<string, number> = {};
    let totalInvalid = 0;
    let totalSkipped = 0;

    for (const row of invalidRows) {
      const rawData = row.raw_data as Record<string, any>;
      const errors = row.errors as unknown as RowError[] || [];
      
      // Count error types
      for (const err of errors) {
        const errType = err.field || 'Unknown';
        errorTypes[errType] = (errorTypes[errType] || 0) + 1;
      }

      if (row.validation_status === 'INVALID') {
        totalInvalid++;
      } else {
        totalSkipped++;
      }

      // Build error message string
      const errorMessage = errors.map(e => `${e.field}: ${e.message}`).join('; ');

      // Extract variant values/specs from raw data
      const variantValues = row.variant_values as Record<string, string> || {};
      const specColumns: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(variantValues)) {
        specColumns[`Spec: ${key}`] = value;
      }

      // Also check raw data for spec columns
      for (const [key, value] of Object.entries(rawData)) {
        if (key.startsWith('Spec: ') || key.startsWith('Label_') || key.startsWith('Value_')) {
          specColumns[key] = String(value || '');
        }
      }

      correctionRows.push({
        row_number: row.row_number,
        product_name: row.product_name || rawData['Product Name'] || '',
        category_name: row.category_name || rawData['Category'] || '',
        brand: row.brand || rawData['Brand'] || '',
        sku: row.sku || rawData['SKU'] || '',
        base_price: row.base_price ? Number(row.base_price) : (rawData['Base Price (MWK)'] || ''),
        stock_quantity: row.stock_quantity ?? (rawData['Stock Quantity'] || ''),
        condition: row.condition || rawData['Condition'] || 'NEW',
        description: row.description || rawData['Description'] || '',
        ...specColumns,
        errors: errorMessage,
        validation_status: row.validation_status === 'SKIPPED' ? 'DUPLICATE' : 'INVALID'
      });
    }

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Correction Data sheet
    const correctionData = correctionRows.map(row => ({
      'Original Row': row.row_number,
      'Product Name': row.product_name,
      'Category': row.category_name,
      'Brand': row.brand,
      'SKU': row.sku,
      'Base Price (MWK)': row.base_price,
      'Stock Quantity': row.stock_quantity,
      'Condition': row.condition,
      'Description': row.description,
      ...Object.fromEntries(
        Object.entries(row).filter(([k]) => k.startsWith('Spec: ') || k.startsWith('Label_') || k.startsWith('Value_'))
      ),
      'Error Details': row.errors,
      'Status': row.validation_status
    }));

    const correctionSheet = XLSX.utils.json_to_sheet(correctionData);
    XLSX.utils.book_append_sheet(workbook, correctionSheet, 'Corrections Needed');

    // Summary sheet
    const summaryData = [
      ['Correction File Summary'],
      [''],
      ['Total Invalid Rows', totalInvalid],
      ['Total Skipped (Duplicates)', totalSkipped],
      ['Total Rows to Fix', invalidRows.length],
      [''],
      ['Error Breakdown:'],
      ...Object.entries(errorTypes).map(([type, count]) => [type, count]),
      [''],
      ['Instructions:'],
      ['1. Fix the errors in the "Corrections Needed" sheet'],
      ['2. Delete the "Original Row", "Error Details", and "Status" columns'],
      ['3. Re-upload the corrected file'],
      [''],
      ['Note: Duplicate products (DUPLICATE status) should be removed or renamed']
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Generate buffer
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const originalName = bulkUpload?.file_name?.replace(/\.[^/.]+$/, '') || 'bulk-upload';
    const filename = `${originalName}-corrections-${timestamp}.xlsx`;

    return {
      buffer,
      filename,
      summary: {
        total_invalid: totalInvalid,
        total_skipped: totalSkipped,
        error_types: errorTypes
      }
    };
  },

  /**
   * Mark that a correction file was downloaded (for tracking)
   */
  async markCorrectionDownloaded(shopId: string, batchId: string): Promise<void> {
    // Could add a `correction_downloaded_at` field to bulk_uploads
    // For now, just log it
    console.log(`Correction file downloaded for batch ${batchId} by shop ${shopId}`);
  },

  /**
   * Get a preview of errors without generating the full file
   */
  async getCorrectionPreview(
    shopId: string,
    batchId: string,
    limit: number = 10
  ): Promise<{
    total: number;
    preview: Array<{
      rowNumber: number;
      productName?: string;
      errors: RowError[];
      status: string;
    }>;
    errorSummary: Record<string, number>;
  }> {
    const [total, rows] = await Promise.all([
      prisma.bulk_upload_staging.count({
        where: {
          batch_id: batchId,
          shop_id: shopId,
          validation_status: { in: ['INVALID', 'SKIPPED'] }
        }
      }),
      prisma.bulk_upload_staging.findMany({
        where: {
          batch_id: batchId,
          shop_id: shopId,
          validation_status: { in: ['INVALID', 'SKIPPED'] }
        },
        orderBy: { row_number: 'asc' },
        take: limit
      })
    ]);

    // Build error summary
    const errorSummary: Record<string, number> = {};
    const allRows = await prisma.bulk_upload_staging.findMany({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: { in: ['INVALID', 'SKIPPED'] }
      },
      select: { errors: true }
    });

    for (const row of allRows) {
      const errors = row.errors as unknown as RowError[] || [];
      for (const err of errors) {
        const errType = err.field || 'Unknown';
        errorSummary[errType] = (errorSummary[errType] || 0) + 1;
      }
    }

    return {
      total,
      preview: rows.map((row: any) => ({
        rowNumber: row.row_number,
        productName: row.product_name || undefined,
        errors: row.errors as unknown as RowError[] || [],
        status: row.validation_status === 'SKIPPED' ? 'DUPLICATE' : 'INVALID'
      })),
      errorSummary
    };
  },

  /**
   * Get products that need specs to be added
   */
  async getProductsNeedingSpecs(
    shopId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    products: Array<{
      id: string;
      productName: string;
      categoryName?: string;
      missingSpecs: string[];
      currentSpecs: Record<string, string>;
    }>;
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.shop_products.findMany({
        where: {
          shop_id: shopId,
          listing_status: 'NEEDS_SPECS'
        },
        include: {
          products: {
            select: {
              name: true,
              categories: { select: { name: true } }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.shop_products.count({
        where: {
          shop_id: shopId,
          listing_status: 'NEEDS_SPECS'
        }
      })
    ]);

    // For each product, determine missing specs based on category
    const result = await Promise.all(
      products.map(async (p: any) => {
        const categoryName = p.products.categories?.name || '';
        const currentSpecs = (p.variant_values || p.specs) as Record<string, string> || {};
        
        // Get tech spec rules for this category
        const specRule = await prisma.tech_spec_rules.findFirst({
          where: {
            category_name: { equals: categoryName, mode: 'insensitive' },
            is_active: true
          }
        });

        const requiredSpecs = specRule ? (specRule.required_specs as string[]) : [];
        const currentSpecKeys = Object.keys(currentSpecs).map(k => k.toLowerCase());
        const missingSpecs = requiredSpecs.filter(
          spec => !currentSpecKeys.includes(spec.toLowerCase())
        );

        return {
          id: p.id,
          productName: p.products.name,
          categoryName: categoryName || undefined,
          missingSpecs,
          currentSpecs
        };
      })
    );

    return {
      products: result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Update specs for a product (to complete NEEDS_SPECS products)
   */
  async updateProductSpecs(
    shopProductId: string,
    shopId: string,
    specs: Record<string, string>
  ): Promise<{ success: boolean; newStatus: string }> {
    // Get the product
    const shopProduct = await prisma.shop_products.findFirst({
      where: { id: shopProductId, shop_id: shopId },
      include: {
        products: {
          select: { categories: { select: { name: true } } }
        }
      }
    });

    if (!shopProduct) {
      throw new Error('Product not found');
    }

    // Merge with existing specs
    const existingSpecs = (shopProduct.variant_values || shopProduct.specs) as Record<string, string> || {};
    const mergedSpecs = { ...existingSpecs, ...specs };

    // Check if all required specs are now present
    const categoryName = shopProduct.products.categories?.name || '';
    const specRule = await prisma.tech_spec_rules.findFirst({
      where: {
        category_name: { equals: categoryName, mode: 'insensitive' },
        is_active: true
      }
    });

    const requiredSpecs = specRule ? (specRule.required_specs as string[]) : [];
    const mergedSpecKeys = Object.keys(mergedSpecs).map(k => k.toLowerCase());
    const stillMissing = requiredSpecs.filter(
      spec => !mergedSpecKeys.includes(spec.toLowerCase())
    );

    // Determine new status
    const newStatus = stillMissing.length === 0 ? 'NEEDS_IMAGES' : 'NEEDS_SPECS';

    // Update the product
    await prisma.shop_products.update({
      where: { id: shopProductId },
      data: {
        specs: mergedSpecs,
        variant_values: mergedSpecs,
        listing_status: newStatus as any,
        updated_at: new Date()
      }
    });

    return { success: true, newStatus };
  }
};

export default bulkUploadCorrectionService;

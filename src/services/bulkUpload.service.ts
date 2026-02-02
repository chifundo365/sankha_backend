/**
 * Bulk Upload Service v4.0
 * ========================
 * Dual-template system with staging pipeline and tech spec validation.
 * 
 * Template A: Electronics (Spec: prefixed columns with strict validation)
 * Template B: General (Label_x/Value_x for flexible attributes)
 * 
 * Flow: Upload → Parse → Stage → Validate → Preview → Commit
 */
import * as XLSX from 'xlsx';
import prisma from '../prismaClient';
import { PRICE_MARKUP_MULTIPLIER, calculateDisplayPrice } from '../utils/constants';
import { emailService } from './email.service';
import { bulkUploadSummaryTemplate } from '../templates/email.templates';
import { bulkUploadStagingService } from './bulkUploadStaging.service';
import { techSpecValidator } from './techSpecValidator.service';
import {
  TemplateType,
  ListingStatusV4,
  UploadStatusV4,
  RawExcelRow,
  RowError,
  StagingSummary,
  CommitSummary,
  TECH_CATEGORIES,
  normalizeProductName
} from '../types/bulkUpload.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_ROWS_PER_UPLOAD: 500,
  MAX_FILE_SIZE_MB: 10
};

// Column mapping for the Excel template (v4.0)
const COLUMN_MAPPING = {
  'Product Name': 'product_name',
  'Category': 'category_name',
  'Brand': 'brand',
  'SKU': 'sku',
  'Base Price (MWK)': 'base_price',
  'Stock Quantity': 'stock_quantity',
  'Condition': 'condition',
  'Description': 'shop_description'
} as const;

const REQUIRED_COLUMNS = ['Product Name', 'Base Price (MWK)', 'Stock Quantity'];
const VALID_CONDITIONS = ['NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR'];

// ============================================================================
// TYPES
// ============================================================================

interface ParsedRow {
  rowNumber: number;
  product_name: string;
  category_name?: string;
  brand?: string;
  sku?: string;
  base_price: number;
  stock_quantity: number;
  condition: string;
  shop_description?: string;
  specs?: any;
}

interface UploadResult {
  uploadId: string;
  batchId: string;
  totalRows: number;
  successful: number;
  failed: number;
  skipped: number;
  needsSpecs: number;
  needsImages: number;
  errors: RowError[];
  products: Array<{
    id: string;
    product_name: string;
    sku?: string;
    price: number;
    listing_status: string;
  }>;
}

interface StagingUploadResult {
  uploadId: string;
  batchId: string;
  fileName: string;
  templateType: TemplateType;
  totalRows: number;
  status: string;
  previewUrl: string;
}

// ============================================================================
// BULK UPLOAD SERVICE v4.0
// ============================================================================

export const bulkUploadService = {
  /**
   * Generate Excel template for bulk upload (v4.0 with dual template support)
   */
  generateTemplate(templateType: TemplateType = TemplateType.ELECTRONICS): Buffer {
    const workbook = XLSX.utils.book_new();

    // ========== Instructions Sheet ==========
    const instructions = [
      ['BULK UPLOAD TEMPLATE v4.0 - ' + (templateType === TemplateType.ELECTRONICS ? 'ELECTRONICS' : 'GENERAL')],
      [''],
      ['Required Columns:'],
      ['- Product Name: The name of the product (will be matched to existing catalog or create new)'],
      ['- Base Price (MWK): Your selling price BEFORE platform fees (5.26% markup added automatically)'],
      ['- Stock Quantity: Number of items in stock'],
      [''],
      ['Optional Columns:'],
      ['- Category: Category name (e.g., Smartphones, Laptops)'],
      ['- Brand: Product brand (e.g., Apple, Samsung)'],
      ['- SKU: Your internal product code (auto-generated if blank)'],
      ['- Condition: NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, or USED_FAIR (default: NEW)'],
      ['- Description: Your product description'],
      [''],
    ];

    if (templateType === TemplateType.ELECTRONICS) {
      instructions.push(
        ['ELECTRONICS TEMPLATE - Spec Columns:'],
        ['Use "Spec:" prefix for technical specifications (required for electronics)'],
        ['- Spec: Storage - e.g., 256GB, 512GB'],
        ['- Spec: RAM - e.g., 8GB, 16GB'],
        ['- Spec: Screen Size - e.g., 6.1", 15.6"'],
        ['- Spec: Color - e.g., Black, Space Gray'],
        ['- Spec: Processor - e.g., A17 Pro, M3 Chip'],
        [''],
        ['Missing required specs will result in NEEDS_SPECS status.'],
        ['']
      );
    } else {
      instructions.push(
        ['GENERAL TEMPLATE - Label/Value Columns:'],
        ['Use Label_X / Value_X pairs for flexible attributes'],
        ['- Label_1, Value_1 - First attribute'],
        ['- Label_2, Value_2 - Second attribute'],
        ['- ... up to Label_10, Value_10'],
        [''],
        ['Example: Label_1="Color", Value_1="Red"'],
        ['']
      );
    }

    instructions.push(
      ['PRICING EXAMPLE:'],
      ['If you set Base Price = MWK 100,000'],
      ['Display Price will be = MWK 105,260 (your base price + 5.26% platform fee)'],
      ['You receive = MWK 100,000 when product sells'],
      [''],
      ['STATUS FLOW:'],
      ['1. BROKEN - Invalid data (fix and re-upload)'],
      ['2. NEEDS_SPECS - Missing required specifications (electronics only)'],
      ['3. NEEDS_IMAGES - Add product images'],
      ['4. LIVE - Visible to buyers'],
      [''],
      ['Maximum ' + CONFIG.MAX_ROWS_PER_UPLOAD + ' products per upload.']
    );

    const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
    instructionSheet['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');

    // ========== Products Sheet ==========
    let headers: string[];
    let sampleData: Record<string, any>[];

    if (templateType === TemplateType.ELECTRONICS) {
      headers = [
        'Product Name', 'Category', 'Brand', 'SKU', 'Base Price (MWK)',
        'Stock Quantity', 'Condition', 'Description',
        'Spec: Storage', 'Spec: RAM', 'Spec: Screen Size', 'Spec: Color', 'Spec: Processor'
      ];

      sampleData = [
        {
          'Product Name': 'iPhone 15 Pro Max 256GB',
          'Category': 'Smartphones',
          'Brand': 'Apple',
          'SKU': 'IP15PM-256-BLK',
          'Base Price (MWK)': 1500000,
          'Stock Quantity': 10,
          'Condition': 'NEW',
          'Description': 'Brand new, sealed in box. 1 year warranty.',
          'Spec: Storage': '256GB',
          'Spec: RAM': '8GB',
          'Spec: Screen Size': '6.7"',
          'Spec: Color': 'Black Titanium',
          'Spec: Processor': 'A17 Pro'
        },
        {
          'Product Name': 'Samsung Galaxy S24 Ultra',
          'Category': 'Smartphones',
          'Brand': 'Samsung',
          'SKU': 'SGS24U-512-GRY',
          'Base Price (MWK)': 1350000,
          'Stock Quantity': 5,
          'Condition': 'NEW',
          'Description': 'Factory unlocked. Includes S Pen.',
          'Spec: Storage': '512GB',
          'Spec: RAM': '12GB',
          'Spec: Screen Size': '6.8"',
          'Spec: Color': 'Titanium Gray',
          'Spec: Processor': 'Snapdragon 8 Gen 3'
        },
        {
          'Product Name': 'MacBook Air M3',
          'Category': 'Laptops',
          'Brand': 'Apple',
          'SKU': '',
          'Base Price (MWK)': 2100000,
          'Stock Quantity': 3,
          'Condition': 'REFURBISHED',
          'Description': 'Certified refurbished. 90-day warranty.',
          'Spec: Storage': '512GB SSD',
          'Spec: RAM': '16GB',
          'Spec: Screen Size': '13.6"',
          'Spec: Color': 'Space Gray',
          'Spec: Processor': 'M3 Chip'
        }
      ];
    } else {
      headers = [
        'Product Name', 'Category', 'Brand', 'SKU', 'Base Price (MWK)',
        'Stock Quantity', 'Condition', 'Description',
        'Label_1', 'Value_1', 'Label_2', 'Value_2', 'Label_3', 'Value_3',
        'Label_4', 'Value_4', 'Label_5', 'Value_5'
      ];

      sampleData = [
        {
          'Product Name': 'Leather Office Chair',
          'Category': 'Furniture',
          'Brand': 'ErgoMax',
          'SKU': 'CHAIR-001',
          'Base Price (MWK)': 85000,
          'Stock Quantity': 15,
          'Condition': 'NEW',
          'Description': 'Ergonomic office chair with lumbar support.',
          'Label_1': 'Material', 'Value_1': 'Genuine Leather',
          'Label_2': 'Color', 'Value_2': 'Black',
          'Label_3': 'Weight Capacity', 'Value_3': '120kg',
          'Label_4': 'Adjustable Height', 'Value_4': 'Yes',
          'Label_5': 'Warranty', 'Value_5': '2 Years'
        },
        {
          'Product Name': 'Nike Air Max 90',
          'Category': 'Footwear',
          'Brand': 'Nike',
          'SKU': 'NIKE-AM90-42',
          'Base Price (MWK)': 125000,
          'Stock Quantity': 8,
          'Condition': 'NEW',
          'Description': 'Classic Air Max 90 sneakers.',
          'Label_1': 'Size', 'Value_1': '42',
          'Label_2': 'Color', 'Value_2': 'White/Red',
          'Label_3': 'Material', 'Value_3': 'Leather/Mesh',
          'Label_4': '', 'Value_4': '',
          'Label_5': '', 'Value_5': ''
        }
      ];
    }

    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    
    // Set column widths
    worksheet['!cols'] = headers.map(h => ({
      wch: Math.max(h.length + 5, 15)
    }));

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  },

  /**
   * Parse uploaded Excel file (v4.0 - returns raw rows for staging)
   */
  parseExcelFile(fileBuffer: Buffer): { 
    rows: Array<{ raw: RawExcelRow; rowNumber: number }>; 
    headers: string[];
    errors: RowError[];
    templateType: TemplateType;
  } {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      
      // Get the Products sheet (or first non-instruction sheet)
      let sheetName = 'Products';
      if (!workbook.SheetNames.includes('Products')) {
        sheetName = workbook.SheetNames.find(s => s !== 'Instructions') || workbook.SheetNames[0];
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: RawExcelRow[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        return {
          rows: [],
          headers: [],
          errors: [{ row: 0, field: 'file', message: 'No data found in the file' }],
          templateType: TemplateType.AUTO
        };
      }

      // Get headers from first row
      const headers = Object.keys(rawRows[0]);

      // Detect template type
      const templateType = bulkUploadStagingService.detectTemplateType(headers);

      // Map rows with row numbers
      const rows = rawRows
        .map((raw, index) => ({
          raw,
          rowNumber: index + 2 // Excel row number (1-indexed + header)
        }))
        .filter(({ raw }) => {
          // Filter out empty rows
          const productName = raw['Product Name'] || raw['product_name'];
          const basePrice = raw['Base Price (MWK)'] || raw['base_price'];
          return productName || basePrice;
        });

      // Check for required columns
      const errors: RowError[] = [];
      const firstRow = rawRows[0];
      
      for (const col of REQUIRED_COLUMNS) {
        if (!(col in firstRow)) {
          // Check alternate names
          const altCol = col.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');
          if (!(altCol in firstRow)) {
            errors.push({ row: 0, field: col, message: `Missing required column: ${col}` });
          }
        }
      }

      // Check row limit
      if (rows.length > CONFIG.MAX_ROWS_PER_UPLOAD) {
        errors.push({
          row: 0,
          field: 'file',
          message: `Too many rows. Maximum ${CONFIG.MAX_ROWS_PER_UPLOAD} products per upload. Found ${rows.length}.`
        });
      }

      return { rows, headers, errors, templateType };
    } catch (error: any) {
      return {
        rows: [],
        headers: [],
        errors: [{ row: 0, field: 'file', message: error.message || 'Failed to parse Excel file' }],
        templateType: TemplateType.AUTO
      };
    }
  },

  /**
   * Stage upload for preview (v4.0 - new staging workflow)
   */
  async stageUpload(
    shopId: string,
    fileName: string,
    fileBuffer: Buffer
  ): Promise<StagingUploadResult> {
    // Parse file
    const { rows, headers, errors, templateType } = this.parseExcelFile(fileBuffer);

    if (errors.length > 0 && rows.length === 0) {
      throw new Error(errors.map(e => e.message).join('; '));
    }

    // Generate batch ID
    const batchId = bulkUploadStagingService.generateBatchId(shopId);

    // Create bulk upload record with STAGING status
    const upload = await prisma.bulk_uploads.create({
      data: {
        shop_id: shopId,
        file_name: fileName,
        batch_id: batchId,
        template_type: templateType,
        total_rows: rows.length,
        status: 'STAGING'
      }
    });

    // Insert rows into staging table
    await bulkUploadStagingService.insertStagingRows(
      batchId,
      upload.id,
      shopId,
      rows,
      templateType
    );

    // Validate staging rows
    const summary = await bulkUploadStagingService.validateStagingBatch(batchId, shopId);

    // Update upload with validation results
    await prisma.bulk_uploads.update({
      where: { id: upload.id },
      data: {
        successful: summary.valid,
        failed: summary.invalid,
        needs_specs: summary.willNeedSpecs,
        needs_images: summary.willNeedImages
      }
    });

    return {
      uploadId: upload.id,
      batchId,
      fileName,
      templateType,
      totalRows: rows.length,
      status: 'STAGING',
      previewUrl: `/api/bulk-upload/preview/${batchId}`
    };
  },

  /**
   * Get staging preview
   */
  async getPreview(
    batchId: string,
    page: number = 1,
    limit: number = 50,
    filter: 'all' | 'valid' | 'invalid' = 'all'
  ) {
    return bulkUploadStagingService.getPreview(batchId, page, limit, filter);
  },

  /**
   * Get correction CSV for invalid rows
   */
  async getCorrectionCSV(batchId: string): Promise<Buffer> {
    const correctionData = await bulkUploadStagingService.getCorrectionData(batchId);
    
    if (correctionData.length === 0) {
      throw new Error('No invalid rows to correct');
    }

    const worksheet = XLSX.utils.json_to_sheet(correctionData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Corrections');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  },

  /**
   * Commit staging batch to production
   */
  async commitBatch(shopId: string, batchId: string): Promise<CommitSummary> {
    return bulkUploadStagingService.commitBatch(shopId, batchId);
  },

  /**
   * Cancel staging batch
   */
  async cancelBatch(batchId: string): Promise<void> {
    return bulkUploadStagingService.cancelBatch(batchId);
  },

  /**
   * Process bulk upload (v4.0 - direct processing without staging)
   * For backwards compatibility and CLI usage
   */
      
      // Validate condition
      let condition = String(row['Condition'] || 'NEW').toUpperCase().trim();
      if (!VALID_CONDITIONS.includes(condition)) {
        rowErrors.push({ 
          row: rowNumber, 
          field: 'Condition', 
          message: `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(', ')}` 
        });
        condition = 'NEW'; // Default to NEW if invalid
      }
      
      // Parse specs JSON
      let specs = null;
      const specsRaw = row['Specs (JSON)'];
      if (specsRaw) {
        try {
          specs = typeof specsRaw === 'string' ? JSON.parse(specsRaw) : specsRaw;
        } catch (e) {
          rowErrors.push({ row: rowNumber, field: 'Specs', message: 'Invalid JSON format in Specs column' });
        }
      }
      
      // If there are errors for this row, add to errors array
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        return;
      }
      
      // Add valid row
      rows.push({
        rowNumber,
        product_name: productName,
        category_name: String(row['Category'] || '').trim() || undefined,
        brand: String(row['Brand'] || '').trim() || undefined,
        sku: String(row['SKU'] || '').trim() || undefined,
        base_price: basePrice,
        stock_quantity: stockQuantity,
        condition,
        shop_description: String(row['Description'] || '').trim() || undefined,
        specs
      });
    });
    
    return { rows, errors };
  },

  /**
   * Process bulk upload and create shop products
   */

  async processBulkUpload(
    shopId: string,
    fileName: string,
    parsedRows: ParsedRow[],
    parseErrors: RowError[]
  ): Promise<UploadResult> {
    const errors: RowError[] = [...parseErrors];
    const createdProducts: UploadResult['products'] = [];
    let successful = 0;
    let failed = parseErrors.length;
    let skipped = 0;
    let needsSpecs = 0;
    let needsImages = 0;

    // Fetch shop for code
    const shop = await prisma.shops.findUnique({ where: { id: shopId } });
    let shopCode = 'SHOP';
    if (shop && shop.name) {
      shopCode = shop.name.replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase();
    }
    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let skuSeq = 1;

    // Create bulk upload record
    const bulkUpload = await prisma.bulk_uploads.create({
      data: {
        shop_id: shopId,
        file_name: fileName,
        batch_id: bulkUploadStagingService.generateBatchId(shopId),
        total_rows: parsedRows.length + parseErrors.length,
        status: 'PROCESSING'
      }
    });

    // Process each row
    for (const row of parsedRows) {
      try {
        // Auto-generate SKU if missing
        let sku = row.sku && row.sku.trim() ? row.sku.trim() : null;
        if (!sku) {
          // Find next available SKU for this shop/date
          let candidateSku;
          let exists = true;
          let tryCount = 0;
          do {
            candidateSku = `${shopCode}-${dateCode}-${String(skuSeq).padStart(3, '0')}`;
            // Check if SKU exists for this shop
            const existingSku = await prisma.shop_products.findFirst({
              where: { shop_id: shopId, sku: candidateSku }
            });
            if (!existingSku) {
              exists = false;
              sku = candidateSku;
            } else {
              skuSeq++;
              tryCount++;
            }
          } while (exists && tryCount < 1000);
          if (!sku) {
            errors.push({
              row: row.rowNumber,
              field: 'SKU',
              message: 'Could not auto-generate unique SKU for this product.'
            });
            failed++;
            continue;
          }
          skuSeq++;
        }

        // Smart Match: Try to find existing product by name match
        const matchResult = await bulkUploadStagingService.findMatchingProduct(
          row.product_name,
          row.brand
        );

        let product;
        if (matchResult.found && matchResult.productId) {
          product = await prisma.products.findUnique({ 
            where: { id: matchResult.productId } 
          });
        }

        // If no existing product, create a new one (pending approval)
        if (!product) {
          // Find or create category
          let categoryId: string | null = null;
          if (row.category_name) {
            const category = await prisma.categories.findFirst({
              where: { name: { contains: row.category_name, mode: 'insensitive' } }
            });
            categoryId = category?.id || null;
          }

          // Create new product (pending admin approval)
          product = await prisma.products.create({
            data: {
              name: row.product_name,
              normalized_name: normalizeProductName(row.product_name),
              brand: row.brand,
              category_id: categoryId,
              base_price: row.base_price,
              status: 'PENDING',
              is_verified: false,
              images: []
            }
          });
        }

        // Check for duplicate SKU in this shop
        if (sku) {
          const existingSku = await prisma.shop_products.findFirst({
            where: {
              shop_id: shopId,
              sku: sku
            }
          });

          if (existingSku) {
            skipped++;
            errors.push({
              row: row.rowNumber,
              field: 'SKU',
              message: `Duplicate SKU "${sku}" already exists in your shop`
            });
            continue;
          }
        }

        // Check if this exact product already exists in this shop
        const existingShopProduct = await prisma.shop_products.findFirst({
          where: {
            shop_id: shopId,
            product_id: product.id
          }
        });

        if (existingShopProduct) {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'Product Name',
            message: `Product "${row.product_name}" already exists in your shop inventory`
          });
          continue;
        }

        // Validate specs for tech categories
        const specResult = await techSpecValidator.validateSpecs(
          product.category_id,
          row.category_name,
          row.specs || {}
        );

        // Determine listing status
        let listingStatus: string;
        if (specResult.isTechCategory && !specResult.isValid) {
          listingStatus = 'NEEDS_SPECS';
          needsSpecs++;
        } else {
          listingStatus = 'NEEDS_IMAGES';
          needsImages++;
        }

        // Calculate display price
        const displayPrice = calculateDisplayPrice(row.base_price);

        // Create shop product with appropriate status
        const shopProduct = await prisma.shop_products.create({
          data: {
            shop_id: shopId,
            product_id: product.id,
            sku: sku,
            base_price: row.base_price,
            price: displayPrice,
            stock_quantity: row.stock_quantity,
            condition: row.condition as any,
            shop_description: row.shop_description,
            specs: specResult.normalizedValues,
            variant_values: specResult.normalizedValues,
            images: [],
            is_available: false,
            listing_status: listingStatus,
            bulk_upload_id: bulkUpload.id
          }
        });

        successful++;
        createdProducts.push({
          id: shopProduct.id,
          product_name: row.product_name,
          sku: sku || undefined,
          price: displayPrice,
          listing_status: listingStatus
        });

      } catch (error) {
        failed++;
        console.error(`Error processing row ${row.rowNumber}:`, error);
        errors.push({
          row: row.rowNumber,
          field: 'system',
          message: `Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    // Update bulk upload record
    await prisma.bulk_uploads.update({
      where: { id: bulkUpload.id },
      data: {
        successful,
        failed,
        skipped,
        needs_specs: needsSpecs,
        needs_images: needsImages,
        errors: errors.length > 0 ? JSON.parse(JSON.stringify(errors)) : undefined,
        status: 'COMPLETED',
        completed_at: new Date()
      }
    });

    return {
      uploadId: bulkUpload.id,
      batchId: bulkUpload.batch_id || '',
      totalRows: parsedRows.length + parseErrors.length,
      successful,
      failed,
      skipped,
      needsSpecs,
      needsImages,
      errors,
      products: createdProducts
    };
  },

  /**
   * Get products that need specs for a shop (v4.0)
   */
  async getProductsNeedingSpecs(shopId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [products, totalCount] = await Promise.all([
      prisma.shop_products.findMany({
        where: {
          shop_id: shopId,
          listing_status: 'NEEDS_SPECS'
        },
        include: {
          products: {
            select: {
              name: true,
              brand: true,
              categories: {
                select: { name: true }
              }
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
    
    return {
      products: products.map(p => ({
        id: p.id,
        product_name: p.products.name,
        brand: p.products.brand,
        category: p.products.categories?.name,
        sku: p.sku,
        base_price: p.base_price,
        display_price: p.price,
        stock_quantity: p.stock_quantity,
        condition: p.condition,
        specs: p.specs,
        variant_values: p.variant_values,
        listing_status: p.listing_status,
        created_at: p.created_at
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    };
  },
            shop_id: shopId,
            product_id: product.id,
            sku: sku,
            base_price: row.base_price,
            price: displayPrice,
            stock_quantity: row.stock_quantity,
            condition: row.condition as any,
            shop_description: row.shop_description,
            specs: row.specs,
            images: [],
            is_available: false, // Not available until images are added
            listing_status: 'NEEDS_IMAGES',
            bulk_upload_id: bulkUpload.id
          }
        });

        successful++;
        createdProducts.push({
          id: shopProduct.id,
          product_name: row.product_name,
          sku: sku,
          price: displayPrice,
          listing_status: 'NEEDS_IMAGES'
        });

      } catch (error) {
        failed++;
        console.error(`Error processing row ${row.rowNumber}:`, error);
        errors.push({
          row: row.rowNumber,
          field: 'system',
          message: `Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    // Update bulk upload record
    await prisma.bulk_uploads.update({
      where: { id: bulkUpload.id },
      data: {
        successful,
        failed,
        skipped,
        errors: errors.length > 0 ? JSON.parse(JSON.stringify(errors)) : undefined,
        status: 'COMPLETED',
        completed_at: new Date()
      }
    });

    return {
      uploadId: bulkUpload.id,
      totalRows: parsedRows.length + parseErrors.length,
      successful,
      failed,
      skipped,
      errors,
      products: createdProducts
    };
  },

  /**
   * Get products that need images for a shop
   */
  async getProductsNeedingImages(shopId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [products, totalCount] = await Promise.all([
      prisma.shop_products.findMany({
        where: {
          shop_id: shopId,
          listing_status: 'NEEDS_IMAGES'
        },
        include: {
          products: {
            select: {
              name: true,
              brand: true,
              categories: {
                select: { name: true }
              }
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
          listing_status: 'NEEDS_IMAGES'
        }
      })
    ]);
    
    return {
      products: products.map(p => ({
        id: p.id,
        product_name: p.products.name,
        brand: p.products.brand,
        category: p.products.categories?.name,
        sku: p.sku,
        base_price: p.base_price,
        display_price: p.price,
        stock_quantity: p.stock_quantity,
        condition: p.condition,
        listing_status: p.listing_status,
        created_at: p.created_at
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    };
  },

  /**
   * Get product counts by listing status
   */
  async getStatusCounts(shopId: string) {
    const counts = await prisma.shop_products.groupBy({
      by: ['listing_status'],
      where: { shop_id: shopId },
      _count: true
    });

    const result: Record<string, number> = {
      BROKEN: 0,
      NEEDS_SPECS: 0,
      NEEDS_IMAGES: 0,
      LIVE: 0,
      PAUSED: 0
    };

    for (const c of counts) {
      result[c.listing_status || 'NEEDS_IMAGES'] = c._count;
    }

    return result;
  },

  /**
   * Get bulk upload history for a shop
   */
  async getUploadHistory(shopId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    
    const [uploads, totalCount] = await Promise.all([
      prisma.bulk_uploads.findMany({
        where: { shop_id: shopId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.bulk_uploads.count({
        where: { shop_id: shopId }
      })
    ]);
    
    return {
      uploads,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    };
  },

  /**
   * Send upload summary email to seller
   */
  async sendUploadSummaryEmail(
    sellerEmail: string,
    sellerName: string,
    result: UploadResult
  ) {
    const subject = `Bulk Upload Complete - ${result.successful} products added`;
    let htmlSummary = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a237e;">📦 Bulk Upload Complete</h2>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Upload Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #ddd;">Total Rows:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">${result.totalRows}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #ddd; color: #2e7d32;">✓ Successful:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold; color: #2e7d32;">${result.successful}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #ddd; color: #f57c00;">⚠ Skipped:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold; color: #f57c00;">${result.skipped}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #c62828;">✗ Failed:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #c62828;">${result.failed}</td>
            </tr>
          </table>
        </div>
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800; margin: 20px 0;">
          <strong>⚠️ Next Step Required:</strong>
          <p style="margin: 10px 0 0;">Your products have been created with <strong>\"Needs Images\"</strong> status. Please add images to each product to make them visible to buyers.</p>
        </div>
    `;
    if (result.errors.length > 0 && result.errors.length <= 10) {
      htmlSummary += `
        <div style="margin-top: 20px;">
          <h3>Errors & Issues</h3>
          <ul style="padding-left: 20px;">
            ${result.errors.map(e => `<li>Row ${e.row}: ${e.message}</li>`).join('')}
          </ul>
        </div>
      `;
    } else if (result.errors.length > 10) {
      htmlSummary += `
        <div style="margin-top: 20px;">
          <h3>Errors & Issues (showing first 10 of ${result.errors.length})</h3>
          <ul style="padding-left: 20px;">
            ${result.errors.slice(0, 10).map(e => `<li>Row ${e.row}: ${e.message}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    htmlSummary += `
        <p style="margin-top: 30px; color: #666;">
          Thank you for using Sankha!<br>
          <a href="${process.env.FRONTEND_URL}/seller/products/needs-images" style="color: #1a237e;">
            Add Images to Your Products →
          </a>
        </p>
      </div>
    `;
    const textSummary = `Bulk Upload Complete\n\nTotal Rows: ${result.totalRows}\nSuccessful: ${result.successful}\nSkipped: ${result.skipped}\nFailed: ${result.failed}\nNeeds Specs: ${result.needsSpecs || 0}\nNeeds Images: ${result.needsImages || 0}\n\nNext Step: Complete any missing specs, then add images to make products live.`;
    const email = bulkUploadSummaryTemplate({
      userName: sellerName,
      subject,
      htmlSummary,
      textSummary,
      ctaText: 'Complete Your Products',
      ctaUrl: `${process.env.FRONTEND_URL}/seller/products/incomplete`
    });
    await emailService.send({
      to: sellerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text
    });
  },

  /**
   * Update product specs (for NEEDS_SPECS items)
   */
  async updateProductSpecs(
    shopProductId: string,
    specs: Record<string, string>
  ): Promise<{ success: boolean; newStatus: string; missingSpecs?: string[] }> {
    // Get shop product with category
    const shopProduct = await prisma.shop_products.findUnique({
      where: { id: shopProductId },
      include: {
        products: {
          include: {
            categories: true
          }
        }
      }
    });

    if (!shopProduct) {
      throw new Error('Shop product not found');
    }

    // Merge existing specs with new ones
    const existingSpecs = (shopProduct.variant_values || {}) as Record<string, string>;
    const mergedSpecs = { ...existingSpecs, ...specs };

    // Validate updated specs
    const specResult = await techSpecValidator.validateSpecs(
      shopProduct.products.category_id,
      shopProduct.products.categories?.name,
      mergedSpecs
    );

    // Determine new status
    let newStatus = shopProduct.listing_status;
    if (specResult.isTechCategory) {
      if (specResult.isValid) {
        // Move to NEEDS_IMAGES if specs are now complete
        newStatus = 'NEEDS_IMAGES';
      } else {
        // Stay in NEEDS_SPECS
        newStatus = 'NEEDS_SPECS';
      }
    }

    // Update shop product
    await prisma.shop_products.update({
      where: { id: shopProductId },
      data: {
        specs: specResult.normalizedValues,
        variant_values: specResult.normalizedValues,
        listing_status: newStatus
      }
    });

    return {
      success: true,
      newStatus,
      missingSpecs: specResult.missingRequired.length > 0 ? specResult.missingRequired : undefined
    };
  },

  /**
   * Get required specs for a category
   */
  async getRequiredSpecs(categoryName: string) {
    return techSpecValidator.getRuleForCategory(categoryName);
  }
};

// Export types
export type { ParsedRow, RowError, UploadResult, StagingUploadResult };
export { TemplateType } from '../types/bulkUpload.types';

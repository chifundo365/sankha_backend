/**
 * Bulk Upload Service
 * ===================
 * Handles Excel template generation, parsing, and product creation.
 * 
 * Flow: Upload → Parse → Match/Create Products → Create Shop Products
 */
import * as XLSX from 'xlsx';
import prisma from '../prismaClient';
import { Prisma, listing_status, upload_status, product_condition } from '../../generated/prisma';
import { PRICE_MARKUP_MULTIPLIER, calculateDisplayPrice } from '../utils/constants';
import { emailService } from './email.service';
import { bulkUploadSummaryTemplate } from '../templates/email.templates';
import { normalizeProductName } from '../types/bulkUpload.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

type BulkConfig = {
  MAX_ROWS_PER_UPLOAD: number;
  MAX_FILE_SIZE_MB: number;
  CATEGORY_FUZZY_THRESHOLD: number;
};

const CONFIG: BulkConfig = {
  MAX_ROWS_PER_UPLOAD: Number(process.env.BULK_UPLOAD_MAX_ROWS) || 1000,
  MAX_FILE_SIZE_MB: 10,
  CATEGORY_FUZZY_THRESHOLD: parseFloat(process.env.CATEGORY_FUZZY_THRESHOLD || '0.6')
};

// Column mapping for the Excel template
const COLUMN_MAPPING: Record<string, string> = {
  'Product Name': 'product_name',
  'Category': 'category_name',
  'Brand': 'brand',
  'SKU': 'sku',
  'Base Price (MWK)': 'base_price',
  'Stock Quantity': 'stock_quantity',
  'Condition': 'condition',
  'Description': 'shop_description'
};

const REQUIRED_COLUMNS = ['Product Name', 'Category', 'Base Price (MWK)', 'Stock Quantity', 'Brand', 'Description', 'Condition'];
const VALID_CONDITIONS: product_condition[] = ['NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR'];

// ============================================================================
// TYPES
// ============================================================================

interface RowError {
  row: number;
  field: string;
  message: string;
}

interface ParsedRow {
  rowNumber: number;
  product_name: string;
  normalized_name: string;
  category_name?: string;
  brand: string;
  sku?: string;
  base_price: number;
  stock_quantity: number;
  condition: product_condition;
  shop_description: string;
  specs?: Record<string, string>;
}

interface UploadResult {
  uploadId: string;
  batchId: string;
  totalRows: number;
  successful: number;
  failed: number;
  skipped: number;
  needs_specs?: number;
  needs_images?: number;
  errors: RowError[];
  products: Array<{
    id: string;
    product_name: string;
    sku?: string | null;
    price: number;
    listing_status: string;
  }>;
}

interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
}

// ============================================================================
// SERVICE
// ============================================================================

export const bulkUploadService = {
  /**
   * Generate Excel template for bulk upload
   */
  generateTemplate(): Buffer {
    // Sample data showing both standard and spec columns
    const sampleData = [
      {
        'Product Name': 'Samsung Galaxy S24 Ultra',
        'Category': 'Smartphones',
        'Brand': 'Samsung',
        'SKU': '',
        'Base Price (MWK)': 850000,
        'Stock Quantity': 5,
        'Condition': 'NEW',
        'Description': 'Latest Samsung flagship with S Pen',
        'Spec: Storage': '256GB',
        'Spec: RAM': '12GB',
        'Spec: Screen Size': '6.8"',
        'Spec: Color': 'Titanium Black'
      },
      {
        'Product Name': 'iPhone 15 Pro Max',
        'Category': 'Smartphones',
        'Brand': 'Apple',
        'SKU': '',
        'Base Price (MWK)': 1200000,
        'Stock Quantity': 3,
        'Condition': 'NEW',
        'Description': 'Apple flagship phone',
        'Spec: Storage': '512GB',
        'Spec: RAM': '8GB',
        'Spec: Screen Size': '6.7"',
        'Spec: Color': 'Natural Titanium'
      },
      {
        'Product Name': 'Generic Office Chair',
        'Category': 'Furniture',
        'Brand': 'Acme',
        'SKU': 'CHAIR-001',
        'Base Price (MWK)': 45000,
        'Stock Quantity': 10,
        'Condition': 'NEW',
        'Description': 'Comfortable office chair',
        'Label_1': 'Material',
        'Value_1': 'Mesh',
        'Label_2': 'Color',
        'Value_2': 'Black'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    // Add instructions sheet
    const maxRows = process.env.BULK_UPLOAD_MAX_ROWS || '1000';

    const instructionData = [
      ['Sankha Bulk Upload Template - Instructions'],
      [''],
      ['REQUIRED COLUMNS (must have data):'],
      ['• Product Name - Name of the product'],
      ['• Category - Product category (e.g., Smartphones, Laptops)'],
      ['• Base Price (MWK) - Your selling price (platform fee will be added)'],
      ['• Stock Quantity - Number of items in stock'],
      ['• Brand - Brand name (e.g., Samsung, Apple)'],
      ['• Condition - NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, USED_FAIR'],
      ['• Description - Product description'],
      [''],
      ['OPTIONAL COLUMNS:'],
      ['• SKU - Your product code (auto-generated if empty)'],
      [''],
      ['FOR ELECTRONICS (Tech specs):'],
      ['• Use "Spec: [Name]" columns (e.g., "Spec: Storage", "Spec: RAM")'],
      ['• Common specs: Storage, RAM, Screen Size, Battery, Color'],
      [''],
      ['FOR GENERAL PRODUCTS:'],
      ['• Use Label_1/Value_1, Label_2/Value_2 pairs for attributes'],
      [''],
      ['NOTES:'],
      ['• Products start with "Needs Images" status'],
      ['• Add images to make products visible to buyers'],
      ['• Maximum ' + maxRows + ' products per upload']
    ];

    const instructionSheet = XLSX.utils.aoa_to_sheet(instructionData);
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  },

  /**
   * Parse Excel file and extract product data
   */
  parseExcelFile(buffer: Buffer): ParseResult {
    const errors: RowError[] = [];
    const rows: ParsedRow[] = [];

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawData.length === 0) {
        return { rows: [], errors: [{ row: 0, field: 'file', message: 'No data found in file' }] };
      }

      // Check for required columns
      const headers = Object.keys(rawData[0] || {});
      const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
      if (missingColumns.length > 0) {
        return {
          rows: [],
          errors: [{
            row: 0,
            field: 'headers',
            message: `Missing required columns: ${missingColumns.join(', ')}`
          }]
        };
      }

      // Parse each row
      for (let i = 0; i < rawData.length; i++) {
        const rawRow = rawData[i];
        const rowNumber = i + 2; // Excel rows start at 1, header is row 1
        const rowErrors: RowError[] = [];

        // Extract and validate required fields
        const productName = String(rawRow['Product Name'] || '').trim();
        if (!productName) {
          rowErrors.push({ row: rowNumber, field: 'Product Name', message: 'Product name is required' });
        }

        const basePrice = parseFloat(rawRow['Base Price (MWK)']);
        if (isNaN(basePrice) || basePrice <= 0) {
          rowErrors.push({ row: rowNumber, field: 'Base Price (MWK)', message: 'Valid price is required' });
        }

        const stockQty = parseInt(rawRow['Stock Quantity']);
        if (isNaN(stockQty) || stockQty < 0) {
          rowErrors.push({ row: rowNumber, field: 'Stock Quantity', message: 'Valid stock quantity is required' });
        }

        // Validate condition (required and must be in allowed list)
        let condition: product_condition = 'NEW';
        const rawCondition = String(rawRow['Condition'] || '').toUpperCase().trim();
        if (!rawCondition) {
          rowErrors.push({ row: rowNumber, field: 'Condition', message: 'Condition is required' });
        } else if (!VALID_CONDITIONS.includes(rawCondition as product_condition)) {
          rowErrors.push({
            row: rowNumber,
            field: 'Condition',
            message: `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(', ')}`
          });
        } else {
          condition = rawCondition as product_condition;
        }

        // Category is required
        const categoryVal = String(rawRow['Category'] || '').trim();
        if (!categoryVal) {
          rowErrors.push({ row: rowNumber, field: 'Category', message: 'Category is required' });
        }

        // Brand is required
        const brandVal = String(rawRow['Brand'] || '').trim();
        if (!brandVal) {
          rowErrors.push({ row: rowNumber, field: 'Brand', message: 'Brand is required' });
        }

        // Description is required
        const descriptionVal = String(rawRow['Description'] || '').trim();
        if (!descriptionVal) {
          rowErrors.push({ row: rowNumber, field: 'Description', message: 'Description is required' });
        }

        // If row has errors, skip it
        if (rowErrors.length > 0) {
          errors.push(...rowErrors);
          continue;
        }

        // Extract specs (Spec: columns, Label_x/Value_x pairs, or any non-standard column)
        const standardColumns = Object.keys(COLUMN_MAPPING);
        const specs: Record<string, string> = {};
        
        for (const key of Object.keys(rawRow)) {
          // Method 1: Explicit "Spec: " prefix
          if (key.startsWith('Spec: ')) {
            const specName = key.replace('Spec: ', '').trim();
            const specValue = String(rawRow[key] || '').trim();
            if (specValue) {
              specs[specName] = specValue;
            }
          }
          // Method 2: Label_x/Value_x pairs
          else if (key.startsWith('Label_')) {
            const num = key.replace('Label_', '');
            const valueKey = `Value_${num}`;
            const label = String(rawRow[key] || '').trim();
            const value = String(rawRow[valueKey] || '').trim();
            if (label && value) {
              specs[label] = value;
            }
          }
          // Method 3: Any column not in standard mapping (e.g., RAM, Storage, Processor)
          else if (!standardColumns.includes(key) && key.trim()) {
            const specValue = String(rawRow[key] || '').trim();
            // Only include if non-empty, let validator detect truly missing columns
            if (specValue) {
              specs[key] = specValue;
            }
          }
        }

        // Build parsed row
        const parsedRow: ParsedRow = {
          rowNumber,
          product_name: productName,
          normalized_name: normalizeProductName(productName),
          category_name: String(rawRow['Category'] || '').trim() || undefined,
          brand: brandVal,
          sku: String(rawRow['SKU'] || '').trim() || undefined,
          base_price: basePrice,
          stock_quantity: stockQty,
          condition,
          shop_description: descriptionVal,
          specs: Object.keys(specs).length > 0 ? specs : undefined
        };

        rows.push(parsedRow);
      }

      return { rows, errors };
    } catch (error) {
      console.error('Parse Excel error:', error);
      return {
        rows: [],
        errors: [{ row: 0, field: 'file', message: 'Failed to parse Excel file' }]
      };
    }
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

    // Create bulk upload record
    const bulkUpload = await prisma.bulk_uploads.create({
      data: {
        shop_id: shopId,
        file_name: fileName,
        total_rows: parsedRows.length + parseErrors.length,
        status: 'PROCESSING' as upload_status
      }
    });

    // Get shop for SKU generation
    const shop = await prisma.shops.findUnique({
      where: { id: shopId },
      select: { name: true }
    });
    const shopCode = this.generateShopCode(shop?.name || 'SHOP');

    // Process each row
    for (const row of parsedRows) {
      try {
        const normalizedName = row.normalized_name || normalizeProductName(row.product_name);

        // DUPLICATE DETECTION - Check if shop already has this product by normalized name
        const existingShopProduct = await prisma.shop_products.findFirst({
          where: {
            shop_id: shopId,
            products: {
              normalized_name: normalizedName
            }
          },
          include: {
            products: { select: { name: true } }
          }
        });

        if (existingShopProduct) {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'Product Name',
            message: `Duplicate: You already have "${existingShopProduct.products.name}" in your shop`
          });
          continue;
        }

        // Also check by SKU if provided
        if (row.sku) {
          const existingBySku = await prisma.shop_products.findFirst({
            where: {
              shop_id: shopId,
              sku: row.sku
            }
          });
          if (existingBySku) {
            skipped++;
            errors.push({
              row: row.rowNumber,
              field: 'SKU',
              message: `Duplicate: SKU "${row.sku}" already exists in your shop`
            });
            continue;
          }
        }

        // Find or create the master product
        let product = await prisma.products.findFirst({
          where: {
            normalized_name: normalizedName,
            OR: [
              { status: 'APPROVED' },
              { status: 'PENDING' }
            ]
          }
        });

        // Get category ID (category is required and must exist)
        let categoryId: string | null = null;
        if (row.category_name) {
          // Try exact case-insensitive match first
          const category = await prisma.categories.findFirst({
            where: {
              name: { equals: row.category_name, mode: 'insensitive' }
            }
          });
          categoryId = category?.id || null;

          // If not found, try fuzzy matching (pg_trgm) with configured threshold
          if (!categoryId) {
            try {
              const threshold = Number(CONFIG.CATEGORY_FUZZY_THRESHOLD) || 0.6;
              // Use similarity() from pg_trgm; if pg_trgm not available this will fail and be caught
              const fuzzyRes: Array<{ id: string; name: string; sim: number }> = await prisma.$queryRaw`
                SELECT id, name, similarity(name, ${row.category_name}) as sim
                FROM categories
                WHERE similarity(name, ${row.category_name}) > ${threshold}
                ORDER BY sim DESC
                LIMIT 1
              ` as any;

              if (fuzzyRes && fuzzyRes.length > 0) {
                categoryId = fuzzyRes[0].id;
                // Inform in errors/warnings that fuzzy match was used
                errors.push({
                  row: row.rowNumber,
                  field: 'Category',
                  message: `Category "${row.category_name}" matched to "${fuzzyRes[0].name}" (fuzzy)`
                });
              }
            } catch (e) {
              // pg_trgm not available or query failed — fall through to local fallback
            }
          }

          // If still not found, create an auto-created category marked for review (not public)
          if (!categoryId) {
            const newCat = await prisma.categories.create({
              data: {
                name: row.category_name,
                description: 'Auto-created from bulk upload',
                is_active: false
              }
            });
            categoryId = newCat.id;
            errors.push({
              row: row.rowNumber,
              field: 'Category',
              message: `Category "${row.category_name}" was not found — auto-created as "${newCat.name}" and flagged for review.`
            });
          }
        }

        if (!product) {
          // Create new master product
          product = await prisma.products.create({
            data: {
              name: row.product_name,
              normalized_name: normalizedName,
              brand: row.brand || null,
              category_id: categoryId,
              description: row.shop_description || null,
              status: 'PENDING'
            }
          });
        }

        // Generate SKU if not provided
        const sku = row.sku || await this.generateSku(shopCode, shopId);

        // Calculate display price with markup
        const displayPrice = calculateDisplayPrice(row.base_price);

        // Create shop product with NEEDS_IMAGES status
        const shopProduct = await prisma.shop_products.create({
          data: {
            shop_id: shopId,
            product_id: product.id,
            sku,
            base_price: row.base_price,
            price: displayPrice,
            stock_quantity: row.stock_quantity,
            condition: row.condition,
            shop_description: row.shop_description || null,
            specs: row.specs ? (row.specs as Prisma.InputJsonValue) : Prisma.JsonNull,
            images: [],
            is_available: false,
            listing_status: 'NEEDS_IMAGES' as listing_status,
            bulk_upload_id: bulkUpload.id
          }
        });

        successful++;
        createdProducts.push({
          id: shopProduct.id,
          product_name: row.product_name,
          sku: shopProduct.sku,
          price: Number(shopProduct.price),
          listing_status: shopProduct.listing_status || 'NEEDS_IMAGES'
        });

      } catch (error) {
        console.error(`Error processing row ${row.rowNumber}:`, error);
        failed++;
        errors.push({
          row: row.rowNumber,
          field: 'processing',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update bulk upload with final results
    await prisma.bulk_uploads.update({
      where: { id: bulkUpload.id },
      data: {
        successful,
        failed,
        skipped,
        errors: errors as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED' as upload_status,
        completed_at: new Date()
      }
    });

    return {
      uploadId: bulkUpload.id,
      batchId: bulkUpload.id, // Use uploadId as batchId for compatibility
      totalRows: parsedRows.length + parseErrors.length,
      successful,
      failed,
      skipped,
      errors,
      products: createdProducts
    };
  },

  /**
   * Generate shop code from shop name
   */
  generateShopCode(shopName: string): string {
    return shopName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6)
      .padEnd(6, 'X');
  },

  /**
   * Generate unique SKU for shop
   */
  async generateSku(shopCode: string, shopId: string): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get count of products created today for this shop
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const count = await prisma.shop_products.count({
      where: {
        shop_id: shopId,
        created_at: { gte: todayStart }
      }
    });

    const seq = String(count + 1).padStart(3, '0');
    return `${shopCode}-${today}-${seq}`;
  },

  /**
   * Get products that need images
   */
  async getProductsNeedingImages(
    shopId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.shop_products.findMany({
        where: {
          shop_id: shopId,
          // Include products explicitly marked NEEDS_IMAGES plus products
          // marked NEEDS_SPECS (tech items) that still have no images.
          OR: [
            { listing_status: 'NEEDS_IMAGES' as listing_status },
            { listing_status: 'NEEDS_SPECS' as listing_status }
          ]
        },
        include: {
          products: {
            select: {
              name: true,
              brand: true,
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
          OR: [
            { listing_status: 'NEEDS_IMAGES' as listing_status },
            { listing_status: 'NEEDS_SPECS' as listing_status }
          ]
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
        images: p.images,
        listing_status: p.listing_status
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Get upload history for shop
   */
  async getUploadHistory(
    shopId: string,
    page: number = 1,
    limit: number = 10
  ) {
    const skip = (page - 1) * limit;

    const [uploads, total] = await Promise.all([
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
      uploads: uploads.map(u => ({
        id: u.id,
        file_name: u.file_name,
        total_rows: u.total_rows,
        successful: u.successful,
        failed: u.failed,
        skipped: u.skipped,
        status: u.status,
        created_at: u.created_at,
        completed_at: u.completed_at
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Send upload summary email to seller
   */
  async sendUploadSummaryEmail(
    email: string,
    sellerName: string,
    result: UploadResult
  ): Promise<void> {
    // Build HTML summary
    const htmlSummary = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Total Rows</strong></td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${result.totalRows}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb; color: #16a34a;"><strong>Successful</strong></td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${result.successful}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb; color: #ca8a04;"><strong>Skipped</strong></td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${result.skipped}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626;"><strong>Failed</strong></td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${result.failed}</td>
        </tr>
      </table>
      ${result.errors.length > 0 ? `
        <p style="margin-top: 16px; font-weight: 600;">Errors (showing first 10):</p>
        <ul style="margin: 8px 0; padding-left: 20px;">
          ${result.errors.slice(0, 10).map(e => `
            <li style="color: #dc2626; margin: 4px 0;">Row ${e.row}: ${e.field} - ${e.message}</li>
          `).join('')}
        </ul>
      ` : ''}
      ${result.successful > 0 ? `
        <div style="margin-top: 24px; padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <p style="margin: 0 0 12px; font-weight: 600; color: #92400e;">⚠️ Next Steps to Make Products Live:</p>
          ${result.needs_specs && result.needs_specs > 0 ? `
            <p style="margin: 8px 0; color: #92400e;">• <strong>${result.needs_specs} product${result.needs_specs > 1 ? 's' : ''}</strong> need${result.needs_specs === 1 ? 's' : ''} tech specs (RAM, Storage, Processor, etc.) added</p>
          ` : ''}
          ${result.needs_images && result.needs_images > 0 ? `
            <p style="margin: 8px 0; color: #92400e;">• <strong>${result.needs_images} product${result.needs_images > 1 ? 's' : ''}</strong> need${result.needs_images === 1 ? 's' : ''} images uploaded</p>
          ` : ''}
          <p style="margin: 12px 0 0; color: #78350f; font-size: 14px;">Products won't be visible to buyers until all requirements are met.</p>
        </div>
      ` : ''}
    `;

    // Choose CTA depending on upload results
    let ctaText: string | undefined;
    let ctaUrl: string | undefined;

    if (result.successful > 0) {
      ctaText = 'View Your Products';
      ctaUrl = `${process.env.FRONTEND_URL || 'https://sankha.shop'}/seller/products`;
    } else if (result.failed > 0 || result.skipped > 0) {
      ctaText = 'Review Upload';
      ctaUrl = `${process.env.FRONTEND_URL || 'https://sankha.shop'}/seller/products?batch=${result.batchId}`;
    }

    const { subject, html, text } = bulkUploadSummaryTemplate({
      userName: sellerName,
      subject: `Bulk Upload Complete - ${result.successful} products added`,
      htmlSummary,
      ctaText,
      ctaUrl
    });

    await emailService.send({
      to: email,
      subject,
      html,
      text
    });
  }
};

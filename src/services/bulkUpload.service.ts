import xlsx from 'xlsx';
import prisma from '../prismaClient';
import { emailService } from './email.service';
import { bulkUploadSummaryTemplate } from '../templates/email.templates';

type ParsedRow = { [key: string]: any };
type RowError = { row: number; field?: string; message: string };

export const bulkUploadService = {
  generateTemplate(): Buffer {
    const headers = [
      'name',
      'brand',
      'sku',
      'description',
      'base_price',
      'price',
      'stock_quantity',
      'condition',
      'shop_description',
      'specs'
    ];

    const ws = xlsx.utils.aoa_to_sheet([headers, []]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Products');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },

  parseExcelFile(buffer: Buffer): { rows: ParsedRow[]; errors: RowError[] } {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rawRows: ParsedRow[] = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      // Normalize keys to snake_case-ish lowercased keys
      const rows = rawRows.map((r: ParsedRow) => {
        const obj: ParsedRow = {};
        Object.keys(r).forEach(k => {
          const key = String(k).trim().toLowerCase().replace(/\s+/g, '_');
          obj[key] = r[k];
        });
        return obj;
      });

      return { rows, errors: [] };
    } catch (error: any) {
      return { rows: [], errors: [{ row: 0, message: error.message || 'Failed to parse file' }] };
    }
  },

  async processBulkUpload(
    shopId: string,
    fileName: string,
    parsedRows: ParsedRow[],
    parseErrors: RowError[] = []
  ) {
    const totalRows = parsedRows.length;

    // Create a bulk_uploads record to track this upload
    const upload = await prisma.bulk_uploads.create({
      data: {
        shop_id: shopId,
        file_name: fileName,
        total_rows: totalRows,
        successful: 0,
        failed: parseErrors.length,
        skipped: 0,
        errors: parseErrors.length > 0 ? parseErrors : undefined,
        status: 'COMPLETED',
        completed_at: new Date()
      }
    });

    return {
      uploadId: upload.id,
      totalRows,
      successful: 0,
      failed: parseErrors.length,
      skipped: 0,
      products: [],
      errors: parseErrors
    };
  },

  async getProductsNeedingImages(shopId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, totalCount] = await Promise.all([
      prisma.shop_products.findMany({
        where: { shop_id: shopId, listing_status: 'NEEDS_IMAGES' },
        include: { products: { select: { name: true, brand: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.shop_products.count({ where: { shop_id: shopId, listing_status: 'NEEDS_IMAGES' } })
    ]);

    return {
      items: items.map(i => ({ id: i.id, name: i.products.name, brand: i.products.brand, images: i.images || [], listing_status: i.listing_status })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit
      }
    };
  },

  async getUploadHistory(shopId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [uploads, totalCount] = await Promise.all([
      prisma.bulk_uploads.findMany({ where: { shop_id: shopId }, orderBy: { created_at: 'desc' }, skip, take: limit }),
      prisma.bulk_uploads.count({ where: { shop_id: shopId } })
    ]);

    return {
      uploads,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit
      }
    };
  },

  async sendUploadSummaryEmail(sellerEmail: string, sellerName: string, result: any) {
    const htmlSummary = `
      <p>Total rows: ${result.totalRows}</p>
      <p>Successful: ${result.successful}</p>
      <p>Failed: ${result.failed}</p>
      <p>Skipped: ${result.skipped}</p>
    `;

    const template = bulkUploadSummaryTemplate({
      userName: sellerName,
      subject: 'Bulk Upload Summary',
      htmlSummary,
      textSummary: `Bulk upload completed: ${result.successful} successful, ${result.failed} failed.`,
      ctaText: 'View Uploads',
      ctaUrl: `/seller/uploads`
    });

    return emailService.send({ to: sellerEmail, subject: template.subject, html: template.html, text: template.text });
  }
};

export type { ParsedRow, RowError };
import * as XLSX from 'xlsx';
import prisma from '../prismaClient';
import { PRICE_MARKUP_MULTIPLIER } from '../utils/constants';
import { emailService } from './email.service';
import { bulkUploadSummaryTemplate } from '../templates/email.templates';

// Column mapping for the Excel template
const COLUMN_MAPPING = {
  'Product Name': 'product_name',
  'Category': 'category_name',
  'Brand': 'brand',
  'SKU': 'sku',
  'Base Price (MWK)': 'base_price',
  'Stock Quantity': 'stock_quantity',
  'Condition': 'condition',
  'Description': 'shop_description',
  'Specs (JSON)': 'specs'
} as const;

const REQUIRED_COLUMNS = ['Product Name', 'Base Price (MWK)', 'Stock Quantity'];

const VALID_CONDITIONS = ['NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR'];

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

interface RowError {
  row: number;
  field: string;
  message: string;
}

interface UploadResult {
  uploadId: string;
  totalRows: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: RowError[];
  products: Array<{
    id: string;
    product_name: string;
    sku?: string;
    price: number;
    listing_status: string;
  }>;
}

/**
 * Calculate display price from base price
 * display_price = base_price × 1.0526
 */
const calculateDisplayPrice = (basePrice: number): number => {
  return Math.round(basePrice * PRICE_MARKUP_MULTIPLIER * 100) / 100;
};

/**
 * Normalize product name for matching
 */
const normalizeProductName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
};

export const bulkUploadService = {
  /**
   * Generate Excel template for bulk upload
   */
  generateTemplate(): Buffer {
    const headers = Object.keys(COLUMN_MAPPING);
    
    // Sample data row
    const sampleData = [
      {
        'Product Name': 'iPhone 15 Pro Max 256GB',
        'Category': 'Smartphones',
        'Brand': 'Apple',
        'SKU': 'IP15PM-256-BLK',
        'Base Price (MWK)': 1500000,
        'Stock Quantity': 10,
        'Condition': 'NEW',
        'Description': 'Brand new, sealed in box. 1 year warranty.',
        'Specs (JSON)': '{"storage": "256GB", "color": "Black Titanium", "ram": "8GB"}'
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
        'Specs (JSON)': '{"storage": "512GB", "color": "Titanium Gray", "ram": "12GB"}'
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
        'Specs (JSON)': '{"cpu": "M3 Chip", "ram": "16GB", "storage": "512GB SSD"}'
      }
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Create worksheet with headers and sample data
    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 35 },  // Product Name
      { wch: 15 },  // Category
      { wch: 12 },  // Brand
      { wch: 18 },  // SKU
      { wch: 18 },  // Base Price
      { wch: 14 },  // Stock Quantity
      { wch: 14 },  // Condition
      { wch: 45 },  // Description
      { wch: 60 }   // Specs
    ];
    
    // Add instruction sheet
    const instructions = [
      ['BULK UPLOAD INSTRUCTIONS'],
      [''],
      ['Required Columns:'],
      ['- Product Name: The name of the product (must match existing product in catalog, or new product will be created)'],
      ['- Base Price (MWK): Your selling price BEFORE platform fees. The display price will be calculated automatically.'],
      ['- Stock Quantity: Number of items in stock'],
      [''],
      ['Optional Columns:'],
      ['- Category: Category name (e.g., Smartphones, Laptops). Used for new products.'],
      ['- Brand: Product brand (e.g., Apple, Samsung)'],
      ['- SKU: Your internal product code'],
      ['- Condition: NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, or USED_FAIR (default: NEW)'],
      ['- Description: Your product description'],
      ['- Specs (JSON): Product specifications in JSON format'],
      [''],
      ['IMPORTANT NOTES:'],
      ['1. All products will be created with "NEEDS_IMAGES" status'],
      ['2. You must add images to each product before they can go live'],
      ['3. Delete the sample data rows before uploading your products'],
      ['4. Prices are in Malawian Kwacha (MWK)'],
      ['5. The platform fee (5.26%) will be added to your base price automatically'],
      ['6. Maximum 200 products per upload'],
      [''],
      ['PRICING EXAMPLE:'],
      ['If you set Base Price = MWK 100,000'],
      ['Display Price will be = MWK 105,260 (your base price + 5.26% platform fee)'],
      ['You receive = MWK 100,000 when product sells']
    ];
    
    const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
    instructionSheet['!cols'] = [{ wch: 90 }];
    
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    
    // Write to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  },

  /**
   * Parse uploaded Excel file
   */
  parseExcelFile(fileBuffer: Buffer): { rows: ParsedRow[]; errors: RowError[] } {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    // Get the Products sheet (or first sheet if not found)
    const sheetName = workbook.SheetNames.includes('Products') 
      ? 'Products' 
      : workbook.SheetNames[0];
    
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    
    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];
    
    // Validate we have data
    if (jsonData.length === 0) {
      errors.push({ row: 0, field: 'file', message: 'No data found in the file' });
      return { rows, errors };
    }
    
    // Check for required columns
    const firstRow = jsonData[0] as Record<string, any>;
    for (const col of REQUIRED_COLUMNS) {
      if (!(col in firstRow)) {
        errors.push({ row: 0, field: col, message: `Missing required column: ${col}` });
      }
    }
    
    if (errors.length > 0) {
      return { rows, errors };
    }
    
    // Parse each row
    jsonData.forEach((row: any, index: number) => {
      const rowNumber = index + 2; // Excel row number (1-indexed + header)
      const rowErrors: RowError[] = [];
      
      // Get and validate required fields
      const productName = String(row['Product Name'] || '').trim();
      const basePriceRaw = row['Base Price (MWK)'];
      const stockQuantityRaw = row['Stock Quantity'];
      
      // Skip empty rows
      if (!productName && !basePriceRaw && !stockQuantityRaw) {
        return;
      }
      
      // Validate product name
      if (!productName) {
        rowErrors.push({ row: rowNumber, field: 'Product Name', message: 'Product name is required' });
      }
      
      // Validate and parse base price
      const basePrice = parseFloat(String(basePriceRaw).replace(/,/g, ''));
      if (isNaN(basePrice) || basePrice <= 0) {
        rowErrors.push({ row: rowNumber, field: 'Base Price', message: 'Base price must be a positive number' });
      }
      
      // Validate and parse stock quantity
      const stockQuantity = parseInt(String(stockQuantityRaw).replace(/,/g, ''));
      if (isNaN(stockQuantity) || stockQuantity < 0) {
        rowErrors.push({ row: rowNumber, field: 'Stock Quantity', message: 'Stock quantity must be a non-negative integer' });
      }
      
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

        // Try to find existing product by name match
        const normalizedName = normalizeProductName(row.product_name);

        let product = await prisma.products.findFirst({
          where: {
            OR: [
              { normalized_name: normalizedName },
              { name: { contains: row.product_name, mode: 'insensitive' } }
            ],
            status: 'APPROVED'
          }
        });

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
              normalized_name: normalizedName,
              brand: row.brand,
              category_id: categoryId,
              base_price: row.base_price,
              status: 'PENDING',
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

        // Calculate display price
        const displayPrice = calculateDisplayPrice(row.base_price);

        // Create shop product with NEEDS_IMAGES status
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
    const textSummary = `Bulk Upload Complete\n\nTotal Rows: ${result.totalRows}\nSuccessful: ${result.successful}\nSkipped: ${result.skipped}\nFailed: ${result.failed}\n\nNext Step: Add images to your products to make them live.`;
    const email = bulkUploadSummaryTemplate({
      userName: sellerName,
      subject,
      htmlSummary,
      textSummary,
      ctaText: 'Add Images to Products',
      ctaUrl: `${process.env.FRONTEND_URL}/seller/products/needs-images`
    });
    await emailService.send({
      to: sellerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text
    });
  }
};

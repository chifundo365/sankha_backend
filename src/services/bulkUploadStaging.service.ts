/**
 * Bulk Upload Staging Service v4.0
 * ==================================
 * Handles the staging pipeline for bulk uploads:
 * Upload → Parse → Stage → Validate → Preview → Commit
 */
import prisma from '../prismaClient';
import { Prisma, listing_status, upload_status, template_type, staging_validation_status } from '../../generated/prisma';
import { calculateDisplayPrice } from '../utils/constants';
import {
  normalizeProductName,
  normalizeSpecKey,
  normalizeMemorySize,
  normalizeStorageSize,
  TECH_CATEGORIES,
  DEFAULT_SPEC_REQUIREMENTS,
  RowError,
  ParsedRow,
  StagingSummary,
  PreviewResponse,
  PreviewValidRow,
  PreviewInvalidRow,
  CommitSummary,
  CommittedProduct,
  TemplateType,
  ListingStatusV4
} from '../types/bulkUpload.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_ROWS_PER_UPLOAD: 500,
  MAX_PENDING_BATCHES_PER_SHOP: 3,
  STAGING_RETENTION_DAYS: 7,
  PREVIEW_PAGE_SIZE: 50
};

// ============================================================================
// TYPES
// ============================================================================

interface StagingRowData {
  batchId: string;
  bulkUploadId?: string;
  shopId: string;
  rowNumber: number;
  rawData: Record<string, any>;
  productName?: string;
  normalizedName?: string;
  categoryName?: string;
  brand?: string;
  sku?: string;
  basePrice?: number;
  displayPrice?: number;
  stockQuantity?: number;
  condition?: string;
  description?: string;
  variantValues?: Record<string, string>;
  templateType: template_type;
  validationStatus: staging_validation_status;
  matchedProductId?: string;
  willCreateProduct: boolean;
  missingSpecs?: string[];
  errors?: RowError[];
  targetListingStatus?: listing_status;
}

// ============================================================================
// SERVICE
// ============================================================================

export const bulkUploadStagingService = {
  /**
   * Generate a unique batch ID for staging
   */
  generateBatchId(shopId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${shopId.substring(0, 8)}-${timestamp}-${random}`;
  },

  /**
   * Check if shop can perform bulk upload
   */
  async canShopBulkUpload(shopId: string): Promise<{ allowed: boolean; reason?: string }> {
    const shop = await prisma.shops.findUnique({
      where: { id: shopId },
      select: { can_bulk_upload: true, name: true }
    });

    if (!shop) {
      return { allowed: false, reason: 'Shop not found' };
    }

    if (!shop.can_bulk_upload) {
      return { allowed: false, reason: 'Bulk upload is disabled for this shop. Contact support.' };
    }

    // Check pending batches limit
    const pendingCount = await prisma.bulk_uploads.count({
      where: {
        shop_id: shopId,
        status: 'STAGING'
      }
    });

    if (pendingCount >= CONFIG.MAX_PENDING_BATCHES_PER_SHOP) {
      return { 
        allowed: false, 
        reason: `You have ${pendingCount} pending uploads. Please commit or cancel them before starting a new one.`
      };
    }

    return { allowed: true };
  },

  /**
   * Insert parsed rows into staging table
   */
  async insertStagingRows(
    shopId: string,
    batchId: string,
    bulkUploadId: string,
    parsedRows: ParsedRow[],
    parseErrors: RowError[]
  ): Promise<{ inserted: number; errorRows: number }> {
    const stagingRows: StagingRowData[] = [];

    // Add valid parsed rows
    for (const row of parsedRows) {
      const templateType = this.detectTemplateType(row.variantValues || {});
      const displayPrice = calculateDisplayPrice(row.basePrice);

      stagingRows.push({
        batchId,
        bulkUploadId,
        shopId,
        rowNumber: row.rowNumber,
        rawData: row as any,
        productName: row.productName,
        normalizedName: row.normalizedName,
        categoryName: row.categoryName,
        brand: row.brand,
        sku: row.sku,
        basePrice: row.basePrice,
        displayPrice,
        stockQuantity: row.stockQuantity,
        condition: row.condition,
        description: row.description,
        variantValues: row.variantValues,
        templateType,
        validationStatus: 'PENDING',
        willCreateProduct: false
      });
    }

    // Add error rows (for tracking)
    for (const error of parseErrors) {
      stagingRows.push({
        batchId,
        bulkUploadId,
        shopId,
        rowNumber: error.row,
        rawData: { error: true },
        templateType: 'GENERAL',
        validationStatus: 'INVALID',
        willCreateProduct: false,
        errors: [error]
      });
    }

    // Bulk insert staging rows
    if (stagingRows.length > 0) {
      await prisma.bulk_upload_staging.createMany({
        data: stagingRows.map(row => ({
          batch_id: row.batchId,
          bulk_upload_id: row.bulkUploadId,
          shop_id: row.shopId,
          row_number: row.rowNumber,
          raw_data: row.rawData as Prisma.InputJsonValue,
          product_name: row.productName,
          normalized_name: row.normalizedName,
          category_name: row.categoryName,
          brand: row.brand,
          sku: row.sku,
          base_price: row.basePrice,
          display_price: row.displayPrice,
          stock_quantity: row.stockQuantity,
          condition: row.condition,
          description: row.description,
          variant_values: row.variantValues as Prisma.InputJsonValue || Prisma.JsonNull,
          template_type: row.templateType,
          validation_status: row.validationStatus,
          matched_product_id: row.matchedProductId,
          will_create_product: row.willCreateProduct,
          missing_specs: row.missingSpecs as Prisma.InputJsonValue || Prisma.JsonNull,
          errors: row.errors as unknown as Prisma.InputJsonValue || Prisma.JsonNull,
          target_listing_status: row.targetListingStatus
        }))
      });
    }

    return {
      inserted: parsedRows.length,
      errorRows: parseErrors.length
    };
  },

  /**
   * Validate all rows in a staging batch
   */
  async validateStagingBatch(shopId: string, batchId: string): Promise<StagingSummary> {
    // Get all pending staging rows
    const stagingRows = await prisma.bulk_upload_staging.findMany({
      where: {
        shop_id: shopId,
        batch_id: batchId,
        validation_status: 'PENDING'
      },
      orderBy: { row_number: 'asc' }
    });

    // Get bulk upload record
    const bulkUpload = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId, shop_id: shopId }
    });

    let valid = 0;
    let invalid = 0;
    let willNeedSpecs = 0;
    let willNeedImages = 0;
    let newProducts = 0;
    let duplicates = 0;

    // Get existing shop products for duplicate detection
    const existingProducts = await prisma.shop_products.findMany({
      where: { shop_id: shopId },
      include: {
        products: { select: { normalized_name: true } }
      }
    });
    const existingNormalizedNames = new Set(
      existingProducts.map((p: any) => p.products.normalized_name).filter(Boolean)
    );
    const existingSkus = new Set(
      existingProducts.map((p: any) => p.sku).filter(Boolean)
    );

    // Process each row
    for (const row of stagingRows) {
      const errors: RowError[] = [];
      let validationStatus: staging_validation_status = 'VALID';
      let matchedProductId: string | undefined;
      let willCreateProduct = false;
      let missingSpecs: string[] = [];
      let targetStatus: listing_status = 'NEEDS_IMAGES';

      // Skip if already has errors from parsing
      if (row.errors && Array.isArray(row.errors) && row.errors.length > 0) {
        invalid++;
        continue;
      }

      // Check for duplicates in existing shop products
      if (row.normalized_name && existingNormalizedNames.has(row.normalized_name)) {
        errors.push({
          row: row.row_number,
          field: 'Product Name',
          message: `Duplicate: This product already exists in your shop`
        });
        validationStatus = 'SKIPPED';
        duplicates++;
      }

      // Check SKU duplicate
      if (row.sku && existingSkus.has(row.sku)) {
        errors.push({
          row: row.row_number,
          field: 'SKU',
          message: `Duplicate: SKU "${row.sku}" already exists in your shop`
        });
        validationStatus = 'SKIPPED';
        duplicates++;
      }

      // Check for duplicates within the same batch
      const duplicateInBatch = await prisma.bulk_upload_staging.findFirst({
        where: {
          batch_id: batchId,
          normalized_name: row.normalized_name,
          row_number: { lt: row.row_number },
          validation_status: { not: 'INVALID' }
        }
      });
      if (duplicateInBatch) {
        errors.push({
          row: row.row_number,
          field: 'Product Name',
          message: `Duplicate of row ${duplicateInBatch.row_number} in this upload`
        });
        validationStatus = 'SKIPPED';
        duplicates++;
      }

      // Find matching base product
      if (validationStatus !== 'SKIPPED' && row.normalized_name) {
        const matchedProduct = await prisma.products.findFirst({
          where: {
            normalized_name: row.normalized_name,
            status: { in: ['APPROVED', 'PENDING'] }
          }
        });

        if (matchedProduct) {
          matchedProductId = matchedProduct.id;
        } else {
          willCreateProduct = true;
          newProducts++;
        }
      }

      // Validate tech specs if category is tech
      if (validationStatus !== 'SKIPPED' && row.category_name) {
        const specValidation = await this.validateTechSpecs(
          row.category_name,
          row.variant_values as Record<string, string> || {}
        );

        if (specValidation.missingRequired.length > 0) {
          missingSpecs = specValidation.missingRequired;
          targetStatus = 'NEEDS_SPECS';
          willNeedSpecs++;
        }
      }

      // Determine final status
      if (errors.length > 0 && validationStatus !== 'SKIPPED') {
        validationStatus = 'INVALID';
        invalid++;
      } else if (validationStatus === 'VALID') {
        valid++;
        if (targetStatus === 'NEEDS_IMAGES') {
          willNeedImages++;
        }
      }

      // Update staging row
      await prisma.bulk_upload_staging.update({
        where: { id: row.id },
        data: {
          validation_status: validationStatus,
          matched_product_id: matchedProductId,
          will_create_product: willCreateProduct,
          missing_specs: missingSpecs.length > 0 ? missingSpecs : Prisma.JsonNull,
          errors: errors.length > 0 ? errors as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
          target_listing_status: targetStatus,
          processed_at: new Date()
        }
      });
    }

    // Detect overall template type
    const templateTypes = await prisma.bulk_upload_staging.groupBy({
      by: ['template_type'],
      where: { batch_id: batchId },
      _count: true
    });
    const dominantType = templateTypes.reduce((prev: any, curr: any) => 
      curr._count > (prev?._count || 0) ? curr : prev
    , templateTypes[0]);

    // Update bulk upload record
    if (bulkUpload) {
      await prisma.bulk_uploads.update({
        where: { id: bulkUpload.id },
        data: {
          template_type: dominantType?.template_type || 'AUTO',
          needs_specs: willNeedSpecs,
          needs_images: willNeedImages
        }
      });
    }

    return {
      batchId,
      uploadId: bulkUpload?.id || '',
      shopId,
      fileName: bulkUpload?.file_name || '',
      templateType: (dominantType?.template_type || 'AUTO') as unknown as TemplateType,
      total: stagingRows.length,
      valid,
      invalid,
      willNeedSpecs,
      willNeedImages,
      newProducts,
      duplicates
    };
  },

  /**
   * Get preview of staging batch
   */
  async getPreview(
    shopId: string,
    batchId: string,
    page: number = 1,
    showInvalid: boolean = false
  ): Promise<PreviewResponse> {
    const skip = (page - 1) * CONFIG.PREVIEW_PAGE_SIZE;
    
    // Get counts
    const [totalValid, totalInvalid] = await Promise.all([
      prisma.bulk_upload_staging.count({
        where: { batch_id: batchId, shop_id: shopId, validation_status: 'VALID' }
      }),
      prisma.bulk_upload_staging.count({
        where: { batch_id: batchId, shop_id: shopId, validation_status: { in: ['INVALID', 'SKIPPED'] } }
      })
    ]);

    const total = totalValid + totalInvalid;

    // Get rows based on filter
    const rows = await prisma.bulk_upload_staging.findMany({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: showInvalid 
          ? { in: ['INVALID', 'SKIPPED'] }
          : 'VALID'
      },
      orderBy: { row_number: 'asc' },
      skip,
      take: CONFIG.PREVIEW_PAGE_SIZE
    });

    const validRows: PreviewValidRow[] = [];
    const invalidRows: PreviewInvalidRow[] = [];

    for (const row of rows) {
      if (row.validation_status === 'VALID') {
        validRows.push({
          rowNumber: row.row_number,
          productName: row.product_name || '',
          brand: row.brand || undefined,
          sku: row.sku || undefined,
          basePrice: Number(row.base_price) || 0,
          displayPrice: Number(row.display_price) || 0,
          targetStatus: (row.target_listing_status || 'NEEDS_IMAGES') as unknown as ListingStatusV4,
          matchedProduct: row.matched_product_id || undefined,
          willCreateProduct: row.will_create_product,
          variantValues: row.variant_values as Record<string, string> || {},
          missingSpecs: row.missing_specs as unknown as string[] || undefined
        });
      } else {
        invalidRows.push({
          rowNumber: row.row_number,
          productName: row.product_name || undefined,
          errors: row.errors as unknown as RowError[] || [],
          rawData: row.raw_data as Record<string, any>
        });
      }
    }

    const totalPages = Math.ceil(
      (showInvalid ? totalInvalid : totalValid) / CONFIG.PREVIEW_PAGE_SIZE
    );

    return {
      batchId,
      summary: {
        total,
        valid: totalValid,
        invalid: totalInvalid
      },
      validRows,
      invalidRows,
      pagination: {
        currentPage: page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  },

  /**
   * Get correction data for invalid rows
   */
  async getCorrectionData(shopId: string, batchId: string): Promise<any[]> {
    const invalidRows = await prisma.bulk_upload_staging.findMany({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: { in: ['INVALID', 'SKIPPED'] }
      },
      orderBy: { row_number: 'asc' }
    });

    return invalidRows.map((row: any) => ({
      row_number: row.row_number,
      product_name: row.product_name,
      raw_data: row.raw_data,
      errors: row.errors,
      validation_status: row.validation_status
    }));
  },

  /**
   * Commit a staging batch to production
   */
  async commitBatch(shopId: string, batchId: string): Promise<CommitSummary> {
    // Get all valid staging rows
    const validRows = await prisma.bulk_upload_staging.findMany({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: 'VALID'
      },
      orderBy: { row_number: 'asc' }
    });

    // Get bulk upload record
    const bulkUpload = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId, shop_id: shopId }
    });

    if (!bulkUpload) {
      throw new Error('Bulk upload record not found');
    }

    // Get shop for SKU generation
    const shop = await prisma.shops.findUnique({
      where: { id: shopId },
      select: { name: true }
    });
    const shopCode = this.generateShopCode(shop?.name || 'SHOP');

    const committedProducts: CommittedProduct[] = [];
    let committed = 0;
    let skipped = 0;
    let failed = 0;
    let newProductsCreated = 0;
    let needsSpecs = 0;
    let needsImages = 0;

    // Process each valid row
    for (const row of validRows) {
      try {
        // Get or create base product
        let productId = row.matched_product_id;

        if (!productId && row.will_create_product) {
          // Find category ID
          let categoryId: string | null = null;
          if (row.category_name) {
            const category = await prisma.categories.findFirst({
              where: { name: { equals: row.category_name, mode: 'insensitive' } }
            });
            categoryId = category?.id || null;
          }

          // Create new base product
          const newProduct = await prisma.products.create({
            data: {
              name: row.product_name || '',
              normalized_name: row.normalized_name || '',
              brand: row.brand,
              category_id: categoryId,
              description: row.description,
              status: 'PENDING'
            }
          });
          productId = newProduct.id;
          newProductsCreated++;
        }

        if (!productId) {
          failed++;
          continue;
        }

        // Generate SKU if not provided
        const sku = row.sku || await this.generateSku(shopCode, shopId);

        // Create shop product
        const shopProduct = await prisma.shop_products.create({
          data: {
            shop_id: shopId,
            product_id: productId,
            sku,
            base_price: row.base_price || 0,
            price: row.display_price || 0,
            stock_quantity: row.stock_quantity || 0,
            condition: (row.condition as any) || 'NEW',
            shop_description: row.description,
            specs: row.variant_values as Prisma.InputJsonValue || Prisma.JsonNull,
            variant_values: row.variant_values as Prisma.InputJsonValue || Prisma.JsonNull,
            images: [],
            is_available: false,
            listing_status: row.target_listing_status || 'NEEDS_IMAGES',
            bulk_upload_id: bulkUpload.id
          }
        });

        // Update staging row
        await prisma.bulk_upload_staging.update({
          where: { id: row.id },
          data: { validation_status: 'COMMITTED' }
        });

        committed++;
        
        if (row.target_listing_status === 'NEEDS_SPECS') {
          needsSpecs++;
        } else {
          needsImages++;
        }

        committedProducts.push({
          id: shopProduct.id,
          productName: row.product_name || '',
          sku: shopProduct.sku || undefined,
          basePrice: Number(row.base_price) || 0,
          displayPrice: Number(row.display_price) || 0,
          listingStatus: (row.target_listing_status || 'NEEDS_IMAGES') as unknown as ListingStatusV4,
          isNewProduct: row.will_create_product
        });

      } catch (error) {
        console.error(`Error committing row ${row.row_number}:`, error);
        failed++;
      }
    }

    // Count skipped rows
    const skippedCount = await prisma.bulk_upload_staging.count({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: 'SKIPPED'
      }
    });
    skipped = skippedCount;

    // Count failed (invalid) rows
    const failedCount = await prisma.bulk_upload_staging.count({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: 'INVALID'
      }
    });
    failed += failedCount;

    // Update bulk upload record
    await prisma.bulk_uploads.update({
      where: { id: bulkUpload.id },
      data: {
        successful: committed,
        failed,
        skipped,
        needs_specs: needsSpecs,
        needs_images: needsImages,
        status: 'COMPLETED',
        completed_at: new Date()
      }
    });

    return {
      batchId,
      committed,
      skipped,
      failed,
      newProductsCreated,
      needsSpecs,
      needsImages,
      products: committedProducts
    };
  },

  /**
   * Cancel a staging batch
   */
  async cancelBatch(shopId: string, batchId: string): Promise<void> {
    // Delete all staging rows
    await prisma.bulk_upload_staging.deleteMany({
      where: { batch_id: batchId, shop_id: shopId }
    });

    // Update bulk upload status
    await prisma.bulk_uploads.updateMany({
      where: { batch_id: batchId, shop_id: shopId },
      data: { status: 'CANCELLED' }
    });
  },

  /**
   * Clean up old staging data
   */
  async cleanupOldStaging(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.STAGING_RETENTION_DAYS);

    const result = await prisma.bulk_upload_staging.deleteMany({
      where: {
        created_at: { lt: cutoffDate },
        validation_status: { not: 'COMMITTED' }
      }
    });

    return result.count;
  },

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Detect template type from variant values
   */
  detectTemplateType(variantValues: Record<string, string>): template_type {
    const keys = Object.keys(variantValues);
    
    if (keys.length === 0) return 'GENERAL';

    // Check for tech-specific spec keys
    const techKeys = ['ram', 'storage', 'screen_size', 'processor', 'battery', 'resolution'];
    const hasTechSpecs = keys.some(k => 
      techKeys.includes(normalizeSpecKey(k))
    );

    return hasTechSpecs ? 'ELECTRONICS' : 'GENERAL';
  },

  /**
   * Validate tech specs for a category
   */
  async validateTechSpecs(
    categoryName: string,
    specs: Record<string, string>
  ): Promise<{ isTechCategory: boolean; missingRequired: string[]; normalizedValues: Record<string, string> }> {
    const normalizedCategory = categoryName.toLowerCase().trim();
    
    // Check if tech category
    const isTechCategory = TECH_CATEGORIES.some(tc => 
      normalizedCategory.includes(tc) || tc.includes(normalizedCategory)
    );

    if (!isTechCategory) {
      return { isTechCategory: false, missingRequired: [], normalizedValues: specs };
    }

    // Get spec rules from database or defaults
    const specRule = await prisma.tech_spec_rules.findFirst({
      where: {
        category_name: { equals: categoryName, mode: 'insensitive' },
        is_active: true
      }
    });

    const requiredSpecs = specRule 
      ? (specRule.required_specs as string[])
      : DEFAULT_SPEC_REQUIREMENTS[normalizedCategory]?.required || [];

    // Normalize spec keys
    const normalizedSpecs: Record<string, string> = {};
    for (const [key, value] of Object.entries(specs)) {
      const normalizedKey = normalizeSpecKey(key);
      normalizedSpecs[normalizedKey] = value;
    }

    // Find missing required specs
    const missingRequired = requiredSpecs.filter(req => {
      const normalizedReq = normalizeSpecKey(req);
      return !normalizedSpecs[normalizedReq] || normalizedSpecs[normalizedReq].trim() === '';
    });

    // Normalize values
    const normalizedValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(normalizedSpecs)) {
      if (key === 'ram') {
        normalizedValues[key] = normalizeMemorySize(value);
      } else if (key === 'storage') {
        normalizedValues[key] = normalizeStorageSize(value);
      } else {
        normalizedValues[key] = value;
      }
    }

    return { isTechCategory: true, missingRequired, normalizedValues };
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
  }
};

export default bulkUploadStagingService;

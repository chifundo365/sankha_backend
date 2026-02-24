/**
 * Bulk Upload Staging Service v4.0
 * ==================================
 * Handles the staging pipeline for bulk uploads:
 * Upload → Parse → Stage → Validate → Preview → Commit
 */
import prisma from '../prismaClient';
import { Prisma, listing_status, upload_status, template_type, staging_validation_status, product_condition } from '../../generated/prisma';
import { calculateDisplayPrice } from '../utils/constants';
import { emailService } from './email.service';
import { bulkUploadSummaryTemplate } from '../templates/email.templates';
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
  MAX_ROWS_PER_UPLOAD: Number(process.env.BULK_UPLOAD_MAX_ROWS) || 1000,
  MAX_PENDING_BATCHES_PER_SHOP: 3,
  STAGING_RETENTION_DAYS: 7,
  PREVIEW_PAGE_SIZE: 50
};

const VALID_CONDITIONS: product_condition[] = ['NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR'];

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

      // Required fields: Brand, Description, Condition (validate only when not skipped)
      if (validationStatus !== 'SKIPPED') {
        const brandVal = String(row.brand || '').trim();
        if (!brandVal) {
          errors.push({ row: row.row_number, field: 'Brand', message: 'Brand is required' });
        }

        const descriptionVal = String(row.description || '').trim();
        if (!descriptionVal) {
          errors.push({ row: row.row_number, field: 'Description', message: 'Description is required' });
        }

        const rawCondition = String(row.condition || '').toUpperCase().trim();
        if (!rawCondition) {
          errors.push({ row: row.row_number, field: 'Condition', message: 'Condition is required' });
        } else if (!VALID_CONDITIONS.includes(rawCondition as product_condition)) {
          errors.push({ row: row.row_number, field: 'Condition', message: `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(', ')}` });
        }
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
        // Images are not processed from the sheet by design; any committed product
        // will start without images and therefore will need images to go live.
        willNeedImages++;
        // If tech specs are missing, targetStatus was set to NEEDS_SPECS earlier
        // and willNeedSpecs was already incremented there. We keep that behavior.
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
    // Get bulk upload record
    const bulkUpload = await prisma.bulk_uploads.findFirst({
      where: { batch_id: batchId, shop_id: shopId }
    });

    if (!bulkUpload) {
      throw new Error('Bulk upload record not found');
    }

    // Check if batch is in valid state for commit
    if (bulkUpload.status === 'CANCELLED') {
      throw new Error('Cannot commit: Batch has been cancelled');
    }

    if (bulkUpload.status === 'COMPLETED') {
      throw new Error('Cannot commit: Batch has already been committed');
    }

    if (bulkUpload.status !== 'STAGING') {
      throw new Error(`Cannot commit: Batch is in ${bulkUpload.status} status. Only STAGING batches can be committed.`);
    }

    // Get all valid staging rows
    const validRows = await prisma.bulk_upload_staging.findMany({
      where: {
        batch_id: batchId,
        shop_id: shopId,
        validation_status: 'VALID'
      },
      orderBy: { row_number: 'asc' }
    });

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
        
        // Count specs requirement separately from images. A row may need both.
        if (row.target_listing_status === 'NEEDS_SPECS') {
          needsSpecs++;
        }
        // Images are not imported from the sheet; any newly committed product will
        // start without images and therefore needs images to go live.
        needsImages++;

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

    // Send email notification to seller
    try {
      const shopWithUser = await prisma.shops.findUnique({
        where: { id: shopId },
        include: {
          users: {
            select: { email: true, first_name: true }
          }
        }
      });

      if (shopWithUser?.users?.email) {
        const email = shopWithUser.users.email;
        const sellerName = shopWithUser.users.first_name || 'Seller';

        // Fetch error details from staging
        const invalidRows = await prisma.bulk_upload_staging.findMany({
          where: {
            batch_id: batchId,
            shop_id: shopId,
            validation_status: 'INVALID'
          },
          select: {
            row_number: true,
            product_name: true,
            errors: true
          },
          orderBy: { row_number: 'asc' },
          take: 20 // Limit to first 20 errors
        });

        const skippedRows = await prisma.bulk_upload_staging.findMany({
          where: {
            batch_id: batchId,
            shop_id: shopId,
            validation_status: 'SKIPPED'
          },
          select: {
            row_number: true,
            product_name: true,
            errors: true
          },
          orderBy: { row_number: 'asc' },
          take: 20 // Limit to first 20 duplicates
        });

        // Build HTML summary with batch info
        let htmlSummary = `
          <div style="background: #e0e7ff; padding: 12px 16px; border-radius: 6px; margin: 0 0 16px 0; border-left: 4px solid #6366f1;">
            <p style="margin: 0; color: #4338ca; font-size: 13px;"><strong>Batch ID:</strong> ${batchId}</p>
            <p style="margin: 4px 0 0; color: #4338ca; font-size: 13px;"><strong>File:</strong> ${bulkUpload.file_name || 'Unknown'}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Total Processed</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${committed + skipped + failed}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #059669;"><strong>Successfully Added</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${committed}</td>
            </tr>
            ${skipped > 0 ? `<tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #f59e0b;"><strong>Skipped (Duplicates)</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${skipped}</td>
            </tr>` : ''}
            ${failed > 0 ? `<tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #dc2626;"><strong>Failed (Invalid Data)</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${failed}</td>
            </tr>` : ''}
            ${newProductsCreated > 0 ? `<tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #2563eb;"><strong>New Products Created</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${newProductsCreated}</td>
            </tr>` : ''}
          </table>
        `;

        // Add duplicate/skipped details
        if (skippedRows.length > 0) {
          htmlSummary += `
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 16px 0;">
              <p style="margin: 0 0 12px; color: #92400e; font-size: 16px; font-weight: 600;">Skipped Products (Duplicates)</p>
              <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px;">
          `;
          skippedRows.slice(0, 20).forEach(row => {
            const productName = row.product_name || 'Unknown Product';
            htmlSummary += `<li style="margin: 6px 0;">Row ${row.row_number}: ${productName} (already exists in your shop)</li>`;
          });
          if (skipped > 20) {
            htmlSummary += `<li style="margin: 6px 0;"><em>...and ${skipped - 20} more duplicates</em></li>`;
          }
          htmlSummary += `</ul></div>`;
        }

        // Add invalid rows details
        if (invalidRows.length > 0) {
          htmlSummary += `
            <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 4px; margin: 16px 0;">
              <p style="margin: 0 0 12px; color: #991b1b; font-size: 16px; font-weight: 600;">Invalid Products</p>
              <ul style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 14px;">
          `;
          invalidRows.slice(0, 20).forEach(row => {
            const productName = row.product_name || `Row ${row.row_number}`;
            const errors = row.errors as any;
            let errorMessages = '';
            
            if (Array.isArray(errors) && errors.length > 0) {
              errorMessages = errors.map((err: any) => err.message || err.field || 'Unknown error').join(', ');
            } else {
              errorMessages = 'Invalid data';
            }
            
            htmlSummary += `<li style="margin: 6px 0;"><strong>${productName}:</strong> ${errorMessages}</li>`;
          });
          if (failed > 20) {
            htmlSummary += `<li style="margin: 6px 0;"><em>...and ${failed - 20} more invalid rows</em></li>`;
          }
          htmlSummary += `</ul></div>`;
        }

        // Add status breakdown
        if (needsImages > 0 || needsSpecs > 0) {
          htmlSummary += `
            <div style="background: #dbeafe; border-left: 4px solid #2563eb; padding: 16px; border-radius: 4px; margin: 16px 0;">
              <p style="margin: 0 0 12px; color: #1e3a8a; font-size: 16px; font-weight: 600;">Action Required</p>
              ${needsImages > 0 ? `<p style="margin: 8px 0 0; color: #1e40af; font-size: 14px;">• ${needsImages} product(s) need images to go live<br>
                <a href="${process.env.FRONTEND_URL || 'https://sankha.shop'}/seller/products?batch=${batchId}&action=add-images" style="color: #2563eb; text-decoration: underline; font-size: 13px;">Add Images Now</a></p>` : ''}
              ${needsSpecs > 0 ? `<p style="margin: 8px 0 0; color: #1e40af; font-size: 14px;">• ${needsSpecs} product(s) need specifications to go live<br>
                <a href="${process.env.FRONTEND_URL || 'https://sankha.shop'}/seller/products?batch=${batchId}&action=add-specs" style="color: #2563eb; text-decoration: underline; font-size: 13px;">Complete Specs Now</a></p>` : ''}
              <p style="margin: 12px 0 0; color: #1e40af; font-size: 14px;">Products won't be visible to buyers until all requirements are met.</p>
            </div>
          `;
        }

        // Add correction file download link if there are failed/skipped rows
        if (failed > 0 || skipped > 0) {
          htmlSummary += `
            <div style="background: #f3f4f6; border-left: 4px solid #6366f1; padding: 16px; border-radius: 4px; margin: 16px 0;">
              <p style="margin: 0 0 8px; color: #3730a3; font-size: 15px; font-weight: 600;">Download Correction File</p>
              <a href="${process.env.FRONTEND_URL || 'https://sankha.shop'}/api/shops/${shopId}/products/bulk/${batchId}/corrections" style="color: #6366f1; text-decoration: underline; font-size: 13px;">Download .xlsx with errors/skipped rows</a>
            </div>
          `;
        }

        // Determine sensible CTA based on results
        let ctaText: string | undefined;
        let ctaUrl: string | undefined;

        if (committed > 0) {
          ctaText = 'View Your Products';
          ctaUrl = `${process.env.FRONTEND_URL || 'https://sankha.shop'}/seller/products`;
        } else if (failed > 0 || skipped > 0) {
          ctaText = 'Review Upload';
          ctaUrl = `${process.env.FRONTEND_URL || 'https://sankha.shop'}/seller/products?batch=${batchId}`;
        }

        const { subject, html, text } = bulkUploadSummaryTemplate({
          userName: sellerName,
          subject: `Bulk Upload Complete - ${committed} products added`,
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
    } catch (emailError) {
      console.error('Failed to send bulk upload email:', emailError);
      // Don't fail the commit if email fails
    }

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
    
    // Check if tech category and find matching tech keyword
    let matchedTechCategory: string | null = null;
    const isTechCategory = TECH_CATEGORIES.some(tc => {
      if (normalizedCategory.includes(tc) || tc.includes(normalizedCategory)) {
        matchedTechCategory = tc;
        return true;
      }
      return false;
    });

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

    // Use matched tech category keyword to lookup requirements
    const requiredSpecs = specRule 
      ? (specRule.required_specs as string[])
      : DEFAULT_SPEC_REQUIREMENTS[matchedTechCategory!]?.required || [];

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

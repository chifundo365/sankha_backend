/**
 * Bulk Upload Staging Service v4.0
 * =================================
 * Handles the staging pipeline: parse → validate → preview → commit
 */

import prisma from '../prismaClient';
import { techSpecValidator } from './techSpecValidator.service';
import { calculateDisplayPrice } from '../utils/constants';
import {
  TemplateType,
  StagingValidationStatus,
  ListingStatusV4,
  UploadStatusV4,
  RawExcelRow,
  RowError,
  ParsedRow,
  StagingRow,
  ProductMatchResult,
  ProductCandidate,
  StagingSummary,
  CommitSummary,
  CommittedProduct,
  PreviewValidRow,
  PreviewInvalidRow,
  normalizeProductName,
  normalizeSpecKey
} from '../types/bulkUpload.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_ROWS_PER_UPLOAD: 500,
  FUZZY_MATCH_THRESHOLD: 0.8,
  BATCH_SIZE: 50 // For DB operations
};

// ============================================================================
// TEMPLATE DETECTION
// ============================================================================

/**
 * Detect template type from Excel headers
 */
export function detectTemplateType(headers: string[]): TemplateType {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  // Check for Electronics template (Spec: prefixed columns)
  const hasSpecColumns = normalizedHeaders.some(h => h.startsWith('spec:'));

  if (hasSpecColumns) {
    return TemplateType.ELECTRONICS;
  }

  // Check for General template (Label_x/Value_x columns)
  const hasLabelColumns = normalizedHeaders.some(h => /^label_\d+$/i.test(h));

  if (hasLabelColumns) {
    return TemplateType.GENERAL;
  }

  // Default to AUTO (will infer from category)
  return TemplateType.AUTO;
}

/**
 * Infer template from category name
 */
export function inferTemplateFromCategory(categoryName: string | undefined): TemplateType {
  if (!categoryName) return TemplateType.GENERAL;

  const isTech = techSpecValidator.isTechCategory(categoryName);
  return isTech ? TemplateType.ELECTRONICS : TemplateType.GENERAL;
}

// ============================================================================
// ROW PARSING
// ============================================================================

/**
 * Parse variant values from Electronics template (Spec: columns)
 */
function parseElectronicsVariants(row: RawExcelRow): Record<string, string> {
  const variants: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().startsWith('spec:')) {
      const specName = key
        .replace(/^spec:\s*/i, '')
        .trim();
      
      const normalizedKey = normalizeSpecKey(specName);

      if (value && String(value).trim()) {
        variants[normalizedKey] = String(value).trim();
      }
    }
  }

  return variants;
}

/**
 * Parse variant values from General template (Label_x/Value_x columns)
 */
function parseGeneralVariants(row: RawExcelRow): Record<string, string> {
  const variants: Record<string, string> = {};

  for (let i = 1; i <= 20; i++) {
    const labelKey = `Label_${i}`;
    const valueKey = `Value_${i}`;

    // Also check lowercase versions
    const label = row[labelKey] || row[labelKey.toLowerCase()];
    const value = row[valueKey] || row[valueKey.toLowerCase()];

    if (label && String(label).trim() && value && String(value).trim()) {
      const normalizedKey = normalizeSpecKey(String(label));
      variants[normalizedKey] = String(value).trim();
    }
  }

  return variants;
}

/**
 * Parse a single row from Excel
 */
export function parseRow(
  row: RawExcelRow,
  rowNumber: number,
  templateType: TemplateType
): { parsed: ParsedRow | null; errors: RowError[] } {
  const errors: RowError[] = [];

  // Get product name (required)
  const productName = String(row['Product Name'] || row['product_name'] || '').trim();
  
  if (!productName) {
    errors.push({
      row: rowNumber,
      field: 'Product Name',
      message: 'Product name is required'
    });
  }

  // Get base price (required)
  const basePriceRaw = row['Base Price (MWK)'] || row['base_price'] || row['Base Price'] || row['price'];
  const basePrice = parseFloat(String(basePriceRaw).replace(/,/g, ''));

  if (isNaN(basePrice) || basePrice <= 0) {
    errors.push({
      row: rowNumber,
      field: 'Base Price',
      message: 'Base price must be a positive number'
    });
  }

  // Get stock quantity (required)
  const stockRaw = row['Stock Quantity'] || row['stock_quantity'] || row['Stock'] || row['Quantity'];
  const stockQuantity = parseInt(String(stockRaw).replace(/,/g, ''));

  if (isNaN(stockQuantity) || stockQuantity < 0) {
    errors.push({
      row: rowNumber,
      field: 'Stock Quantity',
      message: 'Stock quantity must be a non-negative integer'
    });
  }

  // If required fields are invalid, return errors
  if (errors.length > 0) {
    return { parsed: null, errors };
  }

  // Get optional fields
  const categoryName = String(row['Category'] || row['category'] || '').trim() || undefined;
  const brand = String(row['Brand'] || row['brand'] || '').trim() || undefined;
  const sku = String(row['SKU'] || row['sku'] || '').trim() || undefined;
  const description = String(row['Description'] || row['description'] || row['shop_description'] || '').trim() || undefined;

  // Validate and normalize condition
  let condition = String(row['Condition'] || row['condition'] || 'NEW').toUpperCase().trim();
  const validConditions = ['NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD', 'USED_FAIR'];
  
  if (!validConditions.includes(condition)) {
    condition = 'NEW';
  }

  // Determine effective template type
  let effectiveTemplate = templateType;
  if (templateType === TemplateType.AUTO) {
    effectiveTemplate = inferTemplateFromCategory(categoryName);
  }

  // Parse variant values based on template
  let variantValues: Record<string, string>;
  
  if (effectiveTemplate === TemplateType.ELECTRONICS) {
    variantValues = parseElectronicsVariants(row);
  } else {
    variantValues = parseGeneralVariants(row);
  }

  // Calculate display price
  const displayPrice = calculateDisplayPrice(basePrice);

  // Build parsed row
  const parsed: ParsedRow = {
    rowNumber,
    productName,
    normalizedName: normalizeProductName(productName),
    categoryName,
    brand,
    sku,
    basePrice,
    displayPrice,
    stockQuantity,
    condition,
    description,
    variantValues,
    templateType: effectiveTemplate
  };

  return { parsed, errors };
}

// ============================================================================
// PRODUCT MATCHING (SMART MATCH)
// ============================================================================

/**
 * Calculate similarity score between two strings (simple Jaccard similarity)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.toLowerCase().split(/\s+/));
  const set2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Find matching base product
 */
export async function findMatchingProduct(
  productName: string,
  brand?: string
): Promise<ProductMatchResult> {
  const normalizedName = normalizeProductName(productName);

  // Step 1: Exact normalized name match
  const exactMatches = await prisma.products.findMany({
    where: {
      normalized_name: normalizedName,
      status: 'APPROVED'
    },
    select: {
      id: true,
      name: true,
      normalized_name: true,
      brand: true,
      is_verified: true,
      status: true
    }
  });

  if (exactMatches.length > 0) {
    // Prefer verified products
    const verified = exactMatches.find((p: { is_verified: boolean | null }) => p.is_verified);
    const match = verified || exactMatches[0];

    return {
      found: true,
      productId: match.id,
      productName: match.name,
      isVerified: match.is_verified || false,
      confidence: 1.0,
      matchType: 'exact',
      willCreateNew: false
    };
  }

  // Step 2: Partial name match (ILIKE)
  const partialMatches = await prisma.products.findMany({
    where: {
      OR: [
        { name: { contains: productName, mode: 'insensitive' } },
        { normalized_name: { contains: normalizedName, mode: 'insensitive' } }
      ],
      status: 'APPROVED'
    },
    select: {
      id: true,
      name: true,
      normalized_name: true,
      brand: true,
      is_verified: true,
      status: true
    },
    take: 10
  });

  type PartialMatchProduct = {
    id: string;
    name: string;
    normalized_name: string | null;
    brand: string | null;
    is_verified: boolean | null;
    status: string | null;
  };

  if (partialMatches.length > 0) {
    // Score candidates
    const candidates: ProductCandidate[] = partialMatches.map((p: PartialMatchProduct) => ({
      id: p.id,
      name: p.name,
      normalizedName: p.normalized_name || undefined,
      brand: p.brand || undefined,
      isVerified: p.is_verified || false,
      status: p.status || 'PENDING',
      score: calculateSimilarity(normalizedName, p.normalized_name || p.name)
    }));

    // Sort by: verified first, then by score
    candidates.sort((a, b) => {
      if (a.isVerified !== b.isVerified) {
        return a.isVerified ? -1 : 1;
      }
      return b.score - a.score;
    });

    const best = candidates[0];

    if (best.score >= CONFIG.FUZZY_MATCH_THRESHOLD) {
      return {
        found: true,
        productId: best.id,
        productName: best.name,
        isVerified: best.isVerified,
        confidence: best.score,
        matchType: best.score === 1 ? 'normalized' : 'fuzzy',
        willCreateNew: false
      };
    }
  }

  // Step 3: No match found - will create new
  return {
    found: false,
    isVerified: false,
    confidence: 0,
    matchType: 'none',
    willCreateNew: true
  };
}

// ============================================================================
// STAGING OPERATIONS
// ============================================================================

/**
 * Generate a unique batch ID
 */
export function generateBatchId(shopId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${shopId.substring(0, 8)}-${timestamp}-${random}`;
}

/**
 * Insert rows into staging table
 */
export async function insertStagingRows(
  batchId: string,
  bulkUploadId: string,
  shopId: string,
  rows: Array<{ raw: RawExcelRow; rowNumber: number }>,
  templateType: TemplateType
): Promise<number> {
  let inserted = 0;

  // Process in batches
  for (let i = 0; i < rows.length; i += CONFIG.BATCH_SIZE) {
    const batch = rows.slice(i, i + CONFIG.BATCH_SIZE);

    const values = batch.map(({ raw, rowNumber }) => ({
      batch_id: batchId,
      bulk_upload_id: bulkUploadId,
      shop_id: shopId,
      row_number: rowNumber,
      raw_data: raw,
      template_type: templateType,
      validation_status: 'PENDING'
    }));

    await prisma.$executeRaw`
      INSERT INTO bulk_upload_staging (
        batch_id, bulk_upload_id, shop_id, row_number, 
        raw_data, template_type, validation_status
      )
      SELECT 
        v.batch_id, v.bulk_upload_id::uuid, v.shop_id::uuid, v.row_number,
        v.raw_data::jsonb, v.template_type, v.validation_status
      FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS v(
        batch_id text, bulk_upload_id text, shop_id text, row_number int,
        raw_data jsonb, template_type text, validation_status text
      )
    `;

    inserted += batch.length;
  }

  return inserted;
}

/**
 * Validate all staging rows for a batch
 */
export async function validateStagingBatch(
  batchId: string,
  shopId: string
): Promise<StagingSummary> {
  // Get all pending staging rows
  const stagingRows = await prisma.$queryRaw<Array<{
    id: string;
    row_number: number;
    raw_data: RawExcelRow;
    template_type: string;
  }>>`
    SELECT id, row_number, raw_data, template_type
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
    ORDER BY row_number
  `;

  let valid = 0;
  let invalid = 0;
  let willNeedSpecs = 0;
  let willNeedImages = 0;
  let newProducts = 0;
  let duplicates = 0;

  for (const staging of stagingRows) {
    const templateType = staging.template_type as TemplateType;

    // Parse the row
    const { parsed, errors } = parseRow(staging.raw_data, staging.row_number, templateType);

    if (!parsed || errors.length > 0) {
      // Invalid row
      await prisma.$executeRaw`
        UPDATE bulk_upload_staging
        SET 
          validation_status = 'INVALID',
          errors = ${JSON.stringify(errors)}::jsonb,
          target_listing_status = 'BROKEN',
          processed_at = NOW()
        WHERE id = ${staging.id}::uuid
      `;
      invalid++;
      continue;
    }

    // Check for duplicate SKU in shop
    if (parsed.sku) {
      const existingSku = await prisma.shop_products.findFirst({
        where: { shop_id: shopId, sku: parsed.sku }
      });

      if (existingSku) {
        await prisma.$executeRaw`
          UPDATE bulk_upload_staging
          SET 
            validation_status = 'INVALID',
            errors = ${JSON.stringify([{
              row: staging.row_number,
              field: 'SKU',
              message: `Duplicate SKU "${parsed.sku}" already exists in your shop`
            }])}::jsonb,
            target_listing_status = 'BROKEN',
            processed_at = NOW()
          WHERE id = ${staging.id}::uuid
        `;
        invalid++;
        duplicates++;
        continue;
      }
    }

    // Find matching product
    const matchResult = await findMatchingProduct(parsed.productName, parsed.brand);

    // Check for duplicate product in shop
    if (matchResult.found && matchResult.productId) {
      const existingProduct = await prisma.shop_products.findFirst({
        where: { shop_id: shopId, product_id: matchResult.productId }
      });

      if (existingProduct) {
        await prisma.$executeRaw`
          UPDATE bulk_upload_staging
          SET 
            validation_status = 'SKIPPED',
            errors = ${JSON.stringify([{
              row: staging.row_number,
              field: 'Product',
              message: `Product "${parsed.productName}" already exists in your shop`
            }])}::jsonb,
            matched_product_id = ${matchResult.productId}::uuid,
            processed_at = NOW()
          WHERE id = ${staging.id}::uuid
        `;
        duplicates++;
        continue;
      }
    }

    // Get category for validation
    let categoryId: string | null = null;
    if (parsed.categoryName) {
      const category = await prisma.categories.findFirst({
        where: { name: { contains: parsed.categoryName, mode: 'insensitive' } }
      });
      categoryId = category?.id || null;
    }

    // Validate specs
    const specResult = await techSpecValidator.validateSpecs(
      categoryId,
      parsed.categoryName,
      parsed.variantValues
    );

    // Determine target status
    let targetStatus = specResult.targetStatus;
    
    // For general products (non-tech), default to NEEDS_IMAGES (not NEEDS_SPECS)
    if (!specResult.isTechCategory) {
      targetStatus = ListingStatusV4.NEEDS_IMAGES;
    }

    // Update staging row with validation results
    await prisma.$executeRaw`
      UPDATE bulk_upload_staging
      SET 
        validation_status = 'VALID',
        product_name = ${parsed.productName},
        normalized_name = ${parsed.normalizedName},
        category_name = ${parsed.categoryName || null},
        brand = ${parsed.brand || null},
        sku = ${parsed.sku || null},
        base_price = ${parsed.basePrice},
        display_price = ${parsed.displayPrice},
        stock_quantity = ${parsed.stockQuantity},
        condition = ${parsed.condition},
        description = ${parsed.description || null},
        variant_values = ${JSON.stringify(specResult.normalizedValues)}::jsonb,
        matched_product_id = ${matchResult.productId || null}::uuid,
        will_create_product = ${matchResult.willCreateNew},
        missing_specs = ${specResult.missingRequired.length > 0 ? JSON.stringify(specResult.missingRequired) : null}::jsonb,
        target_listing_status = ${targetStatus},
        processed_at = NOW()
      WHERE id = ${staging.id}::uuid
    `;

    valid++;

    if (matchResult.willCreateNew) {
      newProducts++;
    }

    if (targetStatus === ListingStatusV4.NEEDS_SPECS) {
      willNeedSpecs++;
    } else if (targetStatus === ListingStatusV4.NEEDS_IMAGES) {
      willNeedImages++;
    }
  }

  // Get upload info
  const upload = await prisma.bulk_uploads.findFirst({
    where: { batch_id: batchId }
  });

  return {
    batchId,
    uploadId: upload?.id || '',
    shopId,
    fileName: upload?.file_name || '',
    templateType: stagingRows[0]?.template_type as TemplateType || TemplateType.GENERAL,
    total: stagingRows.length,
    valid,
    invalid,
    willNeedSpecs,
    willNeedImages,
    newProducts,
    duplicates
  };
}

/**
 * Get preview of staging batch
 */
export async function getPreview(
  batchId: string,
  page: number = 1,
  limit: number = 50,
  filter: 'all' | 'valid' | 'invalid' = 'all'
): Promise<{
  validRows: PreviewValidRow[];
  invalidRows: PreviewInvalidRow[];
  summary: { total: number; valid: number; invalid: number };
  pagination: { currentPage: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}> {
  // Build filter condition
  let statusFilter = '';
  if (filter === 'valid') {
    statusFilter = "AND validation_status = 'VALID'";
  } else if (filter === 'invalid') {
    statusFilter = "AND validation_status IN ('INVALID', 'SKIPPED')";
  }

  // Get counts
  const counts = await prisma.$queryRaw<Array<{
    validation_status: string;
    count: bigint;
  }>>`
    SELECT validation_status, COUNT(*) as count
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
    GROUP BY validation_status
  `;

  const summary = {
    total: 0,
    valid: 0,
    invalid: 0
  };

  for (const row of counts) {
    const count = Number(row.count);
    summary.total += count;
    
    if (row.validation_status === 'VALID') {
      summary.valid += count;
    } else if (['INVALID', 'SKIPPED'].includes(row.validation_status)) {
      summary.invalid += count;
    }
  }

  // Calculate pagination
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(summary.total / limit);

  // Get rows
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    row_number: number;
    raw_data: RawExcelRow;
    product_name: string | null;
    brand: string | null;
    sku: string | null;
    base_price: number | null;
    display_price: number | null;
    variant_values: Record<string, string> | null;
    validation_status: string;
    matched_product_id: string | null;
    will_create_product: boolean;
    missing_specs: string[] | null;
    errors: RowError[] | null;
    target_listing_status: string | null;
  }>>`
    SELECT 
      id, row_number, raw_data, product_name, brand, sku,
      base_price, display_price, variant_values, validation_status,
      matched_product_id, will_create_product, missing_specs, errors,
      target_listing_status
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
    ORDER BY row_number
    LIMIT ${limit} OFFSET ${offset}
  `;

  const validRows: PreviewValidRow[] = [];
  const invalidRows: PreviewInvalidRow[] = [];

  for (const row of rows) {
    if (row.validation_status === 'VALID') {
      // Get matched product name if exists
      let matchedProductName: string | undefined;
      if (row.matched_product_id) {
        const product = await prisma.products.findUnique({
          where: { id: row.matched_product_id },
          select: { name: true }
        });
        matchedProductName = product?.name;
      }

      validRows.push({
        rowNumber: row.row_number,
        productName: row.product_name || '',
        brand: row.brand || undefined,
        sku: row.sku || undefined,
        basePrice: row.base_price || 0,
        displayPrice: row.display_price || 0,
        targetStatus: (row.target_listing_status as ListingStatusV4) || ListingStatusV4.NEEDS_IMAGES,
        matchedProduct: matchedProductName,
        willCreateProduct: row.will_create_product,
        variantValues: row.variant_values || {},
        missingSpecs: row.missing_specs || undefined
      });
    } else {
      invalidRows.push({
        rowNumber: row.row_number,
        productName: row.product_name || undefined,
        errors: row.errors || [],
        rawData: row.raw_data
      });
    }
  }

  return {
    validRows,
    invalidRows,
    summary,
    pagination: {
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

/**
 * Generate correction CSV data for invalid rows
 */
export async function getCorrectionData(batchId: string): Promise<Array<Record<string, any>>> {
  const invalidRows = await prisma.$queryRaw<Array<{
    row_number: number;
    raw_data: RawExcelRow;
    errors: RowError[] | null;
  }>>`
    SELECT row_number, raw_data, errors
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
    AND validation_status IN ('INVALID', 'SKIPPED')
    ORDER BY row_number
  `;

  return invalidRows.map((row: { row_number: number; raw_data: RawExcelRow; errors: RowError[] | null }) => ({
    ...row.raw_data,
    Error_Reason: (row.errors || []).map((e: RowError) => `${e.field}: ${e.message}`).join('; ')
  }));
}

/**
 * Commit valid staging rows to production
 */
export async function commitBatch(
  shopId: string,
  batchId: string,
  options: { skipInvalid?: boolean; dryRun?: boolean } = {}
): Promise<CommitSummary> {
  const { skipInvalid = true, dryRun = false } = options;

  // Get valid staging rows
  const validRows = await prisma.$queryRaw<Array<{
    id: string;
    row_number: number;
    product_name: string;
    normalized_name: string;
    category_name: string | null;
    brand: string | null;
    sku: string | null;
    base_price: number;
    display_price: number;
    stock_quantity: number;
    condition: string;
    description: string | null;
    variant_values: Record<string, string>;
    matched_product_id: string | null;
    will_create_product: boolean;
    target_listing_status: string;
  }>>`
    SELECT 
      id, row_number, product_name, normalized_name, category_name,
      brand, sku, base_price, display_price, stock_quantity, condition,
      description, variant_values, matched_product_id, will_create_product,
      target_listing_status
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
    AND shop_id = ${shopId}::uuid
    AND validation_status = 'VALID'
    ORDER BY row_number
  `;

  type ValidStagingRow = {
    id: string;
    row_number: number;
    product_name: string;
    normalized_name: string;
    category_name: string | null;
    brand: string | null;
    sku: string | null;
    base_price: number;
    display_price: number;
    stock_quantity: number;
    condition: string;
    description: string | null;
    variant_values: Record<string, string>;
    matched_product_id: string | null;
    will_create_product: boolean;
    target_listing_status: string;
  };

  // Check for invalid rows if skipInvalid is false
  if (!skipInvalid) {
    const invalidCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM bulk_upload_staging
      WHERE batch_id = ${batchId}
      AND shop_id = ${shopId}::uuid
      AND validation_status IN ('INVALID', 'SKIPPED')
    `;
    
    const invalidRows = Number(invalidCount[0]?.count || 0);
    if (invalidRows > 0) {
      throw new Error(
        `Cannot commit batch: ${invalidRows} invalid rows found. ` +
        `Fix errors using the correction file or set skipInvalid=true to commit valid rows only.`
      );
    }
  }

  if (dryRun) {
    // Get invalid count for dry run summary
    const invalidCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM bulk_upload_staging
      WHERE batch_id = ${batchId}
      AND shop_id = ${shopId}::uuid
      AND validation_status IN ('INVALID', 'SKIPPED')
    `;
    
    const skippedCount = Number(invalidCount[0]?.count || 0);
    
    return {
      batchId,
      committed: validRows.length,
      skipped: skippedCount,
      failed: 0,
      newProductsCreated: validRows.filter((r: ValidStagingRow) => r.will_create_product).length,
      needsSpecs: validRows.filter((r: ValidStagingRow) => r.target_listing_status === 'NEEDS_SPECS').length,
      needsImages: validRows.filter((r: ValidStagingRow) => r.target_listing_status === 'NEEDS_IMAGES').length,
      products: []
    };
  }

  // Get bulk upload record
  const upload = await prisma.bulk_uploads.findFirst({
    where: { batch_id: batchId }
  });

  if (!upload) {
    throw new Error(`Bulk upload not found for batch: ${batchId}`);
  }

  const committedProducts: CommittedProduct[] = [];
  let newProductsCreated = 0;
  let needsSpecs = 0;
  let needsImages = 0;
  let failed = 0;

  // Generate SKU prefix
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
    select: { name: true }
  });
  
  const shopCode = (shop?.name || 'SHOP')
    .replace(/[^A-Z0-9]/gi, '')
    .substring(0, 6)
    .toUpperCase();
  
  const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let skuSeq = 1;

  // Process each row
  for (const row of validRows) {
    try {
      let productId = row.matched_product_id;

      // Create new base product if needed
      if (row.will_create_product && !productId) {
        // Find category
        let categoryId: string | null = null;
        if (row.category_name) {
          const category = await prisma.categories.findFirst({
            where: { name: { contains: row.category_name, mode: 'insensitive' } }
          });
          categoryId = category?.id || null;
        }

        // Create pending product
        const newProduct = await prisma.products.create({
          data: {
            name: row.product_name,
            normalized_name: row.normalized_name,
            brand: row.brand,
            category_id: categoryId,
            base_price: row.base_price,
            status: 'PENDING',
            is_verified: false,
            images: []
          }
        });

        productId = newProduct.id;
        newProductsCreated++;
      }

      if (!productId) {
        throw new Error('No product ID available');
      }

      // Generate SKU if not provided
      let sku = row.sku;
      if (!sku) {
        // Find unique SKU
        let exists = true;
        while (exists) {
          sku = `${shopCode}-${dateCode}-${String(skuSeq).padStart(3, '0')}`;
          const existing = await prisma.shop_products.findFirst({
            where: { shop_id: shopId, sku }
          });
          exists = !!existing;
          skuSeq++;
        }
      }

      // Create shop product
      const shopProduct = await prisma.shop_products.create({
        data: {
          shop_id: shopId,
          product_id: productId,
          sku,
          base_price: row.base_price,
          price: row.display_price,
          stock_quantity: row.stock_quantity,
          condition: row.condition as any,
          shop_description: row.description,
          specs: row.variant_values,
          variant_values: row.variant_values,
          images: [],
          is_available: false,
          listing_status: row.target_listing_status as any,
          bulk_upload_id: upload.id
        }
      });

      // Update staging row as committed
      await prisma.$executeRaw`
        UPDATE bulk_upload_staging
        SET validation_status = 'COMMITTED', processed_at = NOW()
        WHERE id = ${row.id}::uuid
      `;

      // Track status counts
      if (row.target_listing_status === 'NEEDS_SPECS') {
        needsSpecs++;
      } else if (row.target_listing_status === 'NEEDS_IMAGES') {
        needsImages++;
      }

      committedProducts.push({
        id: shopProduct.id,
        productName: row.product_name,
        sku: sku || undefined,
        basePrice: row.base_price,
        displayPrice: row.display_price,
        listingStatus: row.target_listing_status as ListingStatusV4,
        isNewProduct: row.will_create_product
      });
    } catch (error) {
      console.error(`Failed to commit row ${row.row_number}:`, error);
      failed++;
    }
  }

  // Update bulk upload record
  await prisma.bulk_uploads.update({
    where: { id: upload.id },
    data: {
      successful: committedProducts.length,
      failed,
      needs_specs: needsSpecs,
      needs_images: needsImages,
      status: 'COMPLETED',
      completed_at: new Date()
    }
  });

  // Get skipped count (invalid rows that were left in staging)
  const skippedCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
    AND shop_id = ${shopId}::uuid
    AND validation_status IN ('INVALID', 'SKIPPED')
  `;
  
  const skipped = Number(skippedCount[0]?.count || 0);

  // Update bulk upload with skipped count
  await prisma.bulk_uploads.update({
    where: { id: upload.id },
    data: { skipped }
  });

  return {
    batchId,
    committed: committedProducts.length,
    skipped,
    failed,
    newProductsCreated,
    needsSpecs,
    needsImages,
    products: committedProducts
  };
}

/**
 * Cancel a staging batch
 */
export async function cancelBatch(batchId: string): Promise<void> {
  // Delete staging rows
  await prisma.$executeRaw`
    DELETE FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
  `;

  // Update bulk upload status
  await prisma.bulk_uploads.updateMany({
    where: { batch_id: batchId },
    data: { status: 'CANCELLED' }
  });
}

/**
 * Clean up old staging data
 */
export async function cleanupOldStaging(retentionDays: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.$executeRaw`
    DELETE FROM bulk_upload_staging
    WHERE created_at < ${cutoffDate}
    AND validation_status IN ('COMMITTED', 'SKIPPED', 'INVALID')
  `;

  return result;
}

export const bulkUploadStagingService = {
  detectTemplateType,
  inferTemplateFromCategory,
  parseRow,
  findMatchingProduct,
  generateBatchId,
  insertStagingRows,
  validateStagingBatch,
  getPreview,
  getCorrectionData,
  commitBatch,
  cancelBatch,
  cleanupOldStaging
};

export default bulkUploadStagingService;

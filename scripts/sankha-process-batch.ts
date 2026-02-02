#!/usr/bin/env npx ts-node

/**
 * Sankha Bulk Upload CLI - Process Batch
 * =======================================
 * CLI tool for processing bulk upload batches from staging to production.
 * 
 * Usage:
 *   npx ts-node scripts/sankha-process-batch.ts <batch_id> [options]
 * 
 * Options:
 *   --dry-run     Preview what would be committed without making changes
 *   --verbose     Show detailed output for each row
 *   --shop-id     Override shop ID (admin only)
 * 
 * Examples:
 *   npx ts-node scripts/sankha-process-batch.ts abc123-1234567890-xyz
 *   npx ts-node scripts/sankha-process-batch.ts abc123-1234567890-xyz --dry-run
 *   npx ts-node scripts/sankha-process-batch.ts abc123-1234567890-xyz --verbose
 */

import prisma from '../src/prismaClient';
import { bulkUploadStagingService } from '../src/services/bulkUploadStaging.service';
import { techSpecValidator } from '../src/services/techSpecValidator.service';
import { calculateDisplayPrice } from '../src/utils/constants';
import { ListingStatusV4, CommitSummary } from '../src/types/bulkUpload.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface CLIOptions {
  batchId: string;
  dryRun: boolean;
  verbose: boolean;
  shopIdOverride?: string;
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// ============================================================================
// HELPERS
// ============================================================================

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, COLORS.bright + COLORS.cyan);
  console.log('='.repeat(60));
}

function logSuccess(message: string) {
  log(`✓ ${message}`, COLORS.green);
}

function logError(message: string) {
  log(`✗ ${message}`, COLORS.red);
}

function logWarning(message: string) {
  log(`⚠ ${message}`, COLORS.yellow);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, COLORS.blue);
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${COLORS.bright}Sankha Bulk Upload CLI - Process Batch${COLORS.reset}

${COLORS.cyan}Usage:${COLORS.reset}
  npx ts-node scripts/sankha-process-batch.ts <batch_id> [options]

${COLORS.cyan}Options:${COLORS.reset}
  --dry-run     Preview what would be committed without making changes
  --verbose     Show detailed output for each row
  --shop-id     Override shop ID (admin only)
  --help, -h    Show this help message

${COLORS.cyan}Examples:${COLORS.reset}
  npx ts-node scripts/sankha-process-batch.ts abc123-1234567890-xyz
  npx ts-node scripts/sankha-process-batch.ts abc123-1234567890-xyz --dry-run
  npx ts-node scripts/sankha-process-batch.ts abc123-1234567890-xyz --verbose

${COLORS.cyan}Status Flow:${COLORS.reset}
  BROKEN → NEEDS_SPECS → NEEDS_IMAGES → LIVE
    `);
    process.exit(0);
  }

  const batchId = args.find(arg => !arg.startsWith('--'));
  
  if (!batchId) {
    logError('Batch ID is required');
    process.exit(1);
  }

  const shopIdIndex = args.indexOf('--shop-id');
  const shopIdOverride = shopIdIndex !== -1 ? args[shopIdIndex + 1] : undefined;

  return {
    batchId,
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    shopIdOverride
  };
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function getBatchInfo(batchId: string) {
  // Get bulk upload record
  const upload = await prisma.bulk_uploads.findFirst({
    where: { batch_id: batchId },
    include: {
      shops: {
        select: { id: true, name: true }
      }
    }
  });

  if (!upload) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  // Get staging row counts
  const counts = await prisma.$queryRaw<Array<{
    validation_status: string;
    count: bigint;
  }>>`
    SELECT validation_status, COUNT(*) as count
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
    GROUP BY validation_status
  `;

  const statusCounts: Record<string, number> = {};
  for (const row of counts) {
    statusCounts[row.validation_status] = Number(row.count);
  }

  return { upload, statusCounts };
}

async function processBatch(options: CLIOptions): Promise<void> {
  const { batchId, dryRun, verbose, shopIdOverride } = options;

  logSection('SANKHA BULK UPLOAD PROCESSOR v4.0');

  // Load tech spec rules
  logInfo('Loading tech spec validation rules...');
  await techSpecValidator.loadRules();
  logSuccess('Tech spec rules loaded');

  // Get batch info
  logInfo(`Fetching batch: ${batchId}`);
  const { upload, statusCounts } = await getBatchInfo(batchId);

  if (!upload.shops) {
    throw new Error('Shop not found for this upload');
  }

  const shopId = shopIdOverride || upload.shop_id;
  const shopName = upload.shops.name;

  logSection('BATCH INFORMATION');
  console.log(`  Batch ID:     ${batchId}`);
  console.log(`  Upload ID:    ${upload.id}`);
  console.log(`  Shop:         ${shopName} (${shopId})`);
  console.log(`  File:         ${upload.file_name}`);
  console.log(`  Status:       ${upload.status}`);
  console.log(`  Template:     ${upload.template_type || 'AUTO'}`);
  console.log(`  Created:      ${upload.created_at}`);

  logSection('STAGING SUMMARY');
  console.log(`  Total Rows:   ${upload.total_rows}`);
  console.log(`  Pending:      ${statusCounts['PENDING'] || 0}`);
  console.log(`  Valid:        ${statusCounts['VALID'] || 0}`);
  console.log(`  Invalid:      ${statusCounts['INVALID'] || 0}`);
  console.log(`  Skipped:      ${statusCounts['SKIPPED'] || 0}`);
  console.log(`  Committed:    ${statusCounts['COMMITTED'] || 0}`);

  const validCount = statusCounts['VALID'] || 0;
  
  if (validCount === 0) {
    logWarning('No valid rows to commit');
    
    if ((statusCounts['INVALID'] || 0) > 0) {
      logInfo('Run the following to see invalid rows:');
      console.log(`  GET /api/bulk-upload/preview/${batchId}?filter=invalid`);
    }
    
    return;
  }

  if (dryRun) {
    logSection('DRY RUN MODE');
    logWarning('No changes will be made to the database');
  }

  // Get valid staging rows for processing
  const validRows = await prisma.$queryRaw<Array<{
    id: string;
    row_number: number;
    product_name: string;
    brand: string | null;
    base_price: number;
    display_price: number;
    stock_quantity: number;
    condition: string;
    variant_values: Record<string, string>;
    matched_product_id: string | null;
    will_create_product: boolean;
    target_listing_status: string;
  }>>`
    SELECT 
      id, row_number, product_name, brand, base_price, display_price,
      stock_quantity, condition, variant_values, matched_product_id,
      will_create_product, target_listing_status
    FROM bulk_upload_staging
    WHERE batch_id = ${batchId}
    AND validation_status = 'VALID'
    ORDER BY row_number
  `;

  logSection('PROCESSING ROWS');

  let committed = 0;
  let newProducts = 0;
  let needsSpecs = 0;
  let needsImages = 0;
  let failed = 0;

  for (const row of validRows) {
    if (verbose) {
      logInfo(`Row ${row.row_number}: ${row.product_name}`);
      console.log(`    Base Price:   MWK ${row.base_price.toLocaleString()}`);
      console.log(`    Display Price: MWK ${row.display_price.toLocaleString()}`);
      console.log(`    Markup:        MWK ${(row.display_price - row.base_price).toLocaleString()} (5.26%)`);
      console.log(`    Stock:         ${row.stock_quantity}`);
      console.log(`    Condition:     ${row.condition}`);
      console.log(`    Match:         ${row.matched_product_id ? 'Existing product' : 'Will create new'}`);
      console.log(`    Target Status: ${row.target_listing_status}`);
    }

    if (row.target_listing_status === 'NEEDS_SPECS') {
      needsSpecs++;
    } else if (row.target_listing_status === 'NEEDS_IMAGES') {
      needsImages++;
    }

    if (row.will_create_product) {
      newProducts++;
    }

    committed++;
  }

  if (!dryRun) {
    logSection('COMMITTING TO DATABASE');
    
    try {
      const result = await bulkUploadStagingService.commitBatch(shopId, batchId);
      
      logSuccess(`Committed ${result.committed} products`);
      
      if (result.failed > 0) {
        logWarning(`${result.failed} rows failed to commit`);
      }

      logSection('COMMIT RESULTS');
      console.log(`  Committed:      ${result.committed}`);
      console.log(`  Failed:         ${result.failed}`);
      console.log(`  New Products:   ${result.newProductsCreated}`);
      console.log(`  Needs Specs:    ${result.needsSpecs}`);
      console.log(`  Needs Images:   ${result.needsImages}`);

      if (verbose && result.products.length > 0) {
        logSection('COMMITTED PRODUCTS');
        for (const product of result.products) {
          console.log(`  - ${product.productName}`);
          console.log(`    ID: ${product.id}`);
          console.log(`    SKU: ${product.sku || 'auto-generated'}`);
          console.log(`    Status: ${product.listingStatus}`);
          console.log('');
        }
      }

    } catch (error) {
      logError(`Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed = validCount;
    }
  } else {
    logSection('DRY RUN SUMMARY');
    console.log(`  Would commit:   ${committed} products`);
    console.log(`  New products:   ${newProducts}`);
    console.log(`  Needs Specs:    ${needsSpecs}`);
    console.log(`  Needs Images:   ${needsImages}`);
    
    logInfo('Run without --dry-run to commit these changes');
  }

  logSection('NEXT STEPS');
  
  if (needsSpecs > 0) {
    logWarning(`${needsSpecs} products need specifications`);
    console.log(`  → Complete specs at: /seller/products/needs-specs`);
  }
  
  if (needsImages > 0) {
    logWarning(`${needsImages} products need images`);
    console.log(`  → Add images at: /seller/products/needs-images`);
  }

  if ((statusCounts['INVALID'] || 0) > 0) {
    logWarning(`${statusCounts['INVALID']} rows were invalid`);
    console.log(`  → Download corrections CSV and re-upload`);
  }

  logSuccess('Processing complete!');
}

// ============================================================================
// ENTRY POINT
// ============================================================================

async function main() {
  try {
    const options = parseArgs();
    await processBatch(options);
  } catch (error) {
    logError(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

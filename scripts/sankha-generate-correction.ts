#!/usr/bin/env npx ts-node

/**
 * Sankha Bulk Upload CLI - Generate Correction File
 * ==================================================
 * CLI tool for generating correction Excel files for INVALID staging rows.
 * 
 * Usage:
 *   npx ts-node scripts/sankha-generate-correction.ts <batch_id> [options]
 * 
 * Options:
 *   --output, -o    Output file path (default: ./corrections-<batch_id>.xlsx)
 *   --format, -f    Output format: xlsx or csv (default: xlsx)
 *   --verbose, -v   Show detailed output
 *   --include-raw   Include raw data columns in output
 * 
 * Examples:
 *   npx ts-node scripts/sankha-generate-correction.ts abc123-1234567890-xyz
 *   npx ts-node scripts/sankha-generate-correction.ts abc123-1234567890-xyz -o ./my-corrections.xlsx
 *   npx ts-node scripts/sankha-generate-correction.ts abc123-1234567890-xyz --format csv
 */

import prisma from '../src/prismaClient';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface CLIOptions {
  batchId: string;
  outputPath: string;
  format: 'xlsx' | 'csv';
  verbose: boolean;
  includeRaw: boolean;
}

interface ErrorDetail {
  field: string;
  message: string;
  type?: string;
  expected?: string;
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
  log(` ${title}`, COLORS.cyan);
  console.log('='.repeat(60));
}

function logError(message: string) {
  log(`✗ ERROR: ${message}`, COLORS.red);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, COLORS.green);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, COLORS.blue);
}

function logWarning(message: string) {
  log(`⚠ ${message}`, COLORS.yellow);
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    batchId: '',
    outputPath: '',
    format: 'xlsx',
    verbose: false,
    includeRaw: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' || arg === '-o') {
      options.outputPath = args[++i] || '';
    } else if (arg === '--format' || arg === '-f') {
      const format = args[++i]?.toLowerCase();
      if (format === 'csv' || format === 'xlsx') {
        options.format = format;
      }
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--include-raw') {
      options.includeRaw = true;
    } else if (!arg.startsWith('-') && !options.batchId) {
      options.batchId = arg;
    }
  }

  // Set default output path if not provided
  if (!options.outputPath) {
    options.outputPath = `./corrections-${options.batchId}.${options.format}`;
  }

  return options;
}

function printUsage() {
  console.log(`
${COLORS.cyan}Sankha Bulk Upload - Correction File Generator${COLORS.reset}

${COLORS.bright}Usage:${COLORS.reset}
  npx ts-node scripts/sankha-generate-correction.ts <batch_id> [options]

${COLORS.bright}Options:${COLORS.reset}
  --output, -o    Output file path (default: ./corrections-<batch_id>.xlsx)
  --format, -f    Output format: xlsx or csv (default: xlsx)
  --verbose, -v   Show detailed output for each row
  --include-raw   Include raw data columns in output

${COLORS.bright}Examples:${COLORS.reset}
  npx ts-node scripts/sankha-generate-correction.ts abc123-1234567890-xyz
  npx ts-node scripts/sankha-generate-correction.ts abc123 -o ./my-corrections.xlsx
  npx ts-node scripts/sankha-generate-correction.ts abc123 --format csv --verbose
  `);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

async function getBatchInfo(batchId: string) {
  const bulkUpload = await prisma.bulk_uploads.findFirst({
    where: { batch_id: batchId },
    include: {
      shops: { select: { id: true, name: true } }
    }
  });

  return bulkUpload;
}

async function getInvalidRows(batchId: string) {
  return await prisma.bulk_upload_staging.findMany({
    where: {
      batch_id: batchId,
      validation_status: { in: ['INVALID', 'SKIPPED'] }
    },
    orderBy: { row_number: 'asc' }
  });
}

function formatErrorsForCell(errors: ErrorDetail[]): string {
  if (!errors || errors.length === 0) return '';
  
  return errors.map(e => {
    let msg = `[${e.field}] ${e.message}`;
    if (e.expected) msg += ` (expected: ${e.expected})`;
    return msg;
  }).join(' | ');
}

function generateCorrectionData(rows: any[], includeRaw: boolean): any[] {
  const data: any[] = [];

  for (const row of rows) {
    const errors = (row.errors || []) as ErrorDetail[];
    const rawData = row.raw_data as Record<string, any> || {};
    const variantValues = row.variant_values as Record<string, string> || {};

    const baseRow: Record<string, any> = {
      'Row Number': row.row_number,
      'Status': row.validation_status,
      'Product Name': row.product_name || rawData['Product Name'] || rawData['product_name'] || '',
      'Category': row.category_name || rawData['Category'] || rawData['category'] || '',
      'Brand': row.brand || rawData['Brand'] || rawData['brand'] || '',
      'SKU': row.sku || rawData['SKU'] || rawData['sku'] || '',
      'Base Price': row.base_price || rawData['Base Price'] || rawData['base_price'] || '',
      'Stock Quantity': row.stock_quantity || rawData['Stock Quantity'] || rawData['stock_quantity'] || '',
      'Condition': row.condition || rawData['Condition'] || rawData['condition'] || 'NEW',
      'Description': row.description || rawData['Description'] || rawData['description'] || '',
      'ERRORS': formatErrorsForCell(errors)
    };

    // Add variant/spec values
    for (const [key, value] of Object.entries(variantValues)) {
      baseRow[`Spec: ${key}`] = value;
    }

    // Optionally include raw data
    if (includeRaw) {
      for (const [key, value] of Object.entries(rawData)) {
        if (!baseRow[key] && !baseRow[`Raw: ${key}`]) {
          baseRow[`Raw: ${key}`] = value;
        }
      }
    }

    data.push(baseRow);
  }

  return data;
}

function generateErrorSummaryData(rows: any[]): any[] {
  const errorCounts: Record<string, { count: number; fields: Set<string>; sample: string }> = {};

  for (const row of rows) {
    const errors = (row.errors || []) as ErrorDetail[];
    
    for (const error of errors) {
      const type = error.type || 'UNKNOWN';
      if (!errorCounts[type]) {
        errorCounts[type] = { count: 0, fields: new Set(), sample: error.message };
      }
      errorCounts[type].count++;
      errorCounts[type].fields.add(error.field);
    }
  }

  return Object.entries(errorCounts).map(([type, info]) => ({
    'Error Type': type,
    'Count': info.count,
    'Affected Fields': Array.from(info.fields).join(', '),
    'Sample Message': info.sample
  }));
}

async function generateCorrectionFile(options: CLIOptions): Promise<void> {
  logSection('CORRECTION FILE GENERATOR');
  
  // Validate batch ID
  if (!options.batchId) {
    logError('Batch ID is required');
    printUsage();
    process.exit(1);
  }

  logInfo(`Batch ID: ${options.batchId}`);
  logInfo(`Output: ${options.outputPath}`);
  logInfo(`Format: ${options.format.toUpperCase()}`);

  // Get batch info
  logSection('FETCHING BATCH DATA');
  
  const bulkUpload = await getBatchInfo(options.batchId);
  
  if (!bulkUpload) {
    logError(`Batch not found: ${options.batchId}`);
    process.exit(1);
  }

  logSuccess(`Found batch for shop: ${bulkUpload.shops.name}`);
  logInfo(`Status: ${bulkUpload.status}`);
  logInfo(`Total rows: ${bulkUpload.total_rows}`);
  logInfo(`Failed: ${bulkUpload.failed}`);
  logInfo(`Skipped: ${bulkUpload.skipped}`);

  // Get invalid rows
  const invalidRows = await getInvalidRows(options.batchId);
  
  if (invalidRows.length === 0) {
    logWarning('No invalid rows found for this batch');
    process.exit(0);
  }

  logSuccess(`Found ${invalidRows.length} invalid/skipped rows`);

  // Generate data
  logSection('GENERATING CORRECTION DATA');

  const correctionData = generateCorrectionData(invalidRows, options.includeRaw);
  const errorSummary = generateErrorSummaryData(invalidRows);

  if (options.verbose) {
    console.log('\n--- Sample Correction Row ---');
    console.log(JSON.stringify(correctionData[0], null, 2));
    console.log('\n--- Error Summary ---');
    console.table(errorSummary);
  }

  // Create workbook
  logSection('WRITING FILE');

  const wb = XLSX.utils.book_new();

  // Main corrections sheet
  const ws = XLSX.utils.json_to_sheet(correctionData);
  XLSX.utils.book_append_sheet(wb, ws, 'Corrections');

  // Error summary sheet
  const summaryWs = XLSX.utils.json_to_sheet(errorSummary);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Error Summary');

  // Instructions sheet
  const instructionsData = [
    { 'Instructions': 'How to use this correction file:' },
    { 'Instructions': '' },
    { 'Instructions': '1. Review the ERRORS column to understand what needs to be fixed' },
    { 'Instructions': '2. Correct the values in the corresponding columns' },
    { 'Instructions': '3. Delete the ERRORS column before re-uploading' },
    { 'Instructions': '4. Delete the Row Number and Status columns before re-uploading' },
    { 'Instructions': '5. Upload the corrected file through the bulk upload interface' },
    { 'Instructions': '' },
    { 'Instructions': 'Common Error Types:' },
    { 'Instructions': '- MISSING_REQUIRED: A required field is empty' },
    { 'Instructions': '- INVALID_PRICE: Price must be a positive number' },
    { 'Instructions': '- INVALID_STOCK: Stock must be a non-negative integer' },
    { 'Instructions': '- MISSING_SPEC: Required tech spec is missing' },
    { 'Instructions': '- DUPLICATE: Product already exists in your shop' },
    { 'Instructions': '' },
    { 'Instructions': `Generated: ${new Date().toISOString()}` },
    { 'Instructions': `Batch: ${options.batchId}` },
    { 'Instructions': `Shop: ${bulkUpload.shops.name}` }
  ];
  const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
  XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

  // Ensure output directory exists
  const outputDir = path.dirname(options.outputPath);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write file
  if (options.format === 'csv') {
    // For CSV, just write the main corrections sheet
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    fs.writeFileSync(options.outputPath, csvContent);
  } else {
    XLSX.writeFile(wb, options.outputPath);
  }

  logSuccess(`Correction file written to: ${options.outputPath}`);

  // Summary
  logSection('SUMMARY');
  console.log(`
  ${COLORS.green}Correction file generated successfully!${COLORS.reset}

  File: ${options.outputPath}
  Rows: ${correctionData.length}
  Error types: ${errorSummary.length}

  ${COLORS.yellow}Next steps:${COLORS.reset}
  1. Open the file and review the ERRORS column
  2. Fix the issues in the corresponding columns
  3. Delete metadata columns (Row Number, Status, ERRORS)
  4. Re-upload through the bulk upload interface
  `);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      printUsage();
      process.exit(0);
    }

    const options = parseArgs(args);
    await generateCorrectionFile(options);
    
    process.exit(0);
  } catch (error) {
    logError(`Failed to generate correction file: ${error}`);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

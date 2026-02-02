/**
 * Bulk Upload v4.0 - Type Definitions
 * ===================================
 * Central type definitions for the bulk upload system
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum TemplateType {
  ELECTRONICS = 'ELECTRONICS',
  GENERAL = 'GENERAL',
  AUTO = 'AUTO'
}

export enum StagingValidationStatus {
  PENDING = 'PENDING',
  VALID = 'VALID',
  INVALID = 'INVALID',
  COMMITTED = 'COMMITTED',
  SKIPPED = 'SKIPPED'
}

export enum ListingStatusV4 {
  LIVE = 'LIVE',
  NEEDS_IMAGES = 'NEEDS_IMAGES',
  NEEDS_SPECS = 'NEEDS_SPECS',
  BROKEN = 'BROKEN',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
  PAUSED = 'PAUSED'
}

export enum UploadStatusV4 {
  STAGING = 'STAGING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// ============================================================================
// INTERFACES - RAW DATA
// ============================================================================

/**
 * Raw row data from Excel file (before parsing)
 */
export interface RawExcelRow {
  [key: string]: any;
}

/**
 * Error object for a specific row/field
 */
export interface RowError {
  row: number;
  field: string;
  message: string;
  code?: string;
}

// ============================================================================
// INTERFACES - PARSED DATA
// ============================================================================

/**
 * Parsed row after template processing
 */
export interface ParsedRow {
  rowNumber: number;
  productName: string;
  normalizedName: string;
  categoryName?: string;
  brand?: string;
  sku?: string;
  basePrice: number;
  displayPrice: number;
  stockQuantity: number;
  condition: string;
  description?: string;
  variantValues: Record<string, string>;
  templateType: TemplateType;
}

/**
 * Staging row data (stored in bulk_upload_staging table)
 */
export interface StagingRow {
  id: string;
  batchId: string;
  bulkUploadId?: string;
  shopId: string;
  rowNumber: number;
  
  // Raw data
  rawData: RawExcelRow;
  
  // Parsed data
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
  
  // Template & validation
  templateType: TemplateType;
  validationStatus: StagingValidationStatus;
  
  // Product matching
  matchedProductId?: string;
  willCreateProduct: boolean;
  
  // Spec validation
  missingSpecs?: string[];
  
  // Errors
  errors?: RowError[];
  
  // Target status
  targetListingStatus?: ListingStatusV4;
  
  // Timestamps
  createdAt: Date;
  processedAt?: Date;
}

// ============================================================================
// INTERFACES - TECH SPECS
// ============================================================================

/**
 * Tech spec rule from database
 */
export interface TechSpecRule {
  id: string;
  categoryId: string;
  categoryName: string;
  requiredSpecs: string[];
  optionalSpecs: string[];
  specLabels: Record<string, string>;
  specValidations?: Record<string, SpecValidation>;
  isActive: boolean;
}

/**
 * Validation rule for a specific spec
 */
export interface SpecValidation {
  type: 'string' | 'number' | 'boolean' | 'enum';
  pattern?: string;
  min?: number;
  max?: number;
  enum?: string[];
  normalize?: boolean;
}

/**
 * Result of spec validation
 */
export interface SpecValidationResult {
  isTechCategory: boolean;
  categoryId?: string;
  categoryName?: string;
  missingRequired: string[];
  invalidSpecs: Array<{ spec: string; error: string }>;
  normalizedValues: Record<string, string>;
  targetStatus: ListingStatusV4;
}

// ============================================================================
// INTERFACES - PRODUCT MATCHING
// ============================================================================

/**
 * Result of product matching
 */
export interface ProductMatchResult {
  found: boolean;
  productId?: string;
  productName?: string;
  isVerified: boolean;
  confidence: number;
  matchType: 'exact' | 'normalized' | 'fuzzy' | 'none';
  willCreateNew: boolean;
}

/**
 * Candidate product for matching
 */
export interface ProductCandidate {
  id: string;
  name: string;
  normalizedName?: string;
  brand?: string;
  isVerified: boolean;
  status: string;
  score: number;
}

// ============================================================================
// INTERFACES - UPLOAD RESULTS
// ============================================================================

/**
 * Summary of staging/validation phase
 */
export interface StagingSummary {
  batchId: string;
  uploadId: string;
  shopId: string;
  fileName: string;
  templateType: TemplateType;
  total: number;
  valid: number;
  invalid: number;
  willNeedSpecs: number;
  willNeedImages: number;
  newProducts: number;
  duplicates: number;
}

/**
 * Summary of commit phase
 */
export interface CommitSummary {
  batchId: string;
  committed: number;
  skipped: number;
  failed: number;
  newProductsCreated: number;
  needsSpecs: number;
  needsImages: number;
  products: CommittedProduct[];
}

/**
 * Committed product info
 */
export interface CommittedProduct {
  id: string;
  productName: string;
  sku?: string;
  basePrice: number;
  displayPrice: number;
  listingStatus: ListingStatusV4;
  isNewProduct: boolean;
}

// ============================================================================
// INTERFACES - API RESPONSES
// ============================================================================

/**
 * Upload initiation response
 */
export interface UploadInitResponse {
  batchId: string;
  uploadId: string;
  totalRows: number;
  templateType: TemplateType;
  status: UploadStatusV4;
  nextStep: string;
}

/**
 * Validation response
 */
export interface ValidationResponse {
  batchId: string;
  summary: StagingSummary;
  validationComplete: boolean;
}

/**
 * Preview response
 */
export interface PreviewResponse {
  batchId: string;
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
  validRows: PreviewValidRow[];
  invalidRows: PreviewInvalidRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface PreviewValidRow {
  rowNumber: number;
  productName: string;
  brand?: string;
  sku?: string;
  basePrice: number;
  displayPrice: number;
  targetStatus: ListingStatusV4;
  matchedProduct?: string;
  willCreateProduct: boolean;
  variantValues: Record<string, string>;
  missingSpecs?: string[];
}

export interface PreviewInvalidRow {
  rowNumber: number;
  productName?: string;
  errors: RowError[];
  rawData: RawExcelRow;
}

/**
 * Commit response
 */
export interface CommitResponse {
  success: boolean;
  message: string;
  summary: CommitSummary;
  nextSteps: Array<{
    action: string;
    endpoint: string;
    count: number;
  }>;
}

// ============================================================================
// INTERFACES - CONFIGURATION
// ============================================================================

/**
 * Bulk upload configuration
 */
export interface BulkUploadConfig {
  maxRowsPerUpload: number;
  maxFileSizeMB: number;
  maxPendingBatchesPerShop: number;
  stagingRetentionDays: number;
  maxUploadsPerDay: number;
  priceMarkupMultiplier: number;
}

/**
 * Tech categories list
 */
export const TECH_CATEGORIES = [
  'smartphones',
  'phones',
  'mobile phones',
  'laptops',
  'notebooks',
  'computers',
  'tablets',
  'ipads',
  'tvs',
  'televisions',
  'cameras',
  'dslr',
  'gaming consoles',
  'consoles',
  'smartwatches',
  'wearables',
  'headphones',
  'earbuds',
  'speakers',
  'monitors',
  'printers',
  'routers',
  'networking'
] as const;

export type TechCategory = typeof TECH_CATEGORIES[number];

/**
 * Default spec requirements by category
 */
export const DEFAULT_SPEC_REQUIREMENTS: Record<string, { required: string[]; optional: string[] }> = {
  smartphones: {
    required: ['ram', 'storage', 'screen_size'],
    optional: ['color', 'battery', 'camera', 'warranty', 'weight']
  },
  phones: {
    required: ['ram', 'storage', 'screen_size'],
    optional: ['color', 'battery', 'camera', 'warranty']
  },
  laptops: {
    required: ['ram', 'storage', 'processor', 'screen_size'],
    optional: ['color', 'graphics', 'os', 'warranty', 'weight', 'battery_life']
  },
  notebooks: {
    required: ['ram', 'storage', 'processor', 'screen_size'],
    optional: ['color', 'graphics', 'os', 'warranty', 'weight']
  },
  tablets: {
    required: ['ram', 'storage', 'screen_size'],
    optional: ['color', 'battery', 'warranty', 'weight', 'cellular']
  },
  tvs: {
    required: ['screen_size', 'resolution'],
    optional: ['smart_tv', 'refresh_rate', 'warranty', 'hdr']
  },
  cameras: {
    required: ['megapixels'],
    optional: ['sensor_type', 'lens_mount', 'video_resolution', 'warranty']
  },
  smartwatches: {
    required: ['display_type'],
    optional: ['battery_life', 'water_resistance', 'warranty', 'os']
  },
  headphones: {
    required: ['type'],
    optional: ['wireless', 'noise_cancellation', 'battery_life', 'warranty']
  }
};

/**
 * Spec normalization patterns
 */
export const SPEC_NORMALIZERS: Record<string, (value: string) => string> = {
  ram: normalizeMemorySize,
  storage: normalizeStorageSize,
  screen_size: normalizeScreenSize,
  battery: normalizeBattery,
  megapixels: normalizeMegapixels,
  resolution: normalizeResolution
};

// ============================================================================
// HELPER FUNCTIONS - SPEC NORMALIZATION
// ============================================================================

/**
 * Normalize memory size (RAM)
 * Examples: "8 gb" → "8GB", "8gb" → "8GB", "8 GB" → "8GB"
 */
export function normalizeMemorySize(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d+)\s*(GB|MB|TB)?$/i);
  
  if (match) {
    const num = match[1];
    const unit = (match[2] || 'GB').toUpperCase();
    return `${num}${unit}`;
  }
  
  return cleaned;
}

/**
 * Normalize storage size
 * Examples: "256 gb" → "256GB", "1 tb" → "1TB"
 */
export function normalizeStorageSize(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d+)\s*(GB|TB|MB)?$/i);
  
  if (match) {
    const num = match[1];
    const unit = (match[2] || 'GB').toUpperCase();
    return `${num}${unit}`;
  }
  
  return cleaned;
}

/**
 * Normalize screen size
 * Examples: "6.7 inches" → "6.7\"", "15.6 inch" → "15.6\""
 */
export function normalizeScreenSize(value: string): string {
  const cleaned = value.trim().toLowerCase();
  const match = cleaned.match(/^([\d.]+)\s*(inches?|")?$/i);
  
  if (match) {
    return `${match[1]}"`;
  }
  
  return value.trim();
}

/**
 * Normalize battery capacity
 * Examples: "5000 mah" → "5000mAh"
 */
export function normalizeBattery(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d+)\s*(mah)?$/i);
  
  if (match) {
    return `${match[1]}mAh`;
  }
  
  return cleaned;
}

/**
 * Normalize megapixels
 * Examples: "48 mp" → "48MP", "48mp" → "48MP"
 */
export function normalizeMegapixels(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d+)\s*(MP|MEGAPIXELS?)?$/i);
  
  if (match) {
    return `${match[1]}MP`;
  }
  
  return cleaned;
}

/**
 * Normalize resolution
 * Examples: "4k" → "4K", "1080p" → "1080p", "3840x2160" → "4K"
 */
export function normalizeResolution(value: string): string {
  const cleaned = value.trim().toLowerCase();
  
  // Map common resolutions
  const resolutionMap: Record<string, string> = {
    '3840x2160': '4K',
    '3840 x 2160': '4K',
    '4k': '4K',
    '4k uhd': '4K UHD',
    '1920x1080': '1080p',
    '1920 x 1080': '1080p',
    'full hd': '1080p',
    'fhd': '1080p',
    '1280x720': '720p',
    '720p': '720p',
    'hd': '720p',
    '8k': '8K',
    '7680x4320': '8K'
  };
  
  return resolutionMap[cleaned] || value.trim().toUpperCase();
}

/**
 * Normalize a product name for matching
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/[^\w\s-]/g, '')       // Remove special chars except hyphen
    .replace(/\s*-\s*/g, '-')       // Clean hyphens
    .trim();
}

/**
 * Normalize a spec key
 * Examples: "Screen Size" → "screen_size", "RAM" → "ram"
 */
export function normalizeSpecKey(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '');
}

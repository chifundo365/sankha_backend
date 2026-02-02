/**
 * Bulk Upload Staging Service (Stub)
 * ====================================
 * NOTE: Full v4.0 staging pipeline requires schema updates.
 * 
 * Required schema updates for full implementation:
 * - Create bulk_upload_staging table
 * - bulk_uploads: add batch_id, template_type, needs_specs, needs_images
 * - products: add is_verified field
 * - shop_products: add variant_values field
 * - listing_status enum: add NEEDS_SPECS, BROKEN values  
 * - upload_status enum: add STAGING, CANCELLED values
 */

const NOT_IMPLEMENTED_MSG = 'The v4.0 staging pipeline requires schema migration.';

export const bulkUploadStagingService = {
  generateBatchId(shopId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${shopId.substring(0, 8)}-${timestamp}-${random}`;
  },

  async insertStagingRows(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  },

  async validateStagingBatch(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  },

  async getPreview(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  },

  async getCorrectionData(): Promise<any[]> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  },

  async commitBatch(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  },

  async cancelBatch(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  }
};

export default bulkUploadStagingService;

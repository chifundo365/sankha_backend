/**
 * Bulk Upload Correction Service (Stub)
 * =======================================
 * NOTE: Full v4.0 correction file features require schema updates.
 * 
 * Required schema updates:
 * - bulk_uploads: add batch_id, template_type fields
 */

const NOT_IMPLEMENTED_MSG = 'The v4.0 correction file feature requires schema migration.';

export const bulkUploadCorrectionService = {
  async generateCorrectionFile(): Promise<{ buffer: Buffer; filename: string; summary: any }> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  },

  async markCorrectionDownloaded(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  },

  async getCorrectionPreview(): Promise<any> {
    throw new Error(NOT_IMPLEMENTED_MSG);
  }
};

export default bulkUploadCorrectionService;

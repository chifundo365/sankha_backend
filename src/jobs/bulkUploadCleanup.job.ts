/**
 * Bulk Upload Cleanup Job v4.0
 * ============================
 * Automated cleanup of stale staging data and abandoned batches.
 * 
 * Responsibilities:
 * 1. Delete staging rows older than STAGING_RETENTION_HOURS
 * 2. Mark abandoned uploads as CANCELLED
 * 3. Generate cleanup reports for monitoring
 * 
 * Schedule: Runs nightly at midnight (configurable via cron)
 * 
 * INSTALLATION:
 *   npm install node-cron
 *   npm install -D @types/node-cron
 */

import prisma from '../prismaClient';

// Try to import node-cron, but don't fail if not installed
let cron: any = null;
try {
  cron = require('node-cron');
} catch (e) {
  console.log('[BulkUploadCleanup] node-cron not installed. Scheduled cleanup disabled.');
  console.log('[BulkUploadCleanup] To enable: npm install node-cron @types/node-cron');
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  STAGING_RETENTION_HOURS: parseInt(process.env.STAGING_RETENTION_HOURS || '24'),
  ABANDONED_BATCH_HOURS: parseInt(process.env.ABANDONED_BATCH_HOURS || '48'),
  COMPLETED_BATCH_RETENTION_DAYS: parseInt(process.env.COMPLETED_BATCH_RETENTION_DAYS || '30'),
  
  // Cron schedule: Default is midnight every day
  // Format: second(optional) minute hour day-of-month month day-of-week
  CLEANUP_SCHEDULE: process.env.CLEANUP_CRON_SCHEDULE || '0 0 * * *', // midnight daily
  
  // Enable/disable scheduled cleanup
  ENABLE_SCHEDULED_CLEANUP: process.env.ENABLE_SCHEDULED_CLEANUP !== 'false'
};

// ============================================================================
// TYPES
// ============================================================================

export interface CleanupResult {
  stagingRowsDeleted: number;
  batchesCancelled: number;
  oldBatchesDeleted: number;
  duration: number;
  timestamp: Date;
  errors: string[];
}

export interface CleanupStats {
  pendingStagingRows: number;
  staleBatches: number;
  oldCompletedBatches: number;
}

// ============================================================================
// CLEANUP SERVICE
// ============================================================================

export const bulkUploadCleanupService = {
  /**
   * Get current cleanup statistics (for monitoring/dashboard)
   */
  async getCleanupStats(): Promise<CleanupStats> {
    const now = new Date();
    const stagingCutoff = new Date(now.getTime() - CONFIG.STAGING_RETENTION_HOURS * 60 * 60 * 1000);
    const abandonedCutoff = new Date(now.getTime() - CONFIG.ABANDONED_BATCH_HOURS * 60 * 60 * 1000);
    const completedCutoff = new Date(now.getTime() - CONFIG.COMPLETED_BATCH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const [pendingStagingRows, staleBatches, oldCompletedBatches] = await Promise.all([
      // Count staging rows older than retention period
      prisma.bulk_upload_staging.count({
        where: {
          created_at: { lt: stagingCutoff },
          validation_status: { notIn: ['COMMITTED'] }
        }
      }),
      
      // Count batches in STAGING status older than abandoned threshold
      prisma.bulk_uploads.count({
        where: {
          status: 'STAGING',
          created_at: { lt: abandonedCutoff }
        }
      }),
      
      // Count completed batches older than retention period
      prisma.bulk_uploads.count({
        where: {
          status: { in: ['COMPLETED', 'CANCELLED', 'FAILED'] },
          created_at: { lt: completedCutoff }
        }
      })
    ]);

    return {
      pendingStagingRows,
      staleBatches,
      oldCompletedBatches
    };
  },

  /**
   * Clean up old staging rows that were never committed
   * Deletes rows where:
   * - created_at is older than STAGING_RETENTION_HOURS
   * - validation_status is not COMMITTED
   */
  async cleanupOldStagingRows(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - CONFIG.STAGING_RETENTION_HOURS);

    const result = await prisma.bulk_upload_staging.deleteMany({
      where: {
        created_at: { lt: cutoffDate },
        validation_status: { notIn: ['COMMITTED'] }
      }
    });

    return result.count;
  },

  /**
   * Cancel abandoned batches
   * Marks batches as CANCELLED where:
   * - status is STAGING
   * - created_at is older than ABANDONED_BATCH_HOURS
   */
  async cancelAbandonedBatches(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - CONFIG.ABANDONED_BATCH_HOURS);

    const result = await prisma.bulk_uploads.updateMany({
      where: {
        status: 'STAGING',
        created_at: { lt: cutoffDate }
      },
      data: {
        status: 'CANCELLED',
        completed_at: new Date()
      }
    });

    return result.count;
  },

  /**
   * Delete old completed batch records (for data hygiene)
   * Only deletes batch metadata, not the created products
   */
  async deleteOldCompletedBatches(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.COMPLETED_BATCH_RETENTION_DAYS);

    // First delete any remaining staging rows for old batches
    await prisma.bulk_upload_staging.deleteMany({
      where: {
        bulk_uploads: {
          status: { in: ['COMPLETED', 'CANCELLED', 'FAILED'] },
          created_at: { lt: cutoffDate }
        }
      }
    });

    // Then delete the batch records
    const result = await prisma.bulk_uploads.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'CANCELLED', 'FAILED'] },
        created_at: { lt: cutoffDate }
      }
    });

    return result.count;
  },

  /**
   * Run full cleanup process
   * Executes all cleanup operations and returns results
   */
  async runFullCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let stagingRowsDeleted = 0;
    let batchesCancelled = 0;
    let oldBatchesDeleted = 0;

    console.log('[BulkUploadCleanup] Starting cleanup job...');

    // Step 1: Clean up old staging rows
    try {
      stagingRowsDeleted = await this.cleanupOldStagingRows();
      console.log(`[BulkUploadCleanup] Deleted ${stagingRowsDeleted} old staging rows`);
    } catch (error) {
      const errorMsg = `Failed to cleanup staging rows: ${error}`;
      console.error(`[BulkUploadCleanup] ${errorMsg}`);
      errors.push(errorMsg);
    }

    // Step 2: Cancel abandoned batches
    try {
      batchesCancelled = await this.cancelAbandonedBatches();
      console.log(`[BulkUploadCleanup] Cancelled ${batchesCancelled} abandoned batches`);
    } catch (error) {
      const errorMsg = `Failed to cancel abandoned batches: ${error}`;
      console.error(`[BulkUploadCleanup] ${errorMsg}`);
      errors.push(errorMsg);
    }

    // Step 3: Delete old completed batches (optional, for data hygiene)
    try {
      oldBatchesDeleted = await this.deleteOldCompletedBatches();
      console.log(`[BulkUploadCleanup] Deleted ${oldBatchesDeleted} old completed batches`);
    } catch (error) {
      const errorMsg = `Failed to delete old batches: ${error}`;
      console.error(`[BulkUploadCleanup] ${errorMsg}`);
      errors.push(errorMsg);
    }

    const duration = Date.now() - startTime;
    const result: CleanupResult = {
      stagingRowsDeleted,
      batchesCancelled,
      oldBatchesDeleted,
      duration,
      timestamp: new Date(),
      errors
    };

    console.log(`[BulkUploadCleanup] Cleanup completed in ${duration}ms`, result);

    return result;
  },

  /**
   * Clean up a specific batch manually
   * Useful for admin operations
   */
  async cleanupBatch(batchId: string): Promise<{ deleted: number; status: string }> {
    // Delete staging rows
    const deleted = await prisma.bulk_upload_staging.deleteMany({
      where: { batch_id: batchId }
    });

    // Update batch status
    await prisma.bulk_uploads.updateMany({
      where: { batch_id: batchId },
      data: {
        status: 'CANCELLED',
        completed_at: new Date()
      }
    });

    return { deleted: deleted.count, status: 'CANCELLED' };
  },

  /**
   * Clean up all batches for a specific shop
   * Useful when disabling a shop's bulk upload access
   */
  async cleanupShopBatches(shopId: string): Promise<{ batches: number; rows: number }> {
    // Delete all staging rows for shop
    const rowsDeleted = await prisma.bulk_upload_staging.deleteMany({
      where: {
        shop_id: shopId,
        validation_status: { notIn: ['COMMITTED'] }
      }
    });

    // Cancel all pending batches for shop
    const batchesUpdated = await prisma.bulk_uploads.updateMany({
      where: {
        shop_id: shopId,
        status: 'STAGING'
      },
      data: {
        status: 'CANCELLED',
        completed_at: new Date()
      }
    });

    return { batches: batchesUpdated.count, rows: rowsDeleted.count };
  }
};

// ============================================================================
// CRON SCHEDULER
// ============================================================================

let scheduledJob: any = null;

/**
 * Start the scheduled cleanup job
 */
export function startCleanupScheduler(): void {
  if (!cron) {
    console.log('[BulkUploadCleanup] Cannot start scheduler: node-cron not installed');
    console.log('[BulkUploadCleanup] Install with: npm install node-cron @types/node-cron');
    return;
  }

  if (!CONFIG.ENABLE_SCHEDULED_CLEANUP) {
    console.log('[BulkUploadCleanup] Scheduled cleanup is disabled');
    return;
  }

  if (scheduledJob) {
    console.log('[BulkUploadCleanup] Scheduler already running');
    return;
  }

  console.log(`[BulkUploadCleanup] Starting scheduler with schedule: ${CONFIG.CLEANUP_SCHEDULE}`);

  scheduledJob = cron.schedule(CONFIG.CLEANUP_SCHEDULE, async () => {
    console.log('[BulkUploadCleanup] Running scheduled cleanup...');
    
    try {
      const result = await bulkUploadCleanupService.runFullCleanup();
      
      // Log to monitoring (could be extended to send to metrics service)
      console.log('[BulkUploadCleanup] Scheduled cleanup completed:', {
        stagingRowsDeleted: result.stagingRowsDeleted,
        batchesCancelled: result.batchesCancelled,
        oldBatchesDeleted: result.oldBatchesDeleted,
        duration: `${result.duration}ms`,
        errors: result.errors.length
      });
    } catch (error) {
      console.error('[BulkUploadCleanup] Scheduled cleanup failed:', error);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'Africa/Blantyre' // Malawi timezone
  });

  console.log('[BulkUploadCleanup] Scheduler started successfully');
}

/**
 * Stop the scheduled cleanup job
 */
export function stopCleanupScheduler(): void {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log('[BulkUploadCleanup] Scheduler stopped');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return scheduledJob !== null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ...bulkUploadCleanupService,
  startCleanupScheduler,
  stopCleanupScheduler,
  isSchedulerRunning,
  CONFIG
};

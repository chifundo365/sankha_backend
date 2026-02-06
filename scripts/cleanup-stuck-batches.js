/**
 * Cleanup Script for Stuck Bulk Upload Batches
 * ==============================================
 * Fixes batches stuck in PROCESSING status:
 * 1. Batches with staging data but not committed → Mark as STAGING
 * 2. Old batches (>7 days) with no activity → Mark as FAILED
 * 3. Batches with products created but status not updated → Mark as COMPLETED
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupStuckBatches() {
  console.log('🔍 Scanning for stuck bulk upload batches...\n');

  try {
    // 1. Find batches stuck in PROCESSING
    const processingBatches = await prisma.bulk_uploads.findMany({
      where: {
        status: 'PROCESSING',
        created_at: {
          lt: new Date(Date.now() - 10 * 60 * 1000) // Older than 10 minutes
        }
      },
      orderBy: { created_at: 'desc' }
    });

    console.log(`Found ${processingBatches.length} batches in PROCESSING status\n`);

    let stagingUpdated = 0;
    let completedUpdated = 0;
    let failedUpdated = 0;

    for (const batch of processingBatches) {
      console.log(`Processing batch: ${batch.id} (${batch.file_name})`);
      console.log(`  Created: ${batch.created_at}`);
      console.log(`  Batch ID: ${batch.batch_id || 'N/A'}`);

      // Check if batch has staging data
      if (batch.batch_id) {
        const stagingCount = await prisma.bulk_upload_staging.count({
          where: { batch_id: batch.batch_id }
        });

        if (stagingCount > 0) {
          // Has staging data - check if it has committed rows
          const committedCount = await prisma.bulk_upload_staging.count({
            where: {
              batch_id: batch.batch_id,
              validation_status: 'COMMITTED'
            }
          });

          if (committedCount > 0) {
            // Some rows were committed - mark as COMPLETED
            await prisma.bulk_uploads.update({
              where: { id: batch.id },
              data: {
                status: 'COMPLETED',
                successful: committedCount,
                completed_at: new Date()
              }
            });
            console.log(`  ✅ Updated to COMPLETED (${committedCount} products committed)\n`);
            completedUpdated++;
          } else {
            // Has staging data but not committed - mark as STAGING
            await prisma.bulk_uploads.update({
              where: { id: batch.id },
              data: { status: 'STAGING' }
            });
            console.log(`  📋 Updated to STAGING (${stagingCount} rows in staging)\n`);
            stagingUpdated++;
          }
          continue;
        }
      }

      // Check if products were created (v3 system)
      const productsCount = await prisma.shop_products.count({
        where: { bulk_upload_id: batch.id }
      });

      if (productsCount > 0) {
        // Products were created - mark as COMPLETED
        await prisma.bulk_uploads.update({
          where: { id: batch.id },
          data: {
            status: 'COMPLETED',
            successful: productsCount,
            completed_at: new Date()
          }
        });
        console.log(`  ✅ Updated to COMPLETED (${productsCount} products found)\n`);
        completedUpdated++;
      } else {
        // No staging data, no products - check age
        const ageInDays = (Date.now() - batch.created_at.getTime()) / (1000 * 60 * 60 * 24);
        
        if (ageInDays > 7) {
          // Old batch with no data - mark as FAILED
          await prisma.bulk_uploads.update({
            where: { id: batch.id },
            data: {
              status: 'FAILED',
              errors: { error: 'Batch abandoned or failed during processing' }
            }
          });
          console.log(`  ❌ Updated to FAILED (${ageInDays.toFixed(1)} days old, no data)\n`);
          failedUpdated++;
        } else {
          console.log(`  ⏳ Left as PROCESSING (${ageInDays.toFixed(1)} days old, may still be processing)\n`);
        }
      }
    }

    console.log('\n📊 Cleanup Summary:');
    console.log(`  ${stagingUpdated} batches updated to STAGING`);
    console.log(`  ${completedUpdated} batches updated to COMPLETED`);
    console.log(`  ${failedUpdated} batches updated to FAILED`);
    console.log(`  ${processingBatches.length - stagingUpdated - completedUpdated - failedUpdated} batches left as PROCESSING`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run cleanup
cleanupStuckBatches();

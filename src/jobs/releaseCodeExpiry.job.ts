import { orderConfirmationService } from '../services/orderConfirmation.service';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

class ReleaseCodeExpiryJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly intervalMs: number;
  private readonly enabled: boolean;

  constructor() {
    const parsedInterval = Number(process.env.RELEASE_CODE_EXPIRY_CHECK_INTERVAL_MS || DEFAULT_INTERVAL_MS);
    this.intervalMs = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : DEFAULT_INTERVAL_MS;
    this.enabled = process.env.ENABLE_RELEASE_CODE_EXPIRY_JOB !== 'false';
  }

  start() {
    if (!this.enabled) {
      console.log('[ReleaseCodeExpiry] Job disabled via ENABLE_RELEASE_CODE_EXPIRY_JOB=false');
      return;
    }

    if (this.intervalId) {
      console.log('[ReleaseCodeExpiry] Job already running');
      return;
    }

    console.log(`[ReleaseCodeExpiry] Starting job (every ${Math.round(this.intervalMs / 60000)} min)`);

    // Run immediately on startup
    this.runJob();

    this.intervalId = setInterval(() => {
      this.runJob();
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ReleaseCodeExpiry] Job stopped');
    }
  }

  private async runJob() {
    if (this.isRunning) {
      console.log('[ReleaseCodeExpiry] Previous run still in progress, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('[ReleaseCodeExpiry] Checking for expired release codes...');

    try {
      const processed = await orderConfirmationService.processExpiredReleaseCodes();

      if (processed > 0) {
        console.log(`[ReleaseCodeExpiry] Marked ${processed} order(s) as expired and cancelled`);
      } else {
        console.log('[ReleaseCodeExpiry] No expired release codes found');
      }
    } catch (error) {
      console.error('[ReleaseCodeExpiry] Job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

export const releaseCodeExpiryJob = new ReleaseCodeExpiryJob();

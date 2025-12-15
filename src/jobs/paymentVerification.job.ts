import { paymentService } from '../services/payment.service';

/**
 * Payment Verification Background Job
 * Runs periodically to check and update pending payments
 */
class PaymentVerificationJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private intervalMs: number;

  constructor(intervalMinutes: number = 1) {
    this.intervalMs = intervalMinutes * 60 * 1000;
  }

  /**
   * Start the background job
   */
  start() {
    if (this.intervalId) {
      console.log('Payment verification job is already running');
      return;
    }

    console.log('🔄 Starting payment verification background job...');
    
    // Run immediately on start
    this.runJob();

    // Then run at intervals
    this.intervalId = setInterval(() => {
      this.runJob();
    }, this.intervalMs);

    console.log(`✅ Payment verification job started (runs every ${this.intervalMs / 60000} minutes)`);
  }

  /**
   * Stop the background job
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏹️  Payment verification job stopped');
    }
  }

  /**
   * Run the verification job
   */
  private async runJob() {
    if (this.isRunning) {
      console.log('Payment verification job already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('Background job started: Checking pending payments...');

    try {
      // 1. Mark expired payments as failed
      await this.processExpiredPayments();

      // 2. Verify pending (non-expired) payments
      await this.verifyPendingPayments();

    } catch (error) {
      console.error('Error in payment verification job:', error);
    } finally {
      this.isRunning = false;
      console.log('Background job finished');
    }
  }

  /**
   * Process expired payments - mark them as failed and restore stock
   */
  private async processExpiredPayments() {
    try {
      const expiredPayments = await paymentService.getExpiredPayments();
      
      if (expiredPayments.length === 0) {
        return;
      }

      console.log(`Found ${expiredPayments.length} expired payments to process`);

      for (const payment of expiredPayments) {
        if (!payment.tx_ref) continue;
        
        try {
          // Mark payment as failed
          await paymentService.markPaymentAsFailed(payment.tx_ref, 'BACKGROUND_JOB');
          console.log(`Expired payment marked as failed: ${payment.tx_ref}`);
          
          // Restore stock for linked orders
          if (payment.order_id) {
            await paymentService.restoreOrderStock(payment.order_id, 'Payment expired');
            console.log(`Stock restored for expired payment: ${payment.tx_ref}`);
          }
        } catch (error) {
          console.error(`Error processing expired payment ${payment.tx_ref}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing expired payments:', error);
    }
  }

  /**
   * Verify pending payments with PayChangu
   */
  private async verifyPendingPayments() {
    try {
      const pendingPayments = await paymentService.getPendingPayments();

      if (pendingPayments.length === 0) {
        return;
      }

      console.log(`Found ${pendingPayments.length} pending payments to verify`);

      for (const payment of pendingPayments) {
        if (!payment.tx_ref) continue;
        
        try {
          const result = await paymentService.verifyPayment(payment.tx_ref, 'BACKGROUND_JOB');
          
          if (result.statusChanged) {
            console.log(`Payment ${payment.tx_ref} status updated: ${result.payment.status}`);
          }
        } catch (error: any) {
          console.error(`Error verifying payment ${payment.tx_ref}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error verifying pending payments:', error);
    }
  }
}

// Create singleton instance
export const paymentVerificationJob = new PaymentVerificationJob(1); // Run every 1 minute

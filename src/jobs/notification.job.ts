import { Worker } from 'bullmq';
import { enqueueEmail, enqueueSms, getNotificationQueueConnection, isNotificationQueueEnabled, notificationQueueName } from '../queues/notificationQueue';
import { sendEmail, SendEmailOptions } from '../services/email.service';
import { sendSms } from '../services/sms.service';

class NotificationJob {
  private worker: Worker | null = null;

  start() {
    if (!isNotificationQueueEnabled()) {
      console.log('[NotificationJob] Queue disabled; synchronous notifications will be used');
      return;
    }

    if (this.worker) {
      console.log('[NotificationJob] Worker already running');
      return;
    }

    const connection = getNotificationQueueConnection();
    if (!connection) {
      console.warn('[NotificationJob] No Redis connection; skipping worker start');
      return;
    }

    this.worker = new Worker(notificationQueueName, async (job) => {
      if (job.name === 'email') {
        const payload = job.data as SendEmailOptions;
        return await sendEmail(payload, { skipQueue: true });
      }

      if (job.name === 'sms') {
        const payload = job.data as { to: string | string[]; message: string };
        return await sendSms(payload.to, payload.message, { skipQueue: true });
      }

      throw new Error(`Unknown notification job type: ${job.name}`);
    }, {
      connection,
    });

    this.worker.on('completed', (job) => {
      console.log(`[NotificationJob] Completed ${job.name} job ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[NotificationJob] Failed ${job?.name} job ${job?.id}:`, err?.message || err);
    });

    console.log('[NotificationJob] Worker started');
  }

  async stop() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[NotificationJob] Worker stopped');
    }
  }
}

export const notificationJob = new NotificationJob();

// Convenience enqueue helpers for callers
export const enqueueEmailNotification = enqueueEmail;
export const enqueueSmsNotification = enqueueSms;

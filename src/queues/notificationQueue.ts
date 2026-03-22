import IORedis from 'ioredis';
import { Queue, JobsOptions } from 'bullmq';

export type EmailJobPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type SmsJobPayload = {
  to: string | string[];
  message: string;
};

const ENABLED = process.env.ENABLE_NOTIFICATION_QUEUE === 'true';
const QUEUE_NAME = process.env.NOTIFICATION_QUEUE_NAME || 'notification-queue';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let connection: IORedis | null = null;
let queue: Queue | null = null;

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

function ensureQueue(): Queue | null {
  if (!ENABLED) return null;
  if (queue) return queue;

  try {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    });

    queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions,
    });

    console.log(`[NotificationQueue] Initialized (name=${QUEUE_NAME})`);
  } catch (err) {
    console.error('[NotificationQueue] Failed to initialize queue; falling back to direct sends', err);
    connection = null;
    queue = null;
  }

  return queue;
}

export const isNotificationQueueEnabled = () => ENABLED && Boolean(ensureQueue());

export const getNotificationQueueConnection = () => {
  ensureQueue();
  return connection;
};

export const notificationQueueName = QUEUE_NAME;

export async function enqueueEmail(payload: EmailJobPayload) {
  const q = ensureQueue();
  if (!q) return null;
  return q.add('email', payload);
}

export async function enqueueSms(payload: SmsJobPayload) {
  const q = ensureQueue();
  if (!q) return null;
  return q.add('sms', payload);
}

export async function closeNotificationQueue() {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}

import { createClient, RedisClientType } from 'redis';

class RedisClient {
  private static instance: RedisClient;
  private client: RedisClientType | null = null;
  private isConnecting: boolean = false;

  private constructor() {}

  /**
   * Get singleton instance of RedisClient
   */
  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<RedisClientType> {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait for ongoing connection
      while (this.isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.client?.isOpen) {
        return this.client;
      }
    }

    try {
      this.isConnecting = true;

      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      // Configure TLS options for rediss:// URLs
      const socketOptions: any = {
        reconnectStrategy: (retries: number) => {
          if (retries > 20) {
            console.error('Redis: Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          // Exponential backoff with jitter: 100ms, 200ms, 400ms... max 5s
          const baseDelay = Math.min(Math.pow(2, retries) * 100, 5000);
          const jitter = Math.random() * 100;
          const delay = baseDelay + jitter;
          // Only log every 3rd attempt to reduce noise
          if (retries % 3 === 0 || retries === 1) {
            console.log(`Redis: Reconnecting in ${Math.round(delay)}ms (attempt ${retries})`);
          }
          return delay;
        },
        // Keep connection alive with ping
        keepAlive: 30000, // 30 seconds
        connectTimeout: 10000, // 10 seconds
      };

      // Add TLS configuration if using rediss://
      if (redisUrl.startsWith('rediss://')) {
        socketOptions.tls = true;
        socketOptions.rejectUnauthorized = false;
      }
      
      this.client = createClient({
        url: redisUrl,
        socket: socketOptions,
        // Disable offline queue to fail fast when disconnected
        disableOfflineQueue: false,
      });

      // Event handlers - reduce noise for expected reconnection events
      this.client.on('error', (err) => {
        // ECONNRESET is expected from cloud Redis idle timeouts, don't spam logs
        if (err.code === 'ECONNRESET') {
          console.log('Redis: Connection reset (idle timeout), will reconnect...');
        } else {
          console.error('Redis Client Error:', err);
        }
      });

      this.client.on('connect', () => {
        console.log('Redis: Connecting...');
      });

      this.client.on('ready', () => {
        console.log('Redis: Connected and ready');
      });

      this.client.on('reconnecting', () => {
        // Logged in reconnectStrategy, skip here to reduce noise
      });

      this.client.on('end', () => {
        console.log('Redis: Connection closed');
      });

      await this.client.connect();
      this.isConnecting = false;
      return this.client;
    } catch (error) {
      this.isConnecting = false;
      console.error('Redis: Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Get the Redis client (connects if not connected)
   */
  public async getClient(): Promise<RedisClientType> {
    if (!this.client || !this.client.isOpen) {
      return await this.connect();
    }
    return this.client;
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
      this.client = null;
    }
  }

  /**
   * Check if Redis is connected
   */
  public isConnected(): boolean {
    return this.client?.isOpen || false;
  }
}

// Export singleton instance getter
export const redisClient = RedisClient.getInstance();

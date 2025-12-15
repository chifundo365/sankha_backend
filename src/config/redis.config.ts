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
          if (retries > 10) {
            console.error('Redis: Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          const delay = Math.min(retries * 100, 3000);
          console.log(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      };

      // Add TLS configuration if using rediss://
      if (redisUrl.startsWith('rediss://')) {
        socketOptions.tls = true;
        socketOptions.rejectUnauthorized = false;
      }
      
      this.client = createClient({
        url: redisUrl,
        socket: socketOptions,
      });

      // Event handlers
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('Redis: Connecting...');
      });

      this.client.on('ready', () => {
        console.log('Redis: Connected and ready');
      });

      this.client.on('reconnecting', () => {
        console.log('Redis: Reconnecting...');
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

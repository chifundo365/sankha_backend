import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import routes from './routes/index';
import { errorResponse } from './utils/response';
import { redisClient } from './config/redis.config';
import { validatePaychanguConfig } from './config/paychangu.config';
import { paymentVerificationJob } from './jobs/paymentVerification.job';
import { withdrawalVerificationJob } from './jobs/withdrawalVerification.job';
import { shopRatingAggregationJob } from './jobs/shopRatingAggregation.job';
import { releaseCodeExpiryJob } from './jobs/releaseCodeExpiry.job';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parse cookies for httpOnly refresh token

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    message: 'Sankha v.4 API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((_req: Request, res: Response) => {
  errorResponse(res, 'Route not found', null, 404);
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, async () => {
  console.log(`🚀 Server listening on http://localhost:${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize Redis connection
  try {
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
  } catch (error) {
    console.warn('⚠️  Redis connection failed - rate limiting will fail open:', error);
  }

  // Validate PayChangu configuration
  if (validatePaychanguConfig()) {
    // Start payment verification background job
    // paymentVerificationJob.start();
    // Start withdrawal verification background job
    // withdrawalVerificationJob.start();
  }

  // Start shop rating aggregation job if enabled via env
  if (process.env.SHOP_RATING_AGGREGATION_ENABLED === 'true') {
    shopRatingAggregationJob.start();
  }

  // Release code expiry guardrail (defaults to enabled)
  releaseCodeExpiryJob.start();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  paymentVerificationJob.stop();
  withdrawalVerificationJob.stop();
  shopRatingAggregationJob.stop();
  releaseCodeExpiryJob.stop();
  await redisClient.disconnect();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  paymentVerificationJob.stop();
  withdrawalVerificationJob.stop();
  shopRatingAggregationJob.stop();
  releaseCodeExpiryJob.stop();
  await redisClient.disconnect();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;

import { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../prismaClient';
import { redisClient } from '../config/redis.config';
import { paychanguConfig } from '../config/paychangu.config';

/**
 * Lightweight health check that validates core dependencies.
 * Does not throw; returns component-level statuses for monitoring.
 */
export const healthCheck = async (_req: Request, res: Response) => {
  const results: Record<string, { ok: boolean; error?: string }> = {
    api: { ok: true },
    db: { ok: false },
    redis: { ok: false },
    paychangu: { ok: false },
  };

  // DB check: simple SELECT 1
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.db.ok = true;
  } catch (err: any) {
    results.db = { ok: false, error: err?.message || 'db_check_failed' };
  }

  // Redis check: ping existing connection or connect+ping
  try {
    const client = await redisClient.getClient();
    const pong = await client.ping();
    results.redis.ok = pong === 'PONG';
    if (!results.redis.ok) {
      results.redis.error = `Unexpected ping response: ${pong}`;
    }
  } catch (err: any) {
    results.redis = { ok: false, error: err?.message || 'redis_check_failed' };
  }

  // PayChangu reachability: only if configured
  const paychanguConfigured = Boolean(paychanguConfig.secretKey && paychanguConfig.webhookSecretKey);
  if (paychanguConfigured) {
    try {
      // HEAD to apiBase to avoid side effects; tolerate non-2xx as connectivity proof
      await axios.head(paychanguConfig.apiBase, { timeout: 3000, validateStatus: () => true });
      results.paychangu.ok = true;
    } catch (err: any) {
      results.paychangu = { ok: false, error: err?.message || 'paychangu_check_failed' };
    }
  } else {
    results.paychangu = { ok: false, error: 'paychangu_not_configured' };
  }

  const degraded = Object.values(results).some((r) => !r.ok);
  const status = degraded ? 'degraded' : 'ok';

  res.status(degraded ? 503 : 200).json({
    status,
    timestamp: new Date().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
    results,
  });
};

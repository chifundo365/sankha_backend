import prisma from '../prismaClient';
import { withdrawalService } from '../services/withdrawal.service';
import { sendSms } from '../services/sms.service';
import { Prisma } from '../../generated/prisma';

/**
 * Withdrawal Verification Background Job
 * Polls PayChangu for payout status on PROCESSING withdrawals.
 * Runs every 2 minutes.
 */
class WithdrawalVerificationJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private intervalMs: number;

  constructor(intervalMinutes: number = 2) {
    this.intervalMs = intervalMinutes * 60 * 1000;
  }

  start() {
    if (this.intervalId) {
      console.log('Withdrawal verification job is already running');
      return;
    }

    console.log('🔄 Starting withdrawal verification background job...');
    this.runJob();
    this.intervalId = setInterval(() => this.runJob(), this.intervalMs);
    console.log(`✅ Withdrawal verification job started (runs every ${this.intervalMs / 60000} minutes)`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏹️  Withdrawal verification job stopped');
    }
  }

  private async runJob() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const processingWithdrawals = await prisma.withdrawals.findMany({
        where: {
          status: 'PROCESSING',
          charge_id: { not: null },
          created_at: { gte: sevenDaysAgo },
        },
        include: {
          shops: { select: { id: true, phone: true } },
        },
      });

      if (processingWithdrawals.length === 0) return;

      for (const w of processingWithdrawals) {
        try {
          // Check if older than 48 hours — auto-fail
          if (w.created_at && w.created_at < fortyEightHoursAgo) {
            await prisma.$transaction([
              prisma.withdrawals.update({
                where: { id: w.id },
                data: {
                  status: 'FAILED',
                  failed_at: new Date(),
                  failure_reason: 'Could not be confirmed after 48 hours',
                  updated_at: new Date(),
                },
              }),
              prisma.shops.update({
                where: { id: w.shop_id },
                data: {
                  wallet_balance: { increment: new Prisma.Decimal(Number(w.amount)) },
                  updated_at: new Date(),
                },
              }),
            ]);

            if (w.shops?.phone) {
              try {
                await sendSms(
                  w.shops.phone,
                  `Your withdrawal could not be confirmed after 48 hours. Your balance has been restored. Please try again.`,
                );
              } catch (_) {}
            }
            continue;
          }

          // Verify with PayChangu
          const payoutStatus = await withdrawalService.verifyPayout({
            charge_id: w.charge_id!,
            type: w.payout_method as 'MOBILE_MONEY' | 'BANK',
          });

          if (payoutStatus === 'SUCCESS') {
            await prisma.withdrawals.update({
              where: { id: w.id },
              data: {
                status: 'COMPLETED',
                completed_at: new Date(),
                updated_at: new Date(),
              },
            });

            if (w.shops?.phone) {
              try {
                await sendSms(
                  w.shops.phone,
                  `Your withdrawal of MWK ${Number(w.amount).toLocaleString()} completed successfully.`,
                );
              } catch (_) {}
            }
          } else if (payoutStatus === 'FAILED') {
            await prisma.$transaction([
              prisma.withdrawals.update({
                where: { id: w.id },
                data: {
                  status: 'FAILED',
                  failed_at: new Date(),
                  failure_reason: 'Payout failed at provider',
                  updated_at: new Date(),
                },
              }),
              prisma.shops.update({
                where: { id: w.shop_id },
                data: {
                  wallet_balance: { increment: new Prisma.Decimal(Number(w.amount)) },
                  updated_at: new Date(),
                },
              }),
            ]);

            if (w.shops?.phone) {
              try {
                await sendSms(
                  w.shops.phone,
                  `Your withdrawal of MWK ${Number(w.amount).toLocaleString()} failed. Your wallet balance has been restored.`,
                );
              } catch (_) {}
            }
          }
          // PENDING — leave as PROCESSING, check again next cycle
        } catch (error: any) {
          console.error(`Error verifying withdrawal ${w.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error in withdrawal verification job:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

export const withdrawalVerificationJob = new WithdrawalVerificationJob(2);

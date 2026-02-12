# Next Steps — Prioritized Implementation Plan

This document summarizes the highest-impact work to move the Sankha backend toward the escrow-based MVP. It recommends a small, ordered set of tasks you can start implementing immediately, with concrete first steps and files likely to change.

## Overview (pick 1–2 to start)
- Dual Pricing System (Critical)
- Release Code + OrderConfirmationService (Critical)
- Shop Wallet & Transactions + Payouts (Critical, follow release-code)
- Quick Win: Notification delivery for release codes (small)

---

## 1) Dual Pricing System (Start here if you want minimal schema + business logic work)
- Why: Required to separate buyer-facing price from seller payout; many escrow flows depend on this.
- Effort: Medium (schema migration + service updates)
- First concrete steps:
  - Update `prisma/schema.prisma`: add `base_price` to `shop_products` and `order_items`.
  - Add migration via Prisma.
  - Update product upload/update logic to accept/compute `base_price` and `price` (display). Likely files: `src/controllers/*`, `src/services/*` related to products and shop-products.
  - Update cart and checkout to freeze `base_price` into `order_items` when creating orders.

## 2) Release Code + OrderConfirmationService (High priority)
- Why: The release code is the escrow release trigger — must exist before wallets can be credited.
- Effort: Medium
- First concrete steps:
  - Update `prisma/schema.prisma` orders model: add `release_code`, `release_code_status`, `release_code_expires_at`, `release_code_verified_at`.
  - Create `src/services/orderConfirmation.service.ts` to generate codes when order becomes `CONFIRMED`, persist expiry, and verify codes.
  - Add endpoint `POST /api/orders/:orderId/verify-code` in `src/routes/orders.ts` to validate code and mark order `COMPLETED`.
  - Wire sending the code via notification service (console fallback ok for initial work).

## 3) Shop Wallet & Transaction Ledger + Payouts (Follow after release-code)
- Why: Needed to credit sellers and let them withdraw earnings.
- Effort: Large
- First concrete steps:
  - Add `wallet_balance` to `shops` and create `transactions` table in `prisma/schema.prisma`.
  - Implement `TransactionService` to append ledger entries and reconcile balances (`src/services/transaction.service.ts`).
  - Scaffold `PayoutService` and `POST /api/shops/payout` endpoint; integrate PayChangu disbursement later.

## Quick Win: Notification delivery (do this in parallel)
- Why: Release codes and order updates must reach users; an email/SMS worker is small and unlocks testing.
- Effort: Small
- First concrete steps:
  - Add a basic `NotificationWorker` (Bull/BullMQ or simple Redis queue) in `src/jobs/` and a `src/services/notification.service.ts` with console fallback.
  - Add templates for release code emails/SMS and a helper `sendReleaseCode(order, code)`.

---

## Suggested immediate work items (PR-sized)
1. PR A: Add `base_price` fields to Prisma schema + migration; update upload endpoint to compute both prices; add a unit test for price calculation.
2. PR B: Add release-code fields to `orders` + `OrderConfirmationService` with a stub `/verify-code` endpoint that flips status to `COMPLETED` and logs to console.
3. PR C: Scaffold `transactions` model and `TransactionService` (schema + simple endpoints to view wallet balance). Follow with payout integration.

## Notes & Decisions needed
- Commission method: markup (display = base × 1.0526) or store commission separately — pick one before rollout.
- Release code expiry policy (suggest 14 days) and minimum payout amount need product/ops decisions.

---

If you want, I can now scaffold the Prisma schema changes for (1) and create starter service files for the `OrderConfirmationService` and `NotificationService`. Which PR should I create first? Reply with `dual-pricing`, `release-code`, or `notifications` and I'll start.

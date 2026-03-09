# Sankha Withdrawal Foundation — Implementation Summary

**Date:** March 9, 2026
**Scope:** Seller withdrawal system with PayChangu payout integration (stubs for API calls)

---

## 1. Files Created

### `src/jobs/withdrawalVerification.job.ts`
Background job that polls PayChangu every 2 minutes for PROCESSING withdrawals:
- Finds all withdrawals where status=PROCESSING, charge_id is set, and created within 7 days
- Calls `verifyPayout()` for each — maps result to SUCCESS/FAILED/PENDING
- SUCCESS → marks COMPLETED, SMS seller
- FAILED → marks FAILED, restores wallet_balance in $transaction, SMS seller
- PENDING → leaves as PROCESSING for next cycle
- >48 hours old and still PROCESSING → auto-fails, restores balance, SMS seller

### `prisma/migrations/20260309_withdrawal_foundation.sql`
Raw SQL migration for manual application:
- Adds DEBT_CLEARED to withdrawal_status enum
- Adds seller_debt_balance to shops table
- Adds charge_id, destination_uuid, paychangu_fee, bank_fee, debt_deducted to withdrawals
- Removes recipient_phone and recipient_name from withdrawals
- Creates payout_operators table with uuid unique index
- Pre-seeds all 9 PayChangu destinations (7 banks + 2 MoMo)

---

## 2. Files Modified

### `prisma/schema.prisma`
- **withdrawals model:** Removed `recipient_phone`, `recipient_name`. Added `charge_id`, `destination_uuid`, `paychangu_fee`, `bank_fee`, `debt_deducted`. Added index on `charge_id`.
- **shops model:** Added `seller_debt_balance Decimal @default(0) @db.Decimal(12, 2)`
- **withdrawal_status enum:** Added `DEBT_CLEARED`
- **New model:** `payout_operators` with fields: id, uuid (unique), name, type, is_active, cached_at, updated_at

### `src/services/withdrawal.service.ts`
Complete rewrite. New functions:
- `getPayoutDestinations()` — 24hr cache in payout_operators table, falls back to PayChangu GET /banks
- `getDestinationByUuid(uuid)` — looks up single destination
- `initiatePayout(params)` — **STUB** for PayChangu payout API (MoMo + Bank)
- `verifyPayout(params)` — **STUB** for PayChangu payout status check
- `calculateWithdrawalFees(amount, type)` — 1.7% PayChangu fee + MWK 700 bank fee
- `handleDebtDeduction(params)` — deducts seller_debt_balance before payout
- `processWithdrawal(params)` — main orchestrator: validate → debt → fees → reserve → payout → SMS
- Legacy helpers preserved for admin endpoints: getWithdrawal, getShopWithdrawals, revertWithdrawal, cancelWithdrawal, adminCompleteWithdrawal, adminFailWithdrawal

### `src/controllers/withdrawal.controller.ts`
- **New:** `getDestinations` — GET /api/withdrawals/destinations (returns uuid, name, type)
- **New:** `initiateWithdrawal` — POST /api/withdrawals (body: amount, destination_uuid, account_number, account_name)
- **Updated:** `getMyWithdrawals` — returns destination_name (joined), never raw uuid or account info
- **Updated:** `getWithdrawalById` — resolves destination_name, returns safe fields only
- Admin endpoints preserved with updated field references (no more recipient_phone/recipient_name)
- `adminProcessWithdrawal` deprecated (sellers now initiate directly)

### `src/routes/withdrawal.routes.ts`
- Added `GET /destinations` route before all other routes

### `src/schemas/withdrawal.schema.ts`
- `requestWithdrawalSchema` updated: amount min=5000, requires destination_uuid, account_number, account_name. Removed recipient_phone, recipient_name, provider.
- `listWithdrawalsSchema` status enum includes DEBT_CLEARED

### `src/services/refund.service.ts`
- After seller-fault refund: increments `seller_debt_balance` by total absorbed fees (inbound 3% + outbound refund 1.7% + platform 3%)
- Creates ADJUSTMENT transaction record for transparency

### `src/server.ts`
- Imports and registers `withdrawalVerificationJob`
- Stops job on SIGTERM/SIGINT graceful shutdown

### `prisma/seed.ts`
- Added payout_operators seed with all 9 PayChangu destinations pre-seeded

---

## 3. Complete Withdrawal Flow — Step by Step

```
SELLER TAPS "WITHDRAW" ON VENDOR DASHBOARD
│
├── 1. Frontend calls GET /api/withdrawals/destinations
│   └── Returns list of banks + MoMo operators (uuid, name, type)
│   └── Seller selects destination from dropdown
│
├── 2. Seller fills in: amount, account_number, account_name
│   └── These are NOT stored — used for the API call only
│
├── 3. Frontend calls POST /api/withdrawals
│   Body: { amount, destination_uuid, account_number, account_name }
│
├── 4. SERVICE: processWithdrawal()
│   │
│   ├── VALIDATE
│   │   ├── Shop exists, is active
│   │   ├── amount <= wallet_balance
│   │   ├── amount >= 5,000 and <= 5,000,000
│   │   ├── destination_uuid, account_number, account_name not empty
│   │   └── destination exists in payout_operators
│   │
│   ├── DEBT DEDUCTION
│   │   ├── If seller_debt_balance >= amount → full debt absorption, DEBT_CLEARED, SMS, return
│   │   ├── If seller_debt_balance > 0 → partial deduction, adjusted_amount = amount - debt
│   │   └── If seller_debt_balance = 0 → no change
│   │
│   ├── CALCULATE FEES
│   │   ├── paychanguFee = ceil(amount × 1.7%)
│   │   ├── bankFee = MWK 700 for BANK, 0 for MOBILE_MONEY
│   │   └── netAmount = amount - paychanguFee - bankFee
│   │
│   ├── RESERVE FUNDS (Prisma $transaction)
│   │   ├── Decrement wallet_balance by adjusted_amount
│   │   └── Create withdrawal record (status: PROCESSING)
│   │
│   ├── INITIATE PAYOUT (currently stubbed)
│   │   ├── Calls PayChangu API with uuid, account_number, account_name, amount
│   │   ├── Stores returned charge_id on withdrawal
│   │   └── On failure: restore wallet, mark FAILED, SMS seller
│   │
│   └── SMS SELLER
│       └── "Your withdrawal of MWK X is being processed..."
│
├── 5. BACKGROUND JOB (every 2 minutes)
│   │
│   ├── Finds all PROCESSING withdrawals with charge_id
│   ├── Calls verifyPayout(charge_id) (currently stubbed)
│   │
│   ├── SUCCESS → mark COMPLETED, SMS seller
│   ├── FAILED → mark FAILED, restore wallet ($transaction), SMS seller
│   ├── PENDING → leave as PROCESSING
│   └── >48 hours → auto-fail, restore wallet, SMS seller
│
└── 6. SELLER SEES STATUS IN DASHBOARD
    └── GET /api/withdrawals — returns history with destination name
```

---

## 4. All TODOs — Manual Completion Required

### TODO 1: Mobile Money Payout Endpoint
**File:** `src/services/withdrawal.service.ts` → `initiatePayout()`
**What to do:**
- Visit https://developer.paychangu.com/reference/mobile-money-payout
- Confirm the exact endpoint URL (likely `POST /mobile-money/payouts`)
- Confirm the exact payload field names (uuid, mobile, amount, etc.)
- Replace the stub `return { charge_id: STUB-... }` with the real axios.post call
- Extract `charge_id` from the response and return it

### TODO 2: Bank Payout Endpoint
**File:** `src/services/withdrawal.service.ts` → `initiatePayout()`
**What to do:**
- Visit https://developer.paychangu.com/reference/bank-payout
- Confirm the exact endpoint URL (likely `POST /bank/payouts`)
- Confirm the exact payload field names (uuid, account_number, account_name, amount, etc.)
- Replace the stub with the real axios.post call for the BANK branch
- Extract `charge_id` from the response and return it

### TODO 3: Mobile Money Payout Verification Endpoint
**File:** `src/services/withdrawal.service.ts` → `verifyPayout()`
**What to do:**
- Visit https://developer.paychangu.com/reference/single-charge-details-copy
- Confirm the exact GET endpoint URL
- Replace the stub `return 'PENDING'` with real axios.get call
- Map response status to 'SUCCESS' | 'FAILED' | 'PENDING'

### TODO 4: Bank Payout Verification Endpoint
**File:** `src/services/withdrawal.service.ts` → `verifyPayout()`
**What to do:**
- Visit https://developer.paychangu.com/reference/single-bank-payout-details
- Confirm the exact GET endpoint URL
- Replace the stub with real axios.get call for the BANK branch
- Map response status to 'SUCCESS' | 'FAILED' | 'PENDING'

### TODO 5: Enable Background Jobs
**File:** `src/server.ts`
**What to do:**
- Uncomment `withdrawalVerificationJob.start()` once payout stubs are replaced
- Uncomment `paymentVerificationJob.start()` when ready for production

### TODO 6: Run Database Migration
**File:** `prisma/migrations/20260309_withdrawal_foundation.sql`
**What to do:**
- Run this SQL against your production database
- Or run `npx prisma migrate dev --name withdrawal_foundation` for dev
- Then run `npx prisma db seed` to populate payout_operators

---

## 5. Security Confirmation

**account_number and account_name are not persisted in any database table, log, or API response in this implementation.**

Specifically:
- They exist ONLY as function parameters in `processWithdrawal()` and `initiatePayout()`
- They are passed to the PayChangu API call and immediately discarded
- The `withdrawals` table has NO columns for account_number or account_name (recipient_phone and recipient_name were removed from the schema)
- No `console.log`, `logger.info`, or any logging statement contains these values
- No API response from any controller endpoint returns these values
- The `destination_uuid` (PayChangu operator UUID) is stored on the withdrawal record for reference, but this reveals only which bank/MoMo provider was selected — not the account details

---

## 6. Payout Operators Cache (Pre-seeded)

| UUID | Name | Type |
|------|------|------|
| 82310dd1-ec9b-4fe7-a32c-2f262ef08681 | National Bank of Malawi | BANK |
| 87e62436-0553-4fb5-a76d-f27d28420c5b | Ecobank Malawi Limited | BANK |
| b064172a-8a1b-4f7f-aad7-81b036c46c57 | FDH Bank Limited | BANK |
| e7447c2c-c147-4907-b194-e087fe8d8585 | Standard Bank Limited | BANK |
| 236760c9-3045-4a01-990e-497b28d115bb | Centenary Bank | BANK |
| 968ac588-3b1f-4d89-81ff-a3d43a599003 | First Capital Limited | BANK |
| c759d7b6-ae5c-4a95-814a-79171271897a | CDH Investment Bank | BANK |
| 5e9946ae-76ed-43f5-ad59-63e09096006a | TNM Mpamba | MOBILE_MONEY |
| e8d5fca0-e5ac-4714-a518-484be9011326 | Airtel Money | MOBILE_MONEY |

These are pre-seeded via:
- `prisma/seed.ts` (for `npx prisma db seed`)
- `prisma/migrations/20260309_withdrawal_foundation.sql` (for direct SQL application)

The system works immediately without needing to call the PayChangu API first. The 24-hour cache will auto-refresh when the API is available.

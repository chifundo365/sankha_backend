# Sankha Marketplace - Seller Withdrawal System API

## Overview

The withdrawal system allows sellers on the Sankha marketplace (a Malawian e-commerce platform) to cash out funds from their shop wallet to their mobile money account (Airtel Money or TNM Mpamba). The system integrates with PayChangu as the payment gateway for disbursements.

## Context: How Sellers Get Paid

**Escrow Flow (Before Withdrawal):**
1. Buyer pays via PayChangu → Money held by platform
2. Order is delivered → Buyer receives a 6-digit release code
3. Seller verifies release code → Wallet gets credited
4. Seller requests withdrawal → Money sent to mobile money

```
┌─────────┐    Pay     ┌──────────┐   Deliver   ┌─────────┐
│  BUYER  │──────────▶│  ESCROW  │────────────▶│ SELLER  │
└─────────┘           └──────────┘             └────┬────┘
                                                    │
                                                    │ Release Code
                                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     SELLER WALLET                           │
│                                                             │
│  Balance: MWK 2,500,000                                     │
│                           ┌─────────────┐                   │
│                           │ WITHDRAWAL  │                   │
│                           │ REQUEST     │                   │
│                           └──────┬──────┘                   │
│                                  │                          │
│                                  ▼                          │
│                    ┌─────────────────────────┐              │
│                    │  MOBILE MONEY (Airtel/  │              │
│                    │  TNM Mpamba)            │              │
│                    └─────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Withdrawal Limits & Fees

```typescript
const WITHDRAWAL_CONFIG = {
  MIN_AMOUNT: 1000,           // Minimum: MWK 1,000
  MAX_AMOUNT: 5000000,        // Maximum: MWK 5,000,000
  PLATFORM_FEE_PERCENT: 0,    // Sankha takes no fee (currently)
  PAYCHANGU_FEE_PERCENT: 1.5, // PayChangu payout fee (PLACEHOLDER - needs actual rate)
};
```

> ⚠️ **Important:** The 1.5% PayChangu fee is a placeholder estimate. The actual fee should be obtained from PayChangu's documentation or merchant agreement.

### Supported Mobile Money Providers

| Provider | Code | Phone Prefixes |
|----------|------|----------------|
| Airtel Money | `airtel_mw` | 099x, 098x |
| TNM Mpamba | `tnm_mw` | 088x, 089x |

---

## Database Schema

### `withdrawals` Table

```prisma
model withdrawals {
  id                 String            @id @default(uuid())
  shop_id            String            // Shop requesting withdrawal
  amount             Decimal           // Gross withdrawal amount
  fee                Decimal           // PayChangu fee
  net_amount         Decimal           // amount - fee (what seller receives)
  status             withdrawal_status @default(PENDING)
  
  // Mobile Money recipient details
  payout_method      String            @default("mobile_money")
  recipient_phone    String            // e.g., +265998765432
  recipient_name     String            // Account holder name
  provider           String?           // "airtel_mw" or "tnm_mw"
  
  // PayChangu integration
  tx_ref             String?           // Our reference (PAYOUT-{uuid})
  payout_reference   String?           // PayChangu's reference
  
  // Status tracking timestamps
  requested_at       DateTime          @default(now())
  processed_at       DateTime?         // When PayChangu API called
  completed_at       DateTime?         // When payout confirmed
  failed_at          DateTime?
  failure_reason     String?
  
  // Audit trail - wallet state
  balance_before     Decimal
  balance_after      Decimal
  
  // Relations
  shops              shops             @relation(...)
  transaction        transactions?     @relation(...)
  transaction_id     String?
}
```

### `withdrawal_status` Enum

| Status | Description |
|--------|-------------|
| `PENDING` | Requested, awaiting processing |
| `PROCESSING` | PayChangu payout API called |
| `COMPLETED` | Money sent to seller |
| `FAILED` | Payout failed, balance reverted |
| `CANCELLED` | Cancelled by seller/admin, balance reverted |

---

## API Endpoints

### Seller Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/withdrawals/wallet` | Get wallet balance + recent transactions |
| `POST` | `/api/withdrawals` | Request new withdrawal |
| `GET` | `/api/withdrawals` | List my withdrawal history |
| `GET` | `/api/withdrawals/:id` | Get single withdrawal details |
| `POST` | `/api/withdrawals/:id/cancel` | Cancel pending withdrawal |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/withdrawals/admin/pending` | List all pending withdrawals |
| `POST` | `/api/withdrawals/admin/:id/process` | Trigger PayChangu payout API |
| `POST` | `/api/withdrawals/admin/:id/complete` | Manually mark as completed |
| `POST` | `/api/withdrawals/admin/:id/fail` | Manually mark as failed |

---

## Request/Response Examples

### 1. Get Wallet Summary

**Request:**
```http
GET /api/withdrawals/wallet
Authorization: Bearer <seller_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet summary retrieved successfully",
  "data": {
    "shop": {
      "id": "65389d7e-3bd0-4f61-b975-886cea38a08c",
      "name": "Gadget Palace Mzuzu"
    },
    "wallet": {
      "balance": 2500000,
      "available": 2500000,
      "pending_withdrawals": 0,
      "pending_withdrawals_count": 0
    },
    "recent_transactions": [
      {
        "id": "abc123",
        "type": "SALE",
        "amount": 500000,
        "status": "COMPLETED",
        "order_number": "ORD-20260128-ABC123",
        "description": "Sale - Release code verified",
        "created_at": "2026-01-28T10:00:00.000Z"
      }
    ]
  }
}
```

### 2. Request Withdrawal

**Request:**
```http
POST /api/withdrawals
Authorization: Bearer <seller_token>
Content-Type: application/json

{
  "amount": 500000,
  "recipient_phone": "+265998765432",
  "recipient_name": "John Phiri"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal request submitted successfully",
  "data": {
    "withdrawal": {
      "id": "1871a276-5ec1-4c78-afca-8caa3f07d362",
      "amount": 500000,
      "fee": 7500,
      "net_amount": 492500,
      "recipient_phone": "+265998765432",
      "recipient_name": "John Phiri",
      "provider": "airtel_mw",
      "status": "PENDING",
      "tx_ref": "PAYOUT-84a08ea0-b53f-4849-8139-dfa69f6fba54",
      "requested_at": "2026-01-28T10:30:00.000Z"
    },
    "new_balance": 2000000
  }
}
```

### 3. Get Withdrawal History

**Request:**
```http
GET /api/withdrawals?status=COMPLETED&page=1&limit=10
Authorization: Bearer <seller_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawals retrieved successfully",
  "data": {
    "withdrawals": [
      {
        "id": "1871a276-5ec1-4c78-afca-8caa3f07d362",
        "amount": 500000,
        "fee": 7500,
        "net_amount": 492500,
        "recipient_phone": "+265998765432",
        "recipient_name": "John Phiri",
        "provider": "airtel_mw",
        "status": "COMPLETED",
        "tx_ref": "PAYOUT-84a08ea0-b53f-4849-8139-dfa69f6fba54",
        "payout_reference": "AIRTEL-REF-123456",
        "requested_at": "2026-01-28T10:30:00.000Z",
        "completed_at": "2026-01-28T11:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "pages": 1
    }
  }
}
```

### 4. Cancel Withdrawal

**Request:**
```http
POST /api/withdrawals/1871a276-5ec1-4c78-afca-8caa3f07d362/cancel
Authorization: Bearer <seller_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal cancelled successfully",
  "data": {
    "withdrawal_id": "1871a276-5ec1-4c78-afca-8caa3f07d362",
    "status": "CANCELLED"
  }
}
```

### 5. Admin: Get Pending Withdrawals

**Request:**
```http
GET /api/withdrawals/admin/pending
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Pending withdrawals retrieved",
  "data": {
    "count": 1,
    "withdrawals": [
      {
        "id": "1871a276-5ec1-4c78-afca-8caa3f07d362",
        "shop": {
          "id": "65389d7e-3bd0-4f61-b975-886cea38a08c",
          "name": "Gadget Palace Mzuzu"
        },
        "amount": 500000,
        "fee": 7500,
        "net_amount": 492500,
        "recipient_phone": "+265998765432",
        "recipient_name": "John Phiri",
        "provider": "airtel_mw",
        "tx_ref": "PAYOUT-84a08ea0-b53f-4849-8139-dfa69f6fba54",
        "requested_at": "2026-01-28T10:30:00.000Z"
      }
    ]
  }
}
```

### 6. Admin: Complete Withdrawal Manually

**Request:**
```http
POST /api/withdrawals/admin/1871a276-5ec1-4c78-afca-8caa3f07d362/complete
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reference": "AIRTEL-REF-123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal marked as completed",
  "data": {
    "withdrawal_id": "1871a276-5ec1-4c78-afca-8caa3f07d362",
    "status": "COMPLETED",
    "payout_reference": "AIRTEL-REF-123456"
  }
}
```

### 7. Admin: Fail Withdrawal

**Request:**
```http
POST /api/withdrawals/admin/1871a276-5ec1-4c78-afca-8caa3f07d362/fail
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Invalid phone number - recipient not found"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal marked as failed. Balance restored.",
  "data": {
    "withdrawal_id": "1871a276-5ec1-4c78-afca-8caa3f07d362",
    "status": "FAILED",
    "reason": "Invalid phone number - recipient not found"
  }
}
```

---

## Validation Rules

### Phone Number Format (Malawi)

```regex
/^(\+?265|0)?[89]\d{8}$/
```

Accepts:
- `+265998765432`
- `265998765432`
- `0998765432`
- `998765432`

### Withdrawal Amount

| Rule | Value |
|------|-------|
| Minimum | MWK 1,000 |
| Maximum | MWK 5,000,000 |
| Must be | Positive number |

### Business Rules

1. **One pending withdrawal at a time** - Sellers cannot request a new withdrawal while one is pending/processing
2. **Immediate balance deduction** - Wallet balance is deducted when withdrawal is requested (not when completed)
3. **Balance restored on failure** - If withdrawal fails or is cancelled, balance is automatically restored

---

## Fee Calculation

```typescript
// Example: Withdrawal of MWK 500,000
const amount = 500000;
const platformFee = amount * (0 / 100);      // MWK 0 (platform takes nothing)
const paychanguFee = amount * (1.5 / 100);   // MWK 7,500
const totalFee = Math.ceil(platformFee + paychanguFee);  // MWK 7,500
const netAmount = amount - totalFee;          // MWK 492,500 (seller receives)
```

---

## State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
              ┌─────────┐                                 │
   Request    │ PENDING │────────────────────┐            │
   Created───▶│         │                    │            │
              └────┬────┘                    │            │
                   │                         │            │
         Admin     │  Admin                  │ Seller     │
         Process   │  Complete               │ Cancel     │
                   ▼                         ▼            │
            ┌────────────┐             ┌──────────┐       │
            │ PROCESSING │             │CANCELLED │       │
            └─────┬──────┘             └────┬─────┘       │
                  │                         │             │
       PayChangu  │                    Revert│             │
       Success/   │                    Balance             │
       Fail       │                         │             │
                  ▼                         │             │
         ┌────────────────┐                 │             │
         │  COMPLETED     │◄────────────────┘             │
         │  (Success)     │                               │
         └────────────────┘                               │
                                                          │
         ┌────────────────┐                               │
         │   FAILED       │───────────Revert Balance──────┘
         │  (Error)       │
         └────────────────┘
```

---

## Mobile Money Provider Detection

The system auto-detects the mobile money provider from the phone number:

```typescript
detectProvider(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  
  // With country code (265)
  if (cleanPhone.startsWith('265')) {
    const localNumber = cleanPhone.slice(3);
    if (localNumber.startsWith('99') || localNumber.startsWith('98')) {
      return 'airtel_mw';  // Airtel Money
    }
    if (localNumber.startsWith('88') || localNumber.startsWith('89')) {
      return 'tnm_mw';     // TNM Mpamba
    }
  }
  
  // Without country code
  if (cleanPhone.startsWith('099') || cleanPhone.startsWith('098')) {
    return 'airtel_mw';
  }
  if (cleanPhone.startsWith('088') || cleanPhone.startsWith('089')) {
    return 'tnm_mw';
  }
  
  return 'airtel_mw';  // Default
}
```

---

## PayChangu Payout Integration

### Current Status: PLACEHOLDER

The PayChangu payout API integration is currently a placeholder. The actual implementation requires:

1. **PayChangu payout endpoint** - Get from PayChangu documentation
2. **Actual fee structure** - Confirm the actual payout fee (not 1.5% assumption)
3. **API credentials** - May need separate credentials for disbursements
4. **Webhook handling** - For payout status callbacks

### Placeholder API Call

```typescript
// This is a HYPOTHETICAL API call - actual PayChangu endpoint may differ
const response = await axios.post(
  'https://api.paychangu.com/payout',  // Placeholder URL
  {
    tx_ref: 'PAYOUT-84a08ea0-b53f-4849-8139-dfa69f6fba54',
    amount: 492500,
    currency: 'MWK',
    phone_number: '+265998765432',
    recipient_name: 'John Phiri',
    network: 'airtel_mw',
    narration: 'Sankha seller payout',
  },
  {
    headers: {
      Authorization: 'Bearer <PAYCHANGU_SECRET_KEY>',
      'Content-Type': 'application/json',
    },
  }
);
```

### Current Workaround: Manual Processing

Until PayChangu payout API is integrated:

1. Admin views pending withdrawals at `/api/withdrawals/admin/pending`
2. Admin manually sends money via Airtel Money or TNM Mpamba
3. Admin marks withdrawal as completed with the reference number via `/api/withdrawals/admin/:id/complete`

---

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Invalid input (amount, phone, etc.) |
| `SHOP_NOT_FOUND` | Seller's shop doesn't exist |
| `INSUFFICIENT_BALANCE` | Not enough wallet balance |
| `PENDING_WITHDRAWAL` | Already has a pending withdrawal |
| `NOT_FOUND` | Withdrawal not found |
| `UNAUTHORIZED` | Not authorized to access this withdrawal |
| `INVALID_STATUS` | Cannot perform action on current status |
| `PAYOUT_FAILED` | PayChangu payout failed |
| `API_UNAVAILABLE` | PayChangu API not available |
| `INTERNAL_ERROR` | Server error |

---

## Files

| File | Description |
|------|-------------|
| `src/services/withdrawal.service.ts` | Core business logic |
| `src/controllers/withdrawal.controller.ts` | HTTP handlers |
| `src/schemas/withdrawal.schema.ts` | Zod validation schemas |
| `src/routes/withdrawal.routes.ts` | Express routes |
| `prisma/schema.prisma` | Database model (withdrawals) |

---

## Testing

### Test Credentials

| User | Role | Email | Password |
|------|------|-------|----------|
| John Phiri | SELLER | john.phiri@techstore.mw | secure456 |
| Peter Nyirenda | ADMIN | peter.nyirenda@admin.com | admin321 |

### Test Flow

```bash
# 1. Login as seller
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.phiri@techstore.mw","password":"secure456"}'

# 2. Check wallet balance
curl http://localhost:5000/api/withdrawals/wallet \
  -H "Authorization: Bearer <seller_token>"

# 3. Request withdrawal
curl -X POST http://localhost:5000/api/withdrawals \
  -H "Authorization: Bearer <seller_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500000,
    "recipient_phone": "+265998765432",
    "recipient_name": "John Phiri"
  }'

# 4. Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"peter.nyirenda@admin.com","password":"admin321"}'

# 5. View pending withdrawals
curl http://localhost:5000/api/withdrawals/admin/pending \
  -H "Authorization: Bearer <admin_token>"

# 6. Complete withdrawal with reference
curl -X POST http://localhost:5000/api/withdrawals/admin/<withdrawal_id>/complete \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"reference": "AIRTEL-REF-123456"}'

# 7. Verify withdrawal completed
curl http://localhost:5000/api/withdrawals \
  -H "Authorization: Bearer <seller_token>"
```

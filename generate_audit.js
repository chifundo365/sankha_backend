/**
 * Sankha Transaction Audit – Word Document Generator
 * Run:  node generate_audit.js
 * Output: sankha_transaction_audit.docx
 */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, TableLayoutType,
} = require("docx");
const fs = require("fs");

// ─── helpers ───────────────────────────────────────────────────────────────────
const heading = (text, level = HeadingLevel.HEADING_1) =>
  new Paragraph({ text, heading: level, spacing: { before: 400, after: 200 } });

const para = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, size: 22, ...opts })],
  });

const bold = (text) => para(text, { bold: true });

const bullet = (text) =>
  new Paragraph({
    spacing: { after: 80 },
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 22 })],
  });

const code = (text) =>
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, font: "Consolas", size: 20 })],
  });

const issue = (text) =>
  new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: "⚠ ISSUE: ", bold: true, color: "CC0000", size: 22 }),
      new TextRun({ text, size: 22 }),
    ],
  });

const gap = (text) =>
  new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: "GAP: ", bold: true, color: "FF6600", size: 22 }),
      new TextRun({ text, size: 22 }),
    ],
  });

const file = (path) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: "File: ", bold: true, size: 22 }),
      new TextRun({ text: path, font: "Consolas", size: 20, italics: true }),
    ],
  });

const func = (name) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: "Function: ", bold: true, size: 22 }),
      new TextRun({ text: name, font: "Consolas", size: 20 }),
    ],
  });

const separator = () =>
  new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text: "─".repeat(80), color: "CCCCCC", size: 18 })],
  });

// ─── DOCUMENT ──────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Sankha Audit Tool",
  title: "Sankha Transaction Processing Audit",
  description: "Forensic audit of the Sankha marketplace transaction system",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
        paragraph: { spacing: { line: 276 } },
      },
    },
  },
  sections: [
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        // ──── TITLE PAGE ───────────────────────────────────────────────────────
        new Paragraph({ spacing: { before: 4000 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "SANKHA MARKETPLACE", bold: true, size: 52, color: "002147" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Transaction Processing System Audit", size: 36, color: "444444" })],
        }),
        new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Date: ${new Date().toISOString().slice(0, 10)}`, size: 24, color: "666666" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Scope: Codebase-level forensic review — NOT a design document", size: 22, color: "666666", italics: true })] }),
        new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Repository: shop-tech_backend", font: "Consolas", size: 20 })] }),
        new Paragraph({ break: 1 }),

        // ──── 1. PAYMENT INITIATION ────────────────────────────────────────────
        heading("1. Payment Initiation"),
        para("A purchase in Sankha begins when a buyer checks out their cart. The cart system stores items as orders with status CART. On checkout, the system converts each per-shop cart into a real order and initiates payment."),

        heading("1.1 Cart System", HeadingLevel.HEADING_2),
        file("src/controllers/cart.controller.ts"),
        func("getOrCreateCart(), addToCart()"),
        bullet("A cart is modeled as an orders row with status = 'CART' and a temporary order_number like CART-{userId8}-{shopId8}."),
        bullet("Each buyer gets one CART order per shop (multi-shop checkout produces multiple carts)."),
        bullet("When adding items, the display price (shop_products.price) is stored in order_items.unit_price and the seller's cost is frozen in order_items.base_price."),

        heading("1.2 Checkout Flow", HeadingLevel.HEADING_2),
        file("src/controllers/order.controller.ts"),
        func("checkout()"),
        para("The checkout endpoint is POST /api/orders/checkout (protected, requires authentication). The buyer submits:"),
        bullet("delivery_address_id — validated to belong to the user"),
        bullet("payment_method — 'paychangu', 'cod', or 'bank_transfer'"),
        bullet("customer_email, customer_phone, customer_first_name, customer_last_name"),
        bullet("Optional logistics fields: recipient_name, recipient_phone, delivery_method, depot_name, etc."),

        para("Checkout steps (verified from code):"),
        bullet("1. Validate delivery address ownership."),
        bullet("2. Fetch all CART orders for this buyer."),
        bullet("3. Validate stock for every item (checks listing_status === LIVE and stock_quantity)."),
        bullet("4. For each cart: generate order number (ORD-YYYY-XXXXXX), set status to PENDING_PAYMENT (paychangu) or CONFIRMED (COD), snapshot delivery fields, compute delivery fee."),
        bullet("5. Reserve stock immediately by decrementing shop_products.stock_quantity."),
        bullet("6a. For PayChangu: call paymentService.initiatePayment() with total across all carts, link payment to first order, create additional payment rows for other orders sharing the same tx_ref."),
        bullet("6b. For COD: create a PENDING payment record and auto-generate release code via orderConfirmationService.generateReleaseCode()."),
        bullet("7. If PayChangu initiation fails: restore stock and revert orders back to CART status."),

        heading("1.3 Delivery Fee Calculation", HeadingLevel.HEADING_2),
        para("Computed per-shop in checkout using shop settings:"),
        code("  if (cartSubtotal >= freeThreshold && freeThreshold > 0) → fee = 0"),
        code("  else if DEPOT_COLLECTION → fee = intercity_delivery_fee"),
        code("  else (HOME_DELIVERY) → fee = base_delivery_fee"),
        issue("Delivery fee is computed and stored in the order but is NOT added to total_amount. The order total_amount is the cart subtotal only. The buyer's payment amount (sent to PayChangu) uses totalAmount which is the sum of cart total_amounts across all shops — delivery fees are orphaned and not charged."),

        separator(),

        // ──── 2. PAYCHANGU INTEGRATION ─────────────────────────────────────────
        heading("2. PayChangu Integration"),
        file("src/services/payment.service.ts"),
        file("src/config/paychangu.config.ts"),

        heading("2.1 Configuration", HeadingLevel.HEADING_2),
        para("Configuration loaded from environment variables via paychangu.config.ts:"),
        bullet("PAYCHANGU_API_BASE (default: https://api.paychangu.com)"),
        bullet("PAYCHANGU_SECRET_KEY"),
        bullet("PAYCHANGU_WEBHOOK_SECRET_KEY"),
        bullet("PAYCHANGU_CALLBACK_URL (default: http://localhost:3000/api/payments/paychangu/callback)"),
        bullet("PAYCHANGU_RETURN_URL (default: http://localhost:3000/payment/complete)"),
        bullet("PAYCHANGU_DEFAULT_CURRENCY (default: MWK)"),
        bullet("PAYCHANGU_PAYMENT_EXPIRY_MINUTES (default: 59 minutes)"),
        issue("The callback_url default points to localhost:3000. If production environment variables are not set, PayChangu callbacks will never reach the server."),

        heading("2.2 Payment Initiation API Call", HeadingLevel.HEADING_2),
        func("PaymentService.initiatePayment()"),
        para("Makes a POST to {apiBase}/payment with this payload:"),
        code("  { first_name, last_name, email, phone, amount, currency,"),
        code("    tx_ref (UUID v4), callback_url, return_url,"),
        code("    customization: { title: 'Sankha Payment', description: '...' },"),
        code("    metadata }"),
        para("Authorization header: Bearer {secretKey}. On success, extracts checkout_url and tx_ref from response.data (handles nested data.data shape). Creates a payment DB record with status PENDING, the checkout_url, and an expiry timestamp (now + 59 minutes)."),

        heading("2.3 Payment Verification", HeadingLevel.HEADING_2),
        func("PaymentService.verifyPayment(), verifyPaymentWithProvider()"),
        para("Three verification paths exist:"),
        bullet("1. Manual verify — POST /api/payments/verify (public endpoint, buyer-triggered)."),
        bullet("2. Webhook — POST /api/payments/webhook (PayChangu pushes notification)."),
        bullet("3. Background job — PaymentVerificationJob runs every 1 minute, checks all PENDING non-expired payments against PayChangu API."),
        para("Verification calls GET {apiBase}/verify-payment/{txRef} with Bearer auth. PayChangu status is mapped: 'success'/'successful' → PAID, 'failed'/'failure' → FAILED, else → PENDING. If PayChangu returns HTTP 400 but includes valid payment data, it is still processed."),
        para("On PAID: calls confirmPaymentOrders(txRef) — finds all payments with the same tx_ref, transitions linked orders from PENDING_PAYMENT to CONFIRMED, and auto-generates release codes."),
        para("On FAILED: calls handleFailedPayment(txRef) — restores stock for all linked orders and cancels them."),

        heading("2.4 Webhook Handler", HeadingLevel.HEADING_2),
        func("PaymentService.processWebhook()"),
        file("src/controllers/payment.controller.ts → handleWebhook"),
        para("Route: POST /api/payments/webhook. Uses express.raw({ type: 'application/json' }) body parser for signature validation."),
        para("Signature verification: HMAC-SHA256 of the raw body using webhookSecretKey, compared with the 'signature' header."),
        para("After signature check, it calls verifyPayment() with the tx_ref from the webhook payload (which re-verifies with PayChangu API and cross-checks amounts). Amount mismatch > 1 MWK triggers an error."),
        issue("The webhook handler reads req.body.toString() as rawPayload, but express.raw returns a Buffer. The toString() on a Buffer works, but the JSON.parse inside processWebhook parses the same data again. The req.body in the controller is already a Buffer (not JSON-parsed), which is correct for signature validation. However, the webhook route uses a different body parser than other routes — this is intentionally correct."),

        heading("2.5 Expired Payment Handling", HeadingLevel.HEADING_2),
        file("src/jobs/paymentVerification.job.ts"),
        func("PaymentVerificationJob.runJob()"),
        para("A setInterval-based background job runs every 1 minute:"),
        bullet("1. Finds payments where status = PENDING and expired_at <= now → marks them FAILED, restores stock, cancels orders."),
        bullet("2. Finds payments where status = PENDING and expired_at > now → calls verifyPayment against PayChangu API."),
        issue("This is a setInterval-based in-process job, not a distributed queue. If the server restarts, there is no catch-up mechanism. If two server instances run, both will attempt the same verifications (no locking)."),

        separator(),

        // ──── 3. ESCROW / FUND HOLDING ─────────────────────────────────────────
        heading("3. Escrow / Fund Holding"),
        para("Sankha implements a conceptual escrow model but does NOT use a separate escrow wallet or holding account in the database."),

        heading("3.1 How Escrow Works Currently", HeadingLevel.HEADING_2),
        para("The escrow mechanism is implicit, managed through order status and the release code:"),
        bullet("When a buyer pays via PayChangu, the money goes directly to the platform's PayChangu merchant account."),
        bullet("The order transitions to CONFIRMED, and a release code is generated."),
        bullet("The seller's wallet (shops.wallet_balance) is NOT credited at this point — funds are 'held' by virtue of the order being in CONFIRMED/PREPARING/OUT_FOR_DELIVERY status."),
        bullet("Only when the seller enters the correct release code (provided by the buyer after receiving goods) does the seller's wallet get credited."),

        heading("3.2 Status-Based Fund States", HeadingLevel.HEADING_2),
        para("Funds are conceptually in different states based on order status:"),
        bullet("PENDING_PAYMENT — No funds collected yet."),
        bullet("CONFIRMED / PREPARING / READY_FOR_PICKUP / OUT_FOR_DELIVERY — Funds held (paid to PayChangu, not yet released to seller)."),
        bullet("DELIVERED (release code verified) — Funds released to seller wallet."),
        bullet("CANCELLED — Stock restored; payment marked CANCELLED (but see issues below)."),
        bullet("REFUNDED — Enum exists but no refund logic is implemented."),
        issue("There is no explicit escrow ledger or balance tracking. The 'held' amount is not recorded anywhere — it can only be inferred from order status and payment status. If the PayChangu merchant account balance is needed for reconciliation, there is no system for it."),
        issue("When an order is cancelled after payment (CONFIRMED → CANCELLED via cancelOrder), the payment status is set to CANCELLED but there is NO refund initiated back to the buyer via PayChangu. The money remains in the platform's PayChangu account with no mechanism to return it."),

        separator(),

        // ──── 4. ORDER STATUS LIFECYCLE ────────────────────────────────────────
        heading("4. Order Status Lifecycle"),
        file("prisma/schema.prisma — enum order_status"),  
        para("All possible order statuses (from the database schema):"),
        code("  CART | PENDING | CONFIRMED | PREPARING | READY_FOR_PICKUP |"),
        code("  OUT_FOR_DELIVERY | DELIVERED | CANCELLED | REFUNDED | PENDING_PAYMENT"),

        heading("4.1 Status Transitions", HeadingLevel.HEADING_2),
        para("Verified transition map from updateOrderStatus():"),
        code("  CONFIRMED      → PREPARING, CANCELLED"),
        code("  PREPARING       → READY_FOR_PICKUP, OUT_FOR_DELIVERY, CANCELLED"),
        code("  READY_FOR_PICKUP → OUT_FOR_DELIVERY, DELIVERED"),
        code("  OUT_FOR_DELIVERY → DELIVERED"),
        code("  DELIVERED       → (terminal)"),
        code("  CANCELLED       → (terminal)"),
        para("Additional transitions managed outside updateOrderStatus:"),
        bullet("CART → PENDING_PAYMENT (checkout with paychangu payment)"),
        bullet("CART → CONFIRMED (checkout with COD/bank_transfer)"),
        bullet("PENDING_PAYMENT → CONFIRMED (payment verified successfully)"),
        bullet("PENDING_PAYMENT → CANCELLED (payment expired or failed)"),
        bullet("CONFIRMED/OUT_FOR_DELIVERY → DELIVERED (release code verification)"),
        bullet("Any non-terminal → CANCELLED (cancelOrder endpoint)"),

        heading("4.2 Trigger Matrix", HeadingLevel.HEADING_2),
        bullet("CART → created automatically when buyer adds first item to cart."),
        bullet("PENDING_PAYMENT → set during checkout when payment_method is 'paychangu'."),
        bullet("CONFIRMED → set during checkout (COD) or after payment verification (PayChangu)."),
        bullet("PREPARING/READY_FOR_PICKUP/OUT_FOR_DELIVERY → seller manually updates via PATCH /api/orders/:orderId/status."),
        bullet("DELIVERED → triggered by verifyReleaseCode() when seller enters valid code (bypasses updateOrderStatus transitions)."),
        bullet("CANCELLED → buyer, seller, or admin via cancel endpoint; also auto-cancelled by payment expiry."),
        bullet("REFUNDED — present in enum but NEVER set by any code path."),
        issue("The PENDING status exists in the enum but is never used in any code path. Orders go directly from CART to either PENDING_PAYMENT or CONFIRMED."),
        issue("The status REFUNDED is defined but has zero implementation. It is a dead enum value."),
        issue("Release code verification can transition from OUT_FOR_DELIVERY directly to DELIVERED, but the updateOrderStatus function requires OUT_FOR_DELIVERY → DELIVERED. The verifyReleaseCode path bypasses the status transition validation entirely — it directly sets status to DELIVERED if the code is correct, regardless of whether the order is CONFIRMED or OUT_FOR_DELIVERY."),

        separator(),

        // ──── 5. SELLER PAYOUT LOGIC ───────────────────────────────────────────
        heading("5. Seller Payout Logic"),
        file("src/services/orderConfirmation.service.ts"),
        func("OrderConfirmationService.verifyReleaseCode(), calculateSellerPayout()"),

        heading("5.1 When Seller Gets Paid", HeadingLevel.HEADING_2),
        para("The seller's wallet is credited ONLY when the release code is successfully verified. This happens in a single Prisma $transaction batch:"),
        bullet("1. Shop's wallet_balance is incremented by sellerPayout."),
        bullet("2. A transactions record is created with type ORDER_CREDIT and status COMPLETED."),
        bullet("3. Order status is set to DELIVERED, release_code_status to VERIFIED."),

        heading("5.2 Payout Amount Calculation", HeadingLevel.HEADING_2),
        func("calculateSellerPayout()"),
        para("The payout amount is calculated as:"),
        code("  sellerPayout = SUM(order_items.base_price × quantity) for all items in the order"),
        para("This uses the frozen base_price that was stored when the item was added to the cart (from shop_products.base_price). It is NOT the display price (shop_products.price) and NOT the order's total_amount."),
        bold("Key distinction:"),
        bullet("shop_products.price = display price (what buyer sees and pays) — includes platform markup."),
        bullet("shop_products.base_price = vendor's price (what seller receives) — the original seller price."),
        bullet("order_items.unit_price = display price (frozen at add-to-cart time)."),
        bullet("order_items.base_price = vendor price (frozen at add-to-cart time)."),
        para("The platform's implicit revenue is: order_items.unit_price - order_items.base_price per item, aggregated across all items."),
        issue("If base_price is null for an order item (which is possible — the schema allows it), it defaults to Decimal(0). This means the seller would receive MWK 0 for that item. There is no validation or warning when base_price is missing."),
        issue("The payout calculation does NOT account for delivery fees. The delivery_fee stored on the order is never added to or subtracted from the seller payout — it appears to be unconnected money."),

        separator(),

        // ──── 6. RELEASE CODE MECHANISM ────────────────────────────────────────
        heading("6. Release Code Mechanism"),
        file("src/utils/releaseCode.ts"),
        file("src/utils/constants.ts"),
        file("src/services/orderConfirmation.service.ts"),

        heading("6.1 Generation", HeadingLevel.HEADING_2),
        func("generateReleaseCode()"),
        para("Generated as a random 6-character alphanumeric string using charset:"),
        code("  ABCDEFGHJKLMNPQRSTUVWXYZ23456789"),
        para("(Excludes I, O, 0, 1 to avoid confusion.)"),
        para("Expiry: 14 days from generation."),
        para("Uniqueness check: before saving, checks if another order has the same code with PENDING status. On collision, retries recursively (very rare given 32^6 ≈ 1 billion combinations)."),

        heading("6.2 When Generated", HeadingLevel.HEADING_2),
        bullet("After PayChangu payment is verified → confirmPaymentOrders() → generateReleaseCode()."),
        bullet("At checkout for COD orders → immediately after order creation."),
        bullet("Admin can manually trigger via POST /api/orders/:orderId/generate-release-code."),

        heading("6.3 Storage", HeadingLevel.HEADING_2),
        para("Stored on the orders table:"),
        bullet("release_code — VARCHAR(10), the raw code string."),
        bullet("release_code_expires_at — TIMESTAMP, 14 days after generation."),
        bullet("release_code_status — ENUM: PENDING, VERIFIED, EXPIRED, CANCELLED."),
        bullet("release_code_verified_at — TIMESTAMP, set when verified."),

        heading("6.4 Verification", HeadingLevel.HEADING_2),
        func("verifyReleaseCode() in orderConfirmation.service.ts"),
        para("Called from POST /api/orders/:orderId/verify-release-code (seller endpoint)."),
        para("Validation checks:"),
        bullet("Order must exist and belong to the submitting shop."),
        bullet("Order status must be CONFIRMED or OUT_FOR_DELIVERY."),
        bullet("Code must not be already VERIFIED."),
        bullet("Code must not be expired (checked against release_code_expires_at)."),
        bullet("Code comparison is case-insensitive (toUpperCase on both sides)."),
        para("On success: credits seller wallet, creates ORDER_CREDIT transaction, sets order to DELIVERED."),

        heading("6.5 Expiry Processing", HeadingLevel.HEADING_2),
        func("processExpiredReleaseCodes()"),
        para("Exists in OrderConfirmationService but is never called by the background job or any cron. It would bulk-update PENDING codes past their expiry to EXPIRED status."),
        issue("processExpiredReleaseCodes() is defined but never invoked. Expired release codes with status PENDING accumulate in the database. The isReleaseCodeExpired() check during verification prevents their use, but status remains misleading."),
        issue("The release code uses Math.random() via Math.floor(Math.random() * CHARSET.length). This is not cryptographically secure. For a financial release mechanism, crypto.randomBytes or similar should be used to prevent predictability."),

        separator(),

        // ──── 7. NOTIFICATION SYSTEM ───────────────────────────────────────────
        heading("7. Notification System"),

        heading("7.1 SMS Provider", HeadingLevel.HEADING_2),
        file("src/services/sms.service.ts"),
        file("src/services/notification.service.ts"),
        para("SMS is sent via Africa's Talking. Configuration:"),
        bullet("AFRICASTALKING_USERNAME — account username"),
        bullet("AFRICASTALKING_API_KEY — API key"),
        bullet("AFRICASTALKING_FROM — sender ID (not used in sandbox)"),
        bullet("AFRICASTALKING_SANDBOX — 'true'/'false' toggle"),
        para("Two SMS service files exist: sms.service.ts (main, comprehensive) and notification.service.ts (simpler, older). sms.service.ts is the actively used one."),

        heading("7.2 Email Provider", HeadingLevel.HEADING_2),
        file("src/services/email.service.ts"),
        para("Email is sent via Resend (resend.com). API key from RESEND_API_KEY env var. From address configured in email.config.ts."),
        para("In development (non-production), emails are logged to console and HTML saved to generated/email-debug/ folder."),

        heading("7.3 Notification Events", HeadingLevel.HEADING_2),
        para("The following events trigger notifications:"),
        bold("On release code generation (sendReleaseCodeForOrder):"),
        bullet("Buyer Email — release code email with order details, delivery map link, seller phone."),
        bullet("Buyer SMS — delivery SMS with code and logistics path (HOME vs DEPOT)."),
        bullet("Seller Email — Dispatch Command Center email with recipient details, map link, waybill upload link."),
        bullet("Seller SMS — order-ready SMS with release code instructions, buyer phone, delivery directions."),

        bold("On order status update (updateOrderStatus):"),
        bullet("An order_messages record is created (CUSTOMER recipient) but is_sent = false. There is no mechanism to actually send these messages — they are only stored."),

        bold("On delivery location update (updateDeliveryLocation):"),
        bullet("Seller Email — updated location notification."),
        bullet("Seller SMS — location update notification."),
        bullet("Recipient SMS (if different from buyer) — notification of update."),

        bold("On release code verification (verifyReleaseCode):"),
        bullet("Seller Email — wallet credited notification (async, non-blocking)."),

        bold("On checkout (recipient differs from buyer):"),
        bullet("Recipient SMS — magic link to update delivery location."),

        bold("On waybill upload:"),
        bullet("Buyer Email — notification that waybill has been uploaded."),

        issue("Order status change notifications (order_messages table) are created with is_sent = false but never actually dispatched. There is no job or handler to send them. They are write-only records."),
        issue("notification.service.ts and sms.service.ts have overlapping functionality. notification.service.ts exports sendReleaseCodeSms with a different signature than sms.service.ts's sendReleaseCodeSms. The import in orderConfirmation.service.ts pulls from sms.service.ts, not notification.service.ts. notification.service.ts appears to be a legacy file."),

        separator(),

        // ──── 8. REFUND LOGIC ──────────────────────────────────────────────────
        heading("8. Refund Logic"),
        bold("There is NO refund implementation in the codebase."),
        para("Evidence:"),
        bullet("The order_status enum includes REFUNDED but it is never set by any code path."),
        bullet("The payment_status enum includes REFUNDED but it is never set by any code path."),
        bullet("The transaction_type enum includes REFUND but no transaction is ever created with this type."),
        bullet("There is no PayChangu refund API call anywhere in the codebase."),
        bullet("There is no refund controller, route, or service."),
        bullet("When an order is cancelled after payment, the payment status is set to CANCELLED (not REFUNDED) and no money is returned to the buyer."),
        issue("Critical gap: Buyers who cancel orders after paying have NO way to get their money back through the system. The platform retains funds with no refund mechanism. This will cause customer complaints and potential legal/regulatory issues in Malawi."),

        separator(),

        // ──── 9. FEE CALCULATIONS ─────────────────────────────────────────────
        heading("9. Fee Calculations"),
        file("src/utils/constants.ts"),

        heading("9.1 Platform Markup Formula", HeadingLevel.HEADING_2),
        para("The fee model uses an inverse margin approach. From constants.ts:"),
        code("  PRICE_MARKUP_MULTIPLIER = 1.0526"),
        code("  displayPrice = Math.round(basePrice × 1.0526)"),
        para("Fee breakdown (documented in code):"),
        bullet("PayChangu fee: 3%"),
        bullet("Sankha commission: 2%"),
        bullet("Total combined: 5% of display price"),
        bullet("Multiplier derived as: 1 / (1 - 0.05) = 1.052631... ≈ 1.0526"),
        para("This means: if seller wants to receive MWK 10,000, display price = 10,000 × 1.0526 = MWK 10,526. The 5% of 10,526 ≈ 526 covers both PayChangu (3%) and Sankha (2%)."),

        heading("9.2 Where Markup is Applied", HeadingLevel.HEADING_2),
        para("The calculateDisplayPrice function is defined in constants.ts and is used during bulk upload and product listing to compute the buyer-visible price from the seller's base price."),
        bullet("shop_products.base_price = seller's desired payout price."),
        bullet("shop_products.price = base_price × 1.0526 (display/checkout price)."),
        bullet("order_items.base_price = frozen seller payout price at time of cart addition."),
        bullet("order_items.unit_price = frozen display price at time of cart addition."),

        heading("9.3 Withdrawal Fees", HeadingLevel.HEADING_2),
        file("src/services/withdrawal.service.ts"),
        para("Separate from the markup, withdrawal fees are calculated as:"),
        code("  PLATFORM_FEE_PERCENT  = 0%   (disabled, comment says 'for now')"),
        code("  PAYCHANGU_FEE_PERCENT = 1.5% (estimated PayChangu payout fee)"),
        code("  totalFee = Math.ceil(platformFee + paychanguFee)"),
        code("  netAmount = amount - totalFee"),
        bullet("Minimum withdrawal: MWK 1,000"),
        bullet("Maximum withdrawal: MWK 5,000,000"),
        issue("The 3% PayChangu fee in the markup calculation is the payment collection fee. The 1.5% withdrawal fee is a separate disbursement fee. These are different transactions. However, if PayChangu's actual fees differ from these hardcoded values, the platform will either over-charge or under-collect."),
        issue("The platform commission (Sankha 2%) is embedded in the price markup but never explicitly tracked as revenue. There is no Sankha revenue ledger, report, or dashboard. Platform income can only be inferred by: SUM(order_items.unit_price - order_items.base_price) across all delivered orders."),

        separator(),

        // ──── 10. KNOWN GAPS & BROKEN LOGIC ───────────────────────────────────
        heading("10. Known Gaps and Broken Logic"),

        heading("10.1 Critical Issues", HeadingLevel.HEADING_2),
        issue("NO REFUND MECHANISM: After a buyer pays and the order is cancelled, money stays in the platform's PayChangu account. There is no code to initiate a refund. The REFUNDED status is a dead value."),
        issue("DELIVERY FEE NOT CHARGED: The delivery fee is calculated and stored on the order but never added to the payment amount. Buyers are charged only the product subtotal, not subtotal + delivery fee. Sellers or the platform absorb delivery costs implicitly."),
        issue("CANCELLED PAID ORDERS — MONEY LEAK: cancelOrder() sets payment status to CANCELLED but does not refund. Money is collected but never returned. No accounting trail for these funds."),

        heading("10.2 Financial Integrity Issues", HeadingLevel.HEADING_2),
        issue("NO ESCROW LEDGER: There is no explicit record of 'funds in escrow'. The platform relies entirely on order status to infer fund states. No reconciliation is possible between PayChangu account balance and expected held funds."),
        issue("NO PLATFORM REVENUE TRACKING: Sankha's 2% commission exists only as the implicit difference between display and base prices. There is no transactions record, report, or dashboard for platform revenue."),
        issue("BASE_PRICE CAN BE NULL: order_items.base_price is nullable. If null, the seller receives MWK 0 for that item. No validation prevents this."),
        issue("MULTI-SHOP CHECKOUT — PAYMENT LINKED TO FIRST ORDER ONLY: When checking out multiple shops, the initiatePayment call uses pendingOrders[0].id as the orderId. Additional orders get separate payment rows with the same tx_ref but different amounts. Payment verification confirms all orders sharing the tx_ref, which works, but the primary payment record's amount is the total across all orders while individual payment records have per-order amounts. This creates ambiguous amount data."),

        heading("10.3 Concurrency & Reliability Issues", HeadingLevel.HEADING_2),
        issue("BACKGROUND JOB IS IN-PROCESS: PaymentVerificationJob uses setInterval, not a proper job queue. No retry on failure, no locking, no idempotency guards. Multiple server instances would duplicate verification calls."),
        issue("STOCK RESERVATION RACE CONDITION: Stock is decremented during checkout without a SELECT FOR UPDATE or database-level lock. Two concurrent checkouts could both pass stock validation and both decrement, potentially taking stock below zero."),
        issue("RELEASE CODE — Math.random(): Release codes use Math.random() which is not cryptographically secure. A sufficiently motivated attacker could potentially predict codes. Should use crypto.randomBytes."),

        heading("10.4 Logic Inconsistencies", HeadingLevel.HEADING_2),
        issue("RELEASE CODE EXPIRY JOB NEVER RUNS: processExpiredReleaseCodes() is defined but never called. Expired codes keep PENDING status indefinitely in the database."),
        issue("ORDER_MESSAGES NEVER SENT: updateOrderStatus creates order_messages with is_sent=false but no service ever reads or sends them. The entire order notification pipeline via order_messages is dead code."),
        issue("DUPLICATE SMS SERVICES: notification.service.ts and sms.service.ts both implement SMS sending with different interfaces. Only sms.service.ts is actively used. notification.service.ts is imported by orderConfirmation.service.ts for its sendReleaseCodeSms export but sms.service.ts also has this export."),
        issue("CALLBACK URL MISMATCH: PayChangu callback_url defaults to localhost:3000, and there is no explicit /api/payments/paychangu/callback route defined. The webhook route is at /api/payments/webhook. The callback_url and webhook_url appear to be conflated — PayChangu distinguishes between return_url (browser redirect) and webhook/callback (server notification). The return_url default also points to localhost."),
        issue("STATUS TRANSITION BYPASS: verifyReleaseCode() can set an order to DELIVERED from CONFIRMED, skipping PREPARING/READY_FOR_PICKUP/OUT_FOR_DELIVERY. The updateOrderStatus validator would reject this transition, but verifyReleaseCode bypasses it entirely."),
        issue("COD PAYMENT STATUS: COD and bank_transfer payments are created with status PENDING and never updated to PAID. There is no endpoint or logic to mark them as completed. They remain PENDING forever."),

        heading("10.5 Minor Issues", HeadingLevel.HEADING_2),
        issue("HARDCODED STRINGS: PayChangu customization title is hardcoded as 'Sankha Payment' and description as 'Payment for products purchased on Sankha v.4'."),
        issue("SQL INJECTION RISK IN STOCK LOGGING: The stock change reason is interpolated into a raw SQL string via $executeRawUnsafe with only single-quote escaping. While the reason is server-generated (not user input), this pattern is fragile."),
        issue("ERROR SWALLOWING: Multiple try-catch blocks around notification sends silently swallow errors with only console.warn/error. Failed SMS or email sends are never retried."),
        issue("WITHDRAWAL PAYOUT API IS HYPOTHETICAL: The PayChangu payout endpoint (/payout) is explicitly marked as 'hypothetical' in comments. If PayChangu's actual payout API has a different endpoint or payload, all withdrawal processing will fail."),
        issue("WALLET BALANCE DEDUCTED BEFORE PAYOUT SUCCEEDS: Withdrawal flow deducts wallet_balance immediately upon request (before PayChangu payout API is called). If the API call fails, revertWithdrawal restores it. But if the server crashes between deduction and API call, the balance is permanently reduced."),

        separator(),

        // ──── APPENDIX ─────────────────────────────────────────────────────────
        heading("Appendix A: Key File Reference"),
        para("Core transaction files:"),
        bullet("prisma/schema.prisma — Database schema with all models and enums"),
        bullet("src/controllers/order.controller.ts — Checkout, status management, release code endpoints"),
        bullet("src/controllers/payment.controller.ts — Payment initiation, verification, webhook handler"),
        bullet("src/controllers/cart.controller.ts — Cart management (add/remove/update items)"),
        bullet("src/controllers/withdrawal.controller.ts — Seller withdrawal endpoints"),
        bullet("src/services/payment.service.ts — PayChangu API integration, payment lifecycle"),
        bullet("src/services/orderConfirmation.service.ts — Release code generation/verification, seller wallet crediting"),
        bullet("src/services/withdrawal.service.ts — Withdrawal validation, PayChangu payout, fee calculation"),
        bullet("src/services/email.service.ts — All email sending (Resend provider)"),
        bullet("src/services/sms.service.ts — All SMS sending (Africa's Talking)"),
        bullet("src/services/notification.service.ts — Legacy SMS service (partially redundant)"),
        bullet("src/utils/constants.ts — Fee multiplier, release code config, pagination defaults"),
        bullet("src/utils/releaseCode.ts — Release code generation/validation helpers"),
        bullet("src/config/paychangu.config.ts — PayChangu API configuration"),
        bullet("src/jobs/paymentVerification.job.ts — Background payment verification job"),
        bullet("src/routes/payment.routes.ts — Payment API routes"),
        bullet("src/routes/order.routes.ts — Order API routes"),
        bullet("src/routes/withdrawal.routes.ts — Withdrawal API routes"),

        heading("Appendix B: Database Enum Summary"),
        code("  order_status:       CART, PENDING, CONFIRMED, PREPARING, READY_FOR_PICKUP,"),
        code("                      OUT_FOR_DELIVERY, DELIVERED, CANCELLED, REFUNDED, PENDING_PAYMENT"),
        code("  payment_status:     PENDING, PAID, FAILED, CANCELLED, REFUNDED"),
        code("  transaction_type:   ORDER_CREDIT, PAYOUT, REFUND, ADJUSTMENT"),
        code("  transaction_status: PENDING, COMPLETED, FAILED, REVERSED"),
        code("  release_code_status:PENDING, VERIFIED, EXPIRED, CANCELLED"),
        code("  withdrawal_status:  PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED"),
        code("  payment_verified_by:VERIFY_ENDPOINT, WEBHOOK, BACKGROUND_JOB"),

        new Paragraph({ spacing: { before: 600 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "— End of Audit —", italics: true, color: "999999", size: 22 })],
        }),
      ],
    },
  ],
});

// Generate and write file
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("sankha_transaction_audit.docx", buffer);
  console.log("✅ sankha_transaction_audit.docx generated successfully");
});

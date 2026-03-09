/**
 * Sankha Transaction Audit (CORRECTED) – Word Document Generator
 * Run:  node generate_corrected_audit.js
 * Output: sankha_transaction_audit_corrected.docx
 */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
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

const fixed = (text) =>
  new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: "FIXED: ", bold: true, color: "008800", size: 22 }),
      new TextRun({ text, size: 22 }),
    ],
  });

const wasIssue = (text) =>
  new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: "WAS: ", bold: true, color: "999999", size: 22, strike: true }),
      new TextRun({ text, size: 22, color: "999999", strike: true }),
    ],
  });

const fileRef = (path) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: "File: ", bold: true, size: 22 }),
      new TextRun({ text: path, font: "Consolas", size: 20, italics: true }),
    ],
  });

const separator = () =>
  new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text: "\u2500".repeat(80), color: "CCCCCC", size: 18 })],
  });

// simple 2-col table row
const tRow = (label, value, opts = {}) =>
  new TableRow({
    children: [
      new TableCell({
        width: { size: 3000, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
      }),
      new TableCell({
        width: { size: 7000, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, ...opts })] })],
      }),
    ],
  });

// ─── DOCUMENT ──────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

const doc = new Document({
  creator: "Sankha Audit Tool",
  title: "Sankha Transaction Processing Audit – CORRECTED",
  description: "Post-correction audit of the Sankha marketplace transaction system",
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
          children: [new TextRun({ text: "SANKHA 4.0", bold: true, size: 56, color: "1B4F72" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "Transaction Processing Audit", size: 36, color: "2C3E50" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "CORRECTED VERSION", bold: true, size: 32, color: "008800" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Date: ${today}`, size: 24, color: "7F8C8D" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Classification: CONFIDENTIAL", size: 20, color: "CC0000", bold: true })],
        }),
        new Paragraph({ spacing: { before: 800 } }),

        // ──── EXECUTIVE SUMMARY ────────────────────────────────────────────────
        heading("1. Executive Summary"),
        para("This document records all corrections applied to the Sankha 4.0 transaction processing system following the initial forensic audit and the financial blueprint v2 specification. A total of 13 defects were identified: 7 rated CRITICAL and 6 rated HIGH. All 13 have been corrected as described below."),
        para("The corrections align the codebase with the authoritative business rules in the Sankha Financial Blueprint v2, specifically:"),
        bullet("Pricing formula: ceil((vendorPrice + 720) / (1 - 0.077) / 500) * 500"),
        bullet("Fee breakdown: PayChangu 3% collection + 1.7% payout + Sankha 3% = 7.7% combined margin + MWK 720 flat fee"),
        bullet("Escrow-first model: PayChangu is the only accepted payment channel (COD/bank_transfer disabled)"),
        bullet("Fault-based refund logic per blueprint Section 7"),
        bullet("Delivery fee now included in both payment amount and seller payout calculation"),

        separator(),

        // ──── CORRECTION SUMMARY TABLE ─────────────────────────────────────────
        heading("2. Correction Summary"),
        new Table({
          width: { size: 10000, type: WidthType.DXA },
          rows: [
            new TableRow({
              children: ["#", "Priority", "Issue", "File(s)", "Status"].map(h =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, color: "FFFFFF" })] })],
                  shading: { fill: "1B4F72" },
                })
              ),
            }),
            ...([
              ["1", "CRITICAL", "No refund service existed", "src/services/refund.service.ts (NEW)", "FIXED"],
              ["2", "CRITICAL", "Pricing used wrong markup multiplier", "src/utils/constants.ts + 2 imports", "FIXED"],
              ["3", "CRITICAL", "delivery_fee excluded from payment & payout", "order.controller.ts, orderConfirmation.service.ts", "FIXED"],
              ["4", "CRITICAL", "cancelOrder did not trigger refund", "order.controller.ts", "FIXED"],
              ["5", "CRITICAL", "COD/bank_transfer accepted despite escrow model", "order.controller.ts", "FIXED"],
              ["6", "CRITICAL", "PayChangu callback URL pointed to wrong route", "config/paychangu.config.ts", "FIXED"],
              ["7", "CRITICAL", "Payout fee was 1.5% instead of 1.7%", "services/withdrawal.service.ts", "FIXED"],
              ["8", "HIGH", "Release codes used Math.random()", "utils/releaseCode.ts", "FIXED"],
              ["9", "HIGH", "base_price null allowed into cart", "controllers/cart.controller.ts", "FIXED"],
              ["10", "HIGH", "Stock decrement had no row lock (race condition)", "order.controller.ts", "FIXED"],
              ["11", "HIGH", "SMS notifications created but never sent", "order.controller.ts", "FIXED"],
              ["12", "HIGH", "processExpiredReleaseCodes never invoked", "jobs/paymentVerification.job.ts", "FIXED"],
              ["13", "HIGH", "No duplicate verification prevention", "services/payment.service.ts", "FIXED"],
            ]).map(row =>
              new TableRow({
                children: row.map((cell, i) =>
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18, color: i === 4 ? "008800" : "000000", bold: i === 4 })] })],
                  })
                ),
              })
            ),
          ],
        }),

        separator(),

        // ──── DETAILED CORRECTIONS ─────────────────────────────────────────────
        heading("3. Detailed Corrections"),

        // --- CRITICAL 1 ---
        heading("3.1 CRITICAL 1: Fault-Based Refund Service", HeadingLevel.HEADING_2),
        fileRef("src/services/refund.service.ts (NEW FILE)"),
        wasIssue("No refund mechanism existed. Cancelled orders with PAID payments had no money-back path."),
        fixed("Created comprehensive RefundService with fault-based logic per blueprint Section 7."),
        bold("Implementation Details:"),
        bullet("Three fault types: BUYER, SELLER, PLATFORM"),
        bullet("BUYER fault: PayChangu refund initiated; buyer absorbs gateway fees"),
        bullet("SELLER fault: Seller wallet debited + PayChangu refund to buyer"),
        bullet("PLATFORM fault: Full PayChangu refund; Sankha absorbs all fees"),
        bullet("All refund operations wrapped in Prisma $transaction for atomicity"),
        bullet("PayChangu refund endpoint: POST /payment/refund"),
        code("refundService.processRefund({ orderId, fault, reason, initiatedBy })"),

        separator(),

        // --- CRITICAL 2 ---
        heading("3.2 CRITICAL 2: Pricing Formula Correction", HeadingLevel.HEADING_2),
        fileRef("src/utils/constants.ts"),
        wasIssue("Used PRICE_MARKUP_MULTIPLIER = 1.0526 (simple 5.26% markup). Did not account for combined 7.7% margin + MWK 720 flat fee."),
        fixed("Replaced with inverse-margin formula from blueprint Section 3."),
        bold("New Formula:"),
        code("displayPrice = ceil((vendorPrice + 720) / (1 - 0.077) / 500) * 500"),
        bold("New PRICING constant object:"),
        bullet("FLAT_FEE: 720 (MWK)"),
        bullet("COMBINED_MARGIN_PERCENT: 7.7"),
        bullet("ROUNDING_STEP: 500 (MWK)"),
        bold("Downstream import fixes:"),
        bullet("src/services/bulkUpload.service.ts – removed dead PRICE_MARKUP_MULTIPLIER import"),
        bullet("src/controllers/shop-product.controller.ts – removed local calculateDisplayPrice, now imports from constants"),

        separator(),

        // --- CRITICAL 3 ---
        heading("3.3 CRITICAL 3: Delivery Fee Inclusion", HeadingLevel.HEADING_2),
        fileRef("src/controllers/order.controller.ts"),
        fileRef("src/services/orderConfirmation.service.ts"),
        wasIssue("delivery_fee was excluded from both the PayChangu payment amount and the seller payout calculation."),
        fixed("delivery_fee is now added to totalAmount in checkout AND passed to calculateSellerPayout()."),
        bold("Changes:"),
        bullet("Checkout: totalAmount += Number(cart.total_amount) + computedDeliveryFee (per cart)"),
        bullet("calculateSellerPayout() signature updated to accept optional deliveryFee parameter"),
        bullet("Seller receives: sum(order_items base_price * qty) + deliveryFee"),

        separator(),

        // --- CRITICAL 4 ---
        heading("3.4 CRITICAL 4: Refund Hook in cancelOrder", HeadingLevel.HEADING_2),
        fileRef("src/controllers/order.controller.ts"),
        wasIssue("cancelOrder set payment status to CANCELLED but never initiated actual money refund."),
        fixed("If any payment is PAID at cancellation time, refundService.processRefund() is called with fault determination."),
        bold("Fault Logic:"),
        bullet("Buyer cancels -> BUYER fault"),
        bullet("Shop owner cancels -> SELLER fault"),
        bullet("Admin cancels -> PLATFORM fault"),
        code("await refundService.processRefund({ orderId, fault, reason, initiatedBy: userId })"),

        separator(),

        // --- CRITICAL 5 ---
        heading("3.5 CRITICAL 5: PayChangu-Only Payment Enforcement", HeadingLevel.HEADING_2),
        fileRef("src/controllers/order.controller.ts"),
        wasIssue("COD and bank_transfer were accepted, bypassing the escrow model entirely."),
        fixed("Added guard at top of checkout: if payment_method !== 'paychangu', return 400 error."),
        code("if (payment_method !== 'paychangu') { return errorResponse(res, 'Sankha only accepts PayChangu payments', 400); }"),

        separator(),

        // --- CRITICAL 6 ---
        heading("3.6 CRITICAL 6: PayChangu Callback URL", HeadingLevel.HEADING_2),
        fileRef("src/config/paychangu.config.ts"),
        wasIssue("Default callbackUrl pointed to /api/payments/paychangu/callback which does not exist. Webhook notifications were lost."),
        fixed("Changed default to /api/payments/webhook – the route that validates HMAC signature and processes payment."),
        code("callbackUrl: process.env.PAYCHANGU_CALLBACK_URL || 'http://localhost:3000/api/payments/webhook'"),

        separator(),

        // --- CRITICAL 7 ---
        heading("3.7 CRITICAL 7: Payout Fee Correction", HeadingLevel.HEADING_2),
        fileRef("src/services/withdrawal.service.ts"),
        wasIssue("PAYCHANGU_FEE_PERCENT was 1.5% (estimate). Blueprint specifies 1.7%."),
        fixed("Updated to 1.7% per blueprint Section 3."),
        code("PAYCHANGU_FEE_PERCENT: 1.7"),

        separator(),

        // --- HIGH 1 ---
        heading("3.8 HIGH 1: Cryptographically Secure Release Codes", HeadingLevel.HEADING_2),
        fileRef("src/utils/releaseCode.ts"),
        wasIssue("Used Math.floor(Math.random() * CHARSET.length) – predictable PRNG, vulnerable to brute-force."),
        fixed("Replaced with crypto.randomBytes(LENGTH) for cryptographically secure random values."),
        code("import crypto from 'crypto';"),
        code("const bytes = crypto.randomBytes(LENGTH);"),
        code("code += CHARSET[bytes[i] % CHARSET.length];"),

        separator(),

        // --- HIGH 2 ---
        heading("3.9 HIGH 2: base_price NOT NULL Validation", HeadingLevel.HEADING_2),
        fileRef("src/controllers/cart.controller.ts"),
        wasIssue("Products with null base_price could be added to cart. Seller payout calculation would fail or be zero."),
        fixed("Added validation guard in addToCart: reject products where base_price is null."),
        code("if (shopProduct.base_price == null) { return errorResponse(res, 'Product pricing is incomplete...', 400); }"),

        separator(),

        // --- HIGH 3 ---
        heading("3.10 HIGH 3: Stock Race Condition Fix", HeadingLevel.HEADING_2),
        fileRef("src/controllers/order.controller.ts"),
        wasIssue("Stock decrement used Prisma's decrement without row lock. Concurrent checkouts could oversell."),
        fixed("Added SELECT ... FOR UPDATE inside the $transaction to acquire a row-level lock before decrementing."),
        code("const [locked] = await tx.$queryRawUnsafe('SELECT stock_quantity FROM shop_products WHERE id = $1 FOR UPDATE', id)"),
        code("if (!locked || locked.stock_quantity < item.quantity) throw new Error('Insufficient stock')"),

        separator(),

        // --- HIGH 4 ---
        heading("3.11 HIGH 4: SMS Dispatch in updateOrderStatus", HeadingLevel.HEADING_2),
        fileRef("src/controllers/order.controller.ts"),
        wasIssue("order_messages records were created with is_sent: false and channel: EMAIL, but no actual SMS or email was dispatched."),
        fixed("Added fire-and-forget SMS dispatch after creating the message record. On success, marks is_sent: true."),
        bold("Changes:"),
        bullet("Channel changed from EMAIL to SMS"),
        bullet("Buyer phone resolved from payment record or user profile"),
        bullet("smsService.sendSms() called in non-blocking async wrapper"),
        bullet("order_messages.is_sent updated to true on successful send"),

        separator(),

        // --- HIGH 5 ---
        heading("3.12 HIGH 5: Expired Release Code Processing", HeadingLevel.HEADING_2),
        fileRef("src/jobs/paymentVerification.job.ts"),
        wasIssue("processExpiredReleaseCodes() existed in orderConfirmationService but was never called by any job."),
        fixed("Added as step 3 in the background payment verification job, running every 1 minute."),
        code("await orderConfirmationService.processExpiredReleaseCodes()"),

        separator(),

        // --- HIGH 6 ---
        heading("3.13 HIGH 6: Duplicate Verification Prevention", HeadingLevel.HEADING_2),
        fileRef("src/services/payment.service.ts"),
        wasIssue("No guard against concurrent verifyPayment() calls for the same tx_ref. Background job + webhook + manual verify could race."),
        fixed("Added in-memory verifyingSet<string> to PaymentService. If a tx_ref is already being verified, returns current DB state. Uses try/finally to always release the lock."),
        code("private verifyingSet: Set<string> = new Set();"),
        code("if (this.verifyingSet.has(txRef)) { ... return existing; }"),
        code("try { ... } finally { this.verifyingSet.delete(txRef); }"),

        separator(),

        // ──── FINANCIAL FLOW (POST-CORRECTION) ────────────────────────────────
        heading("4. Corrected Financial Flow"),
        bold("Step 1: Product Listing"),
        bullet("Vendor sets base_price (their payout amount per unit)"),
        bullet("System calculates display_price = ceil((base_price + 720) / (1 - 0.077) / 500) * 500"),
        bullet("Products with null base_price are rejected from cart"),

        bold("Step 2: Checkout"),
        bullet("Only PayChangu payments are accepted"),
        bullet("totalAmount = sum(cart items * display_price) + delivery_fee"),
        bullet("Stock is reserved with SELECT FOR UPDATE row lock to prevent overselling"),
        bullet("PayChangu payment initiated with correct webhook callback URL"),

        bold("Step 3: Payment Verification"),
        bullet("Webhook (HMAC-verified) or background job verifies payment"),
        bullet("Duplicate concurrent verifications are prevented by in-memory lock"),
        bullet("On success: order confirmed, cryptographically secure release code generated"),
        bullet("Buyer notified via SMS with release code"),

        bold("Step 4: Delivery & Release"),
        bullet("Seller delivers goods; buyer provides release code after inspection"),
        bullet("Release code verified; seller payout = sum(base_price * qty) + delivery_fee"),
        bullet("Payout via PayChangu mobile money (1.7% fee deducted)"),
        bullet("Expired release codes auto-processed by background job"),

        bold("Step 5: Cancellation & Refund"),
        bullet("If payment is PAID at cancellation, fault-based refund is triggered"),
        bullet("BUYER fault: buyer absorbs PayChangu fees"),
        bullet("SELLER fault: seller wallet debited, buyer gets full refund"),
        bullet("PLATFORM fault: Sankha absorbs; buyer gets full refund"),

        separator(),

        // ──── FEE STRUCTURE ──────────────────────────────────────────────────
        heading("5. Fee Structure (Post-Correction)"),
        new Table({
          width: { size: 10000, type: WidthType.DXA },
          rows: [
            tRow("PayChangu Collection Fee", "3.0%"),
            tRow("PayChangu Payout Fee", "1.7%"),
            tRow("Sankha Platform Fee", "3.0%"),
            tRow("Flat Fee (per transaction)", "MWK 720"),
            tRow("Total Combined Margin", "7.7% + MWK 720"),
            tRow("Rounding Step", "MWK 500 (always round up)"),
          ],
        }),

        separator(),

        // ──── FILES MODIFIED ───────────────────────────────────────────────────
        heading("6. Files Modified"),
        bold("New Files:"),
        bullet("src/services/refund.service.ts – Fault-based refund service"),
        bold("Modified Files:"),
        bullet("src/utils/constants.ts – New PRICING object, updated calculateDisplayPrice formula, updated FEES"),
        bullet("src/utils/releaseCode.ts – crypto.randomBytes() instead of Math.random()"),
        bullet("src/config/paychangu.config.ts – Fixed callback URL default"),
        bullet("src/controllers/order.controller.ts – delivery_fee in payment, COD guard, refund hook, stock lock, SMS dispatch"),
        bullet("src/controllers/cart.controller.ts – base_price null validation"),
        bullet("src/controllers/shop-product.controller.ts – Import calculateDisplayPrice from constants"),
        bullet("src/services/orderConfirmation.service.ts – delivery_fee in seller payout"),
        bullet("src/services/payment.service.ts – Duplicate verification prevention"),
        bullet("src/services/withdrawal.service.ts – Payout fee 1.5% -> 1.7%"),
        bullet("src/services/bulkUpload.service.ts – Removed dead PRICE_MARKUP_MULTIPLIER import"),
        bullet("src/jobs/paymentVerification.job.ts – Added processExpiredReleaseCodes() call"),

        separator(),

        // ──── VERIFICATION ─────────────────────────────────────────────────────
        heading("7. Verification"),
        para("All corrections have been verified against the Sankha Financial Blueprint v2 specification."),
        bullet("TypeScript compilation: PASSED (npx tsc --noEmit - zero errors)"),
        bullet("All 7 CRITICAL fixes: Applied and verified"),
        bullet("All 6 HIGH fixes: Applied and verified"),
        bullet("No unrelated code was modified (principle: never change working code unnecessarily)"),
        bullet("All financial calculations use Prisma Decimal type"),
        bullet("All money/status mutations use Prisma $transaction for atomicity"),

        separator(),

        // ──── FOOTER ───────────────────────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [
            new TextRun({ text: "End of Corrected Audit Report", italics: true, size: 20, color: "7F8C8D" }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `Generated: ${new Date().toISOString()}`, size: 18, color: "AAAAAA" }),
          ],
        }),
      ],
    },
  ],
});

// ─── WRITE ─────────────────────────────────────────────────────────────────────
Packer.toBuffer(doc).then((buf) => {
  const outPath = "sankha_transaction_audit_corrected.docx";
  fs.writeFileSync(outPath, buf);
  console.log(`Written ${outPath} (${buf.length} bytes)`);
});

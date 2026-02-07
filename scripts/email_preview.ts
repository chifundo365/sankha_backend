import { bulkUploadSummaryTemplate } from '../src/templates/email.templates';

function printPreview(title: string, html: string) {
  console.log('--- ' + title + ' ---');
  console.log(html.substring(0, 2000));
  console.log('\n');
}

// Case A: 0 committed, failures/skips present
const htmlA = bulkUploadSummaryTemplate({
  userName: 'Test Seller',
  subject: 'Bulk Upload Complete - 0 products added',
  htmlSummary: '<p>0 products added. 2 skipped, 3 failed.</p>',
  ctaText: 'Review Upload',
  ctaUrl: 'https://localhost:3000/seller/products?batch=test-batch'
}).html;

// Case B: >0 committed
const htmlB = bulkUploadSummaryTemplate({
  userName: 'Test Seller',
  subject: 'Bulk Upload Complete - 5 products added',
  htmlSummary: '<p>5 products added. No errors.</p>',
  ctaText: 'View Your Products',
  ctaUrl: 'https://localhost:3000/seller/products'
}).html;

printPreview('Zero committed (Review Upload)', htmlA);
printPreview('Committed >0 (View Products)', htmlB);

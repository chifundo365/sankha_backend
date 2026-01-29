const XLSX = require('xlsx');

// 1. Define Headers from your template
const headers = [
  'Product Name', 'Category', 'Brand', 'SKU', 
  'Base Price (MWK)', 'Stock Quantity', 'Condition', 'Description', 'Specs (JSON)'
];

// 2. Sample Data including your specific test cases
const sampleData = [
  {
    'Product Name': 'iPhone 15 Pro Max 256GB',
    'Category': 'Smartphones',
    'Brand': 'Apple',
    'SKU': 'IP15PM-256-BLK', // Manual SKU
    'Base Price (MWK)': 1500000,
    'Stock Quantity': 10,
    'Condition': 'NEW',
    'Description': 'Brand new, sealed in box. 1 year warranty.',
    'Specs (JSON)': '{"storage": "256GB", "color": "Black Titanium"}'
  },
  {
    'Product Name': 'MacBook Air M3',
    'Category': 'Laptops',
    'Brand': 'Apple',
    'SKU': '', // Tests your Auto-SKU Generator
    'Base Price (MWK)': 2100000,
    'Stock Quantity': 3,
    'Condition': 'REFURBISHED',
    'Description': 'Certified refurbished. 90-day warranty.',
    'Specs (JSON)': '{"cpu": "M3 Chip", "ram": "16GB"}'
  }
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });

// 3. Formatting for Seller Readability
ws['!cols'] = [
  { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, 
  { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 40 }
];

XLSX.utils.book_append_sheet(wb, ws, 'Products');

// 4. Detailed Instructions based on your requirements
const instructions = [
  ['SANKHA BULK UPLOAD INSTRUCTIONS'],
  [''],
  ['REQUIRED COLUMNS:'],
  ['- Product Name: Must be unique for new items.'],
  ['- Base Price (MWK): Your price. A 5.26% fee is added for the buyer.'],
  ['- Stock Quantity: Current items in your shop.'],
  [''],
  ['PRICING EXAMPLE:'],
  ['If you enter 100,000, the buyer sees 105,260. You get 100,000.'],
  [''],
  ['IMAGE STATUS:'],
  ['All items start as "NEEDS_IMAGES". You must add photos in the dashboard.'],
  [''],
  ['NOTES:'],
  ['- SKU is optional; we will generate one if left blank.'],
  ['- Maximum 200 products per file.']
];

const instWs = XLSX.utils.aoa_to_sheet(instructions);
instWs['!cols'] = [{ wch: 100 }];
XLSX.utils.book_append_sheet(wb, instWs, 'Instructions');

XLSX.writeFile(wb, 'sankha-bulk-template.xlsx');
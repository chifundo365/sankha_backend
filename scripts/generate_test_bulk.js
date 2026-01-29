const XLSX = require('xlsx');
const fs = require('fs');

const headers = [
  'Product Name',
  'Category',
  'Brand',
  'SKU',
  'Base Price (MWK)',
  'Stock Quantity',
  'Condition',
  'Description',
  'Specs (JSON)'
];

const sampleData = [
  // 1. PERFECT DATA: Full details with JSON specs
  {
    'Product Name': 'iPhone 15 Pro Max 256GB',
    'Category': 'Smartphones',
    'Brand': 'Apple',
    'SKU': 'IP15PM-256-BLK',
    'Base Price (MWK)': 1500000,
    'Stock Quantity': 10,
    'Condition': 'NEW',
    'Description': 'Brand new, sealed in box. 1 year warranty.',
    'Specs (JSON)': '{"storage":"256GB","color":"Black Titanium","ram":"8GB"}'
  },
  {
    'Product Name': 'Samsung Galaxy S24 Ultra',
    'Category': 'Smartphones',
    'Brand': 'Samsung',
    'SKU': 'SGS24U-512-GRY',
    'Base Price (MWK)': 1350000,
    'Stock Quantity': 5,
    'Condition': 'NEW',
    'Description': 'Factory unlocked. Includes S Pen.',
    'Specs (JSON)': '{"storage":"512GB","color":"Titanium Gray","ram":"12GB"}'
  },
  // 2. PARTIAL DATA: Missing optional description and JSON specs
  {
    'Product Name': 'Hisense 55" Smart TV',
    'Category': 'TV & Audio',
    'Brand': 'Hisense',
    'SKU': 'HIS-55-4K',
    'Base Price (MWK)': 650000,
    'Stock Quantity': 8,
    'Condition': 'NEW',
    'Description': '', // Empty description
    'Specs (JSON)': ''  // No specs
  },
  // 3. MINIMAL DATA: Missing Brand and SKU (tests auto-generation)
  {
    'Product Name': 'Generic USB-C Cable',
    'Category': 'Accessories',
    'Brand': '',
    'SKU': '',
    'Base Price (MWK)': 2500,
    'Stock Quantity': 100,
    'Condition': 'NEW',
    'Description': 'Simple charging cable',
    'Specs (JSON)': ''
  },
  // 4. BROKEN DATA: Price is a string (should trigger validation error)
  {
    'Product Name': 'Broken Data Row',
    'Category': 'Electronics',
    'Brand': 'Generic',
    'SKU': 'ERR-01',
    'Base Price (MWK)': 'NOT_A_NUMBER', // Error: invalid data type
    'Stock Quantity': 10,
    'Condition': 'USED',
    'Description': 'This row should fail validation.',
    'Specs (JSON)': ''
  },
  // 5. MISSING REQUIRED: Missing Product Name (should fail)
  {
    'Product Name': '', // Error: required field missing
    'Category': 'Smartphones',
    'Brand': 'Apple',
    'SKU': 'IP13-128',
    'Base Price (MWK)': 400000,
    'Stock Quantity': 20,
    'Condition': 'USED',
    'Description': 'Row with missing name.',
    'Specs (JSON)': ''
  },
  // 6. MALAWIAN SPECIFIC: Real-world gadget test
  {
    'Product Name': 'Airtel 4G Pocket Wifi',
    'Category': 'Accessories',
    'Brand': 'Airtel',
    'SKU': 'MW-WIFI-4G',
    'Base Price (MWK)': 25000,
    'Stock Quantity': 50,
    'Condition': 'NEW',
    'Description': 'Fast mobile internet for home or office.',
    'Specs (JSON)': '{"network":"4G LTE"}'
  }
];

// Create workbook and Products sheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });

// Setting column widths for readability in Excel
ws['!cols'] = [
  { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 40 }
];

XLSX.utils.book_append_sheet(wb, ws, 'Products');

// Instructions sheet
const instructions = [
  ['BULK UPLOAD INSTRUCTIONS'],
  [''],
  ['Required Columns:'],
  ['- Product Name: The name of the product'],
  ['- Base Price (MWK): Your selling price BEFORE platform fees'],
  ['- Stock Quantity: Number of items in stock'],
  [''],
  ['Optional Columns:'],
  ['- Category, Brand, SKU, Condition, Description, Specs (JSON)'],
  [''],
  ['Notes:'],
  ['- Remove sample rows before uploading real products'],
  ['- Max 200 products per upload'],
  ['- Prices are in MWK'],
  ['- If you leave an Image URL blank, the item will be hidden until you upload a photo via the dashboard.']
];
const instWs = XLSX.utils.aoa_to_sheet(instructions);
instWs['!cols'] = [{ wch: 100 }];
XLSX.utils.book_append_sheet(wb, instWs, 'Instructions');

const outFile = 'sankha-bulk-test-v2.xlsx';
XLSX.writeFile(wb, outFile);
console.log('Successfully wrote', outFile, 'with', sampleData.length, 'test rows.');
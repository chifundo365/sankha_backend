const XLSX = require('xlsx');

const testData = [
  {
    'Product Name': 'Google Pixel 8 Pro Special Edition',
    'Category': 'Smartphones',
    'Brand': 'Google',
    'SKU': '',
    'Base Price (MWK)': '720000',
    'Stock Quantity': 6,
    'Condition': 'NEW',
    'Description': 'Missing ALL specs - should be NEEDS_SPECS'
  },
  {
    'Product Name': 'HP Pavilion Gaming Laptop 2026',
    'Category': 'Laptops',
    'Brand': 'HP',
    'SKU': '',
    'Base Price (MWK)': '980000',
    'Stock Quantity': 4,
    'Condition': 'NEW',
    'Description': 'Has RAM only, missing others',
    'RAM': '16GB'
  },
  {
    'Product Name': 'Lenovo ThinkPad X1 Carbon Gen 11',
    'Category': 'Laptops',
    'Brand': 'Lenovo',
    'SKU': '',
    'Base Price (MWK)': '1800000',
    'Stock Quantity': 2,
    'Condition': 'NEW',
    'Description': 'Complete specs - should be NEEDS_IMAGES',
    'Processor': 'Intel Core i7-1355U',
    'RAM': '32GB',
    'Storage': '1TB SSD',
    'Screen Size': '14 inches'
  }
];

const ws = XLSX.utils.json_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Products');
XLSX.writeFile(wb, 'test-specs-validation-fresh.xlsx');
console.log('✅ Created test-specs-validation-fresh.xlsx with 3 unique products');
console.log('  1. Google Pixel 8: No specs → NEEDS_SPECS');
console.log('  2. HP Pavilion: Partial specs → NEEDS_SPECS');
console.log('  3. Lenovo ThinkPad: Complete specs → NEEDS_IMAGES');

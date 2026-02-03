const XLSX = require('xlsx');

const testData = [
  {
    'Product Name': 'iPhone 15 Pro Max 2026',
    'Category': 'Smartphones',
    'Brand': 'Apple',
    'SKU': '',
    'Base Price (MWK)': '850000',
    'Stock Quantity': 5,
    'Condition': 'NEW',
    'Description': 'Latest iPhone - missing RAM and Storage specs'
  },
  {
    'Product Name': 'Dell XPS 15 9530 2026',
    'Category': 'Laptops',
    'Brand': 'Dell',
    'SKU': '',
    'Base Price (MWK)': '1200000',
    'Stock Quantity': 3,
    'Condition': 'NEW',
    'Description': 'High-end laptop - missing processor and specs',
    'RAM': '16GB'
  },
  {
    'Product Name': 'Samsung Galaxy S24 Ultra 2026',
    'Category': 'Smartphones',
    'Brand': 'Samsung',
    'SKU': '',
    'Base Price (MWK)': '650000',
    'Stock Quantity': 8,
    'Condition': 'NEW',
    'Description': 'Flagship phone with only screen size',
    'Screen Size': '6.2 inches'
  },
  {
    'Product Name': 'MacBook Air M3 2026',
    'Category': 'Laptops',
    'Brand': 'Apple',
    'SKU': '',
    'Base Price (MWK)': '1500000',
    'Stock Quantity': 2,
    'Condition': 'NEW',
    'Description': 'Complete specs - should go to NEEDS_IMAGES',
    'Processor': 'Apple M3',
    'RAM': '8GB',
    'Storage': '256GB',
    'Screen Size': '13.6 inches'
  }
];

const ws = XLSX.utils.json_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Products');
XLSX.writeFile(wb, 'test-tech-missing-specs.xlsx');
console.log('✅ Created test-tech-missing-specs.xlsx with:');
console.log('  1. iPhone 15 Pro: Missing RAM, Storage, Screen Size → NEEDS_SPECS');
console.log('  2. Dell XPS 15: Missing Processor, Storage, Screen Size → NEEDS_SPECS');
console.log('  3. Samsung Galaxy S24: Missing RAM, Storage → NEEDS_SPECS');
console.log('  4. MacBook Air M3: Complete specs → NEEDS_IMAGES');

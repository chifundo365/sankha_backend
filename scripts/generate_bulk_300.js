const XLSX = require('xlsx');
const fs = require('fs');

// Generate 300 products: 100 valid, 100 invalid, 100 needs specs/images
const products = [];

// 100 valid
for (let i = 1; i <= 100; i++) {
  products.push({
    'Product Name': `Valid Product ${i}`,
    'Category': 'Smartphones & Tablets',
    'Brand': 'BrandX',
    'SKU': `SKU-V${i}`,
    'Base Price (MWK)': 100000 + i,
    'Stock Quantity': 10 + i,
    'Condition': 'NEW',
    'Description': 'Perfect product',
    'Spec: Storage': '128GB',
    'Spec: RAM': '8GB',
    'Spec: Screen Size': '6.5 inches',
    'Spec: Battery': '4000mAh',
    'Spec: Color': 'Black'
  });
}

// 100 invalid
for (let i = 101; i <= 200; i++) {
  products.push({
    'Product Name': '', // Missing name
    'Category': 'Smartphones & Tablets',
    'Brand': 'BrandY',
    'SKU': `SKU-I${i}`,
    'Base Price (MWK)': 'NOT_A_NUMBER', // Invalid price
    'Stock Quantity': -5, // Invalid stock
    'Condition': 'NEW',
    'Description': 'Broken product',
    'Spec: Storage': '',
    'Spec: RAM': '',
    'Spec: Screen Size': '',
    'Spec: Battery': '',
    'Spec: Color': ''
  });
}

// 100 needs specs/images
for (let i = 201; i <= 300; i++) {
  products.push({
    'Product Name': `Needs Specs Product ${i}`,
    'Category': 'Smartphones & Tablets',
    'Brand': 'BrandZ',
    'SKU': `SKU-N${i}`,
    'Base Price (MWK)': 90000 + i,
    'Stock Quantity': 5 + i,
    'Condition': 'NEW',
    'Description': 'Missing specs/images',
    'Spec: Storage': '', // Missing spec
    'Spec: RAM': '', // Missing spec
    'Spec: Screen Size': '',
    'Spec: Battery': '',
    'Spec: Color': ''
  });
}

const worksheet = XLSX.utils.json_to_sheet(products);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
XLSX.writeFile(workbook, 'bulk-upload-300.xlsx');
console.log('✅ Generated bulk-upload-300.xlsx with 300 rows.');
/**
 * Generate Test Bulk Upload File for v4.0
 * Matches the v4.0 template structure with "Spec:" columns
 */
const XLSX = require('xlsx');
const fs = require('fs');

// Test Scenario 1: Valid Electronics Products (ELECTRONICS template)
const validElectronics = [
  {
    'Product Name': 'Samsung Galaxy S24 Ultra',
    'Category': 'Smartphones & Tablets',
    'Brand': 'Samsung',
    'SKU': '',
    'Base Price (MWK)': 1350000,
    'Stock Quantity': 5,
    'Condition': 'NEW',
    'Description': 'Latest Samsung flagship with S Pen, 200MP camera',
    'Spec: Storage': '256GB',
    'Spec: RAM': '12GB',
    'Spec: Screen Size': '6.8 inches',
    'Spec: Battery': '5000mAh',
    'Spec: Color': 'Titanium Black'
  },
  {
    'Product Name': 'iPhone 15 Pro Max',
    'Category': 'Smartphones & Tablets',
    'Brand': 'Apple',
    'SKU': 'IP15PM-256-NT',
    'Base Price (MWK)': 1500000,
    'Stock Quantity': 3,
    'Condition': 'NEW',
    'Description': 'Apple flagship with A17 Pro chip, titanium design',
    'Spec: Storage': '256GB',
    'Spec: RAM': '8GB',
    'Spec: Screen Size': '6.7 inches',
    'Spec: Battery': '4441mAh',
    'Spec: Color': 'Natural Titanium'
  },
  {
    'Product Name': 'Dell XPS 13 Laptop',
    'Category': 'Laptops & Computers',
    'Brand': 'Dell',
    'SKU': '',
    'Base Price (MWK)': 950000,
    'Stock Quantity': 2,
    'Condition': 'NEW',
    'Description': 'Ultra-portable laptop with InfinityEdge display',
    'Spec: Processor': 'Intel Core i7-1355U',
    'Spec: RAM': '16GB',
    'Spec: Storage': '512GB SSD',
    'Spec: Screen Size': '13.4 inches',
    'Spec: Graphics': 'Intel Iris Xe'
  }
];

// Test Scenario 2: Mixed Quality Data (Valid + Invalid)
const mixedQuality = [
  // Valid
  {
    'Product Name': 'Sony WH-1000XM5 Headphones',
    'Category': 'Audio & Headphones',
    'Brand': 'Sony',
    'SKU': 'SONY-WH1000XM5',
    'Base Price (MWK)': 280000,
    'Stock Quantity': 10,
    'Condition': 'NEW',
    'Description': 'Premium noise-cancelling headphones',
    'Spec: Type': 'Over-Ear',
    'Spec: Connectivity': 'Bluetooth 5.2',
    'Spec: Battery Life': '30 hours',
    'Spec: Color': 'Black'
  },
  // Invalid: Missing product name
  {
    'Product Name': '',
    'Category': 'Smartphones & Tablets',
    'Brand': 'Samsung',
    'SKU': 'ERR-001',
    'Base Price (MWK)': 450000,
    'Stock Quantity': 5,
    'Condition': 'NEW',
    'Description': 'This row should fail - missing name'
  },
  // Invalid: Price is not a number
  {
    'Product Name': 'Broken Price Product',
    'Category': 'Gaming & Consoles',
    'Brand': 'Sony',
    'SKU': 'ERR-002',
    'Base Price (MWK)': 'NOT_A_NUMBER',
    'Stock Quantity': 10,
    'Condition': 'NEW',
    'Description': 'This row should fail - invalid price'
  },
  // Invalid: Negative stock
  {
    'Product Name': 'Negative Stock Product',
    'Category': 'Laptops & Computers',
    'Brand': 'HP',
    'SKU': 'ERR-003',
    'Base Price (MWK)': 350000,
    'Stock Quantity': -5,
    'Condition': 'NEW',
    'Description': 'This row should fail - negative stock'
  },
  // Valid
  {
    'Product Name': 'Logitech MX Master 3S Mouse',
    'Category': 'Laptops & Computers',
    'Brand': 'Logitech',
    'SKU': 'LG-MXMASTER3S',
    'Base Price (MWK)': 75000,
    'Stock Quantity': 15,
    'Condition': 'NEW',
    'Description': 'Professional wireless mouse with multi-device support',
    'Spec: Type': 'Wireless Mouse',
    'Spec: Connectivity': 'Bluetooth + USB Receiver',
    'Spec: DPI': '8000',
    'Spec: Color': 'Graphite'
  }
];

// Test Scenario 3: Electronics Missing Specs (for NEEDS_SPECS status)
const missingSpecs = [
  {
    'Product Name': 'Samsung Galaxy A54',
    'Category': 'Smartphones & Tablets',
    'Brand': 'Samsung',
    'SKU': 'SG-A54-128',
    'Base Price (MWK)': 320000,
    'Stock Quantity': 8,
    'Condition': 'NEW',
    'Description': 'Mid-range smartphone with great camera',
    // Missing RAM and Storage specs - should flag as NEEDS_SPECS
    'Spec: Screen Size': '6.4 inches',
    'Spec: Color': 'Lime Green'
  },
  {
    'Product Name': 'MacBook Air M2',
    'Category': 'Laptops & Computers',
    'Brand': 'Apple',
    'SKU': 'MBA-M2-256',
    'Base Price (MWK)': 1200000,
    'Stock Quantity': 4,
    'Condition': 'NEW',
    'Description': 'Lightweight laptop with M2 chip',
    // Missing Storage and Processor - should flag as NEEDS_SPECS
    'Spec: RAM': '8GB',
    'Spec: Screen Size': '13.6 inches'
  }
];

// Test Scenario 4: General Products (GENERAL template with Label/Value pairs)
const generalProducts = [
  {
    'Product Name': 'Office Desk Chair',
    'Category': 'Smart Home & IoT',
    'Brand': 'Generic',
    'SKU': 'CHAIR-OFFICE-001',
    'Base Price (MWK)': 45000,
    'Stock Quantity': 20,
    'Condition': 'NEW',
    'Description': 'Ergonomic office chair with lumbar support',
    'Label_1': 'Material',
    'Value_1': 'Mesh + Steel',
    'Label_2': 'Color',
    'Value_2': 'Black',
    'Label_3': 'Weight Capacity',
    'Value_3': '120kg'
  },
  {
    'Product Name': 'Plastic Phone Holder',
    'Category': 'Smart Home & IoT',
    'Brand': '',
    'SKU': '',
    'Base Price (MWK)': 2500,
    'Stock Quantity': 100,
    'Condition': 'NEW',
    'Description': 'Adjustable phone stand for desk',
    'Label_1': 'Material',
    'Value_1': 'Plastic',
    'Label_2': 'Adjustable',
    'Value_2': 'Yes'
  }
];

// Generate Files
function generateFile(data, filename) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  
  XLSX.writeFile(workbook, filename);
  console.log(`✅ Generated: ${filename}`);
}

// Generate all test files
generateFile(validElectronics, 'test-valid-electronics.xlsx');
generateFile(mixedQuality, 'test-mixed-quality.xlsx');
generateFile(missingSpecs, 'test-missing-specs.xlsx');
generateFile(generalProducts, 'test-general-products.xlsx');

// Generate comprehensive test file with all scenarios
const allScenarios = [
  ...validElectronics,
  ...mixedQuality.slice(0, 2), // Include 1 valid, 1 invalid
  ...missingSpecs,
  ...generalProducts
];

generateFile(allScenarios, 'test-comprehensive.xlsx');

console.log('\n📦 Test files generated successfully!');
console.log('Files created:');
console.log('  1. test-valid-electronics.xlsx (3 valid products)');
console.log('  2. test-mixed-quality.xlsx (2 valid, 3 invalid)');
console.log('  3. test-missing-specs.xlsx (2 products with missing specs)');
console.log('  4. test-general-products.xlsx (2 general products)');
console.log('  5. test-comprehensive.xlsx (all scenarios combined)');

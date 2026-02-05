const XLSX = require('xlsx');

function createTestFile() {
  // Create data array with headers
  const data = [
    ['Product Name', 'Category', 'Brand', 'Base Price (MWK)', 'Stock Quantity', 'Condition', 'Description', 'SKU', 'RAM', 'Storage', 'Screen Size', 'Processor']
  ];

  // Valid products (3 products)
  data.push(['Samsung Galaxy S23', 'Smartphones', 'Samsung', 25000, 10, 'NEW', 'Latest flagship phone', 'SAMS23-001', '8GB', '256GB', '6.1 inches', 'Snapdragon 8 Gen 2']);
  data.push(['HP Pavilion 15', 'Laptops', 'HP', 45000, 5, 'NEW', 'Business laptop', 'HP-PAV-15', '16GB', '512GB', '15.6 inches', 'Intel Core i5']);
  data.push(['iPhone 14 Pro', 'Smartphones', 'Apple', 60000, 3, 'NEW', 'Premium smartphone', 'IPH14-PRO', '6GB', '128GB', '6.1 inches', 'A16 Bionic']);

  // Invalid products (5 products with various issues)
  data.push(['', 'Smartphones', 'Xiaomi', 15000, 8, 'NEW', 'Budget phone', 'XIAO-001', '4GB', '64GB', '6.5 inches', 'Snapdragon 680']); // Missing name
  data.push(['Dell Laptop', 'Laptops', 'Dell', -1000, 2, 'NEW', 'Broken price', 'DELL-001', '8GB', '256GB', '14 inches', 'Intel i3']); // Negative price
  data.push(['Tablet Pro', 'Tablets', 'Apple', 30000, -5, 'NEW', 'Negative stock', 'TAB-PRO-001', '4GB', '128GB', '10.5 inches', 'A14']); // Negative stock
  data.push(['OnePlus 11', 'Smartphones', 'OnePlus', 35000, 7, 'NEW', 'Missing specs', 'OP-11-001', '', '', '', '']); // Missing required specs
  data.push(['Gaming Laptop', 'Laptops', 'Asus', 75000, 2, 'DAMAGED', 'Invalid condition', 'ASUS-ROG-001', '32GB', '1TB', '17.3 inches', 'Intel i9']); // Invalid condition value

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Create workbook and add worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

  // Write to file
  XLSX.writeFile(workbook, 'test-bulk-mixed.xlsx');
  
  console.log('✅ Test file created: test-bulk-mixed.xlsx');
  console.log('📊 Summary:');
  console.log('  - 3 valid products (Samsung Galaxy S23, HP Pavilion 15, iPhone 14 Pro)');
  console.log('  - 5 invalid products:');
  console.log('    1. Missing product name');
  console.log('    2. Negative price');
  console.log('    3. Negative stock');
  console.log('    4. Missing required specs');
  console.log('    5. Invalid condition (should be NEW, USED, or REFURBISHED)');
}

createTestFile();

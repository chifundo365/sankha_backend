const XLSX = require('xlsx');

function createDetailedTestFile() {
  const data = [
    ['Product Name', 'Category', 'Brand', 'Base Price (MWK)', 'Stock Quantity', 'Condition', 'Description', 'SKU', 'RAM', 'Storage', 'Screen Size', 'Processor']
  ];

  // 2 valid new products
  data.push(['Nokia G50 5G', 'Smartphones', 'Nokia', 28000, 10, 'NEW', '5G enabled smartphone', 'NOKIA-G50', '6GB', '128GB', '6.82 inches', 'Snapdragon 480']);
  data.push(['Dell Inspiron 15', 'Laptops', 'Dell', 52000, 6, 'NEW', 'Reliable work laptop', 'DELL-INS15', '8GB', '512GB', '15.6 inches', 'Intel Core i5']);

  // 3 invalid products with different errors
  data.push(['', 'Smartphones', 'Tecno', 12000, 5, 'NEW', 'Missing name', 'TECNO-001', '4GB', '64GB', '6.5 inches', '']); // Missing name
  data.push(['Broken Price Phone', 'Smartphones', 'Infinix', -5000, 8, 'NEW', 'Negative price test', 'INF-001', '6GB', '128GB', '6.6 inches', 'Helio G85']); // Negative price
  data.push(['No Stock Phone', 'Smartphones', 'Oppo', 35000, -10, 'NEW', 'Negative stock', 'OPPO-001', '8GB', '256GB', '6.7 inches', 'Snapdragon 778G']); // Negative stock

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  XLSX.writeFile(workbook, 'test-email-detailed.xlsx');
  
  console.log('✅ Created test-email-detailed.xlsx');
  console.log('   2 valid products, 3 invalid products');
}

createDetailedTestFile();

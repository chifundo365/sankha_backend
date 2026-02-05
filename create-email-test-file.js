const XLSX = require('xlsx');

function createEmailTestFile() {
  // Create data array with headers
  const data = [
    ['Product Name', 'Category', 'Brand', 'Base Price (MWK)', 'Stock Quantity', 'Condition', 'Description', 'SKU', 'RAM', 'Storage', 'Screen Size', 'Processor']
  ];

  // 2 valid products to test email notification
  data.push(['Xiaomi Redmi Note 12', 'Smartphones', 'Xiaomi', 18000, 15, 'NEW', 'Budget smartphone with great camera', 'XIAO-RN12', '6GB', '128GB', '6.67 inches', 'Snapdragon 685']);
  data.push(['Lenovo IdeaPad 3', 'Laptops', 'Lenovo', 35000, 8, 'NEW', 'Affordable laptop for students', 'LENO-IP3', '8GB', '256GB', '15.6 inches', 'AMD Ryzen 5']);

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Create workbook and add worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

  // Write to file
  XLSX.writeFile(workbook, 'test-email.xlsx');
  
  console.log('✅ Email test file created: test-email.xlsx');
  console.log('📊 Contents: 2 valid products for email notification test');
}

createEmailTestFile();

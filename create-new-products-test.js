const XLSX = require('xlsx');

function createNewProductsFile() {
  const data = [
    ['Product Name', 'Category', 'Brand', 'Base Price (MWK)', 'Stock Quantity', 'Condition', 'Description', 'SKU', 'RAM', 'Storage', 'Screen Size', 'Processor']
  ];

  // New unique products
  data.push(['Huawei P60 Pro', 'Smartphones', 'Huawei', 42000, 12, 'NEW', 'Latest Huawei flagship', 'HW-P60-PRO', '8GB', '256GB', '6.67 inches', 'Kirin 9000s']);
  data.push(['Asus ROG Strix G15', 'Laptops', 'Asus', 95000, 4, 'NEW', 'Gaming laptop powerhouse', 'ASUS-ROG-G15', '16GB', '1TB', '15.6 inches', 'AMD Ryzen 9']);

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  XLSX.writeFile(workbook, 'test-new-products.xlsx');
  
  console.log('✅ Created test-new-products.xlsx with 2 new products');
}

createNewProductsFile();

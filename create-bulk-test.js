const ExcelJS = require('exceljs');

async function createBulkTestFile() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    worksheet.columns = [
        { header: 'Product Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Base Price (MWK)', key: 'base_price', width: 15 },
        { header: 'Stock Quantity', key: 'stock_quantity', width: 15 },
        { header: 'Condition', key: 'condition', width: 15 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Spec: Storage', key: 'storage', width: 15 },
        { header: 'Spec: RAM', key: 'ram', width: 15 },
        { header: 'Spec: Screen Size', key: 'screen_size', width: 15 },
        { header: 'Spec: Color', key: 'color', width: 15 }
    ];

    for (let i = 1; i <= 100; i++) {
        let product = {
            name: `Test Product ${i}`,
            category: i % 2 === 0 ? 'Phones & Tablets' : 'Computers & Laptops',
            brand: i % 3 === 0 ? '' : `Brand${i}`, // Every 3rd product missing brand
            sku: `SKU${i}`,
            base_price: i % 5 === 0 ? -1000 : 10000 + i * 100, // Every 5th product negative price
            stock_quantity: i % 7 === 0 ? -5 : 10 + i, // Every 7th product negative stock
            condition: i % 4 === 0 ? '' : 'NEW', // Every 4th product missing condition
            description: i % 6 === 0 ? '' : `Description for product ${i}`, // Every 6th product missing description
            storage: i % 2 === 0 ? '128GB' : '', // Every even product has storage
            ram: i % 2 === 0 ? '8GB' : '', // Every even product has ram
            screen_size: i % 2 === 0 ? '6.5"' : '', // Every even product has screen size
            color: i % 2 === 0 ? 'Black' : '' // Every even product has color
        };
        // Every 10th product missing name
        if (i % 10 === 0) product.name = '';
        worksheet.addRow(product);
    }

    await workbook.xlsx.writeFile('test-bulk-errors.xlsx');
    console.log('✅ Created test-bulk-errors.xlsx with 100 products, various errors');
}

createBulkTestFile().catch(console.error);

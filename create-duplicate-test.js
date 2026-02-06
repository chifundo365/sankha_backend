const ExcelJS = require('exceljs');

async function createTestFile() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Add headers matching the template
    worksheet.columns = [
        { header: 'Product Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Base Price (MWK)', key: 'base_price', width: 15 },
        { header: 'Stock Quantity', key: 'stock_quantity', width: 15 },
        { header: 'Condition', key: 'condition', width: 15 },
        { header: 'Description', key: 'description', width: 40 }
    ];

    // Add test data with duplicates
    const products = [
        {
            name: 'Nokia G50 5G', // DUPLICATE
            category: 'Phones & Tablets',
            brand: 'Nokia',
            sku: 'NOKIA-G50',
            base_price: 28000,
            stock_quantity: 15,
            condition: 'NEW',
            description: 'This is a duplicate product'
        },
        {
            name: 'Dell Inspiron 15', // DUPLICATE
            category: 'Computers & Laptops',
            brand: 'Dell',
            sku: 'DELL-INS15',
            base_price: 52000,
            stock_quantity: 8,
            condition: 'NEW',
            description: 'This is also a duplicate product'
        },
        {
            name: 'Samsung Galaxy S24',
            category: 'Phones & Tablets',
            brand: 'Samsung',
            sku: 'SAM-S24',
            base_price: 95000,
            stock_quantity: 12,
            condition: 'NEW',
            description: 'Latest Samsung flagship phone'
        },
        {
            name: 'HP Pavilion Gaming',
            category: 'Computers & Laptops',
            brand: 'HP',
            sku: 'HP-PAV-GAME',
            base_price: 78000,
            stock_quantity: 5,
            condition: 'NEW',
            description: 'Gaming laptop with RTX graphics'
        },
        {
            name: '', // INVALID - missing name
            category: 'Phones & Tablets',
            brand: 'Unknown',
            sku: 'INVALID-SKU',
            base_price: 5000,
            stock_quantity: 10,
            condition: 'NEW',
            description: 'This row has no name'
        }
    ];

    products.forEach(product => {
        worksheet.addRow(product);
    });

    await workbook.xlsx.writeFile('test-duplicates.xlsx');
    console.log('✅ Test file created: test-duplicates.xlsx');
    console.log('   - 2 duplicate products (Nokia G50 5G, Dell Inspiron 15)');
    console.log('   - 2 new valid products (Samsung Galaxy S24, HP Pavilion Gaming)');
    console.log('   - 1 invalid product (missing name)');
}

createTestFile().catch(console.error);

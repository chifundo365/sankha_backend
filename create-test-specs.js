const ExcelJS = require('exceljs');

async function createTestWithSpecs() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Add headers matching the template (with specs)
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

    // Add products WITH specs
    worksheet.addRow({
        name: 'iPhone 15 Pro',
        category: 'Phones & Tablets',
        brand: 'Apple',
        sku: 'APPLE-IP15PRO',
        base_price: 125000,
        stock_quantity: 10,
        condition: 'NEW',
        description: 'Latest iPhone with A17 Pro chip',
        storage: '256GB',
        ram: '8GB',
        screen_size: '6.1"',
        color: 'Titanium Blue'
    });

    // Add product WITHOUT specs (should be marked NEEDS_SPECS)
    worksheet.addRow({
        name: 'Xiaomi Redmi Note 13',
        category: 'Phones & Tablets',
        brand: 'Xiaomi',
        sku: 'XIAOMI-RN13',
        base_price: 45000,
        stock_quantity: 20,
        condition: 'NEW',
        description: 'Mid-range phone',
        storage: '',
        ram: '',
        screen_size: '',
        color: ''
    });

    await workbook.xlsx.writeFile('test-with-specs.xlsx');
    console.log('✅ Created test-with-specs.xlsx');
    console.log('   - 1 phone WITH specs (iPhone 15 Pro)');
    console.log('   - 1 phone WITHOUT specs (Xiaomi Redmi Note 13)');
}

createTestWithSpecs().catch(console.error);

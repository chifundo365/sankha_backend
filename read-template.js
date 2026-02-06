const ExcelJS = require('exceljs');

async function readTemplate() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('template-check.xlsx');
    const worksheet = workbook.worksheets[0];
    
    console.log('Template headers:');
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
        console.log(`  ${colNumber}: ${cell.value}`);
    });
}

readTemplate().catch(console.error);

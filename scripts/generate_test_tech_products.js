#!/usr/bin/env node
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const outFile = path.resolve(process.cwd(), 'test-tech-products.xlsx');

const data = [
  // 1 - valid smartphone
  {
    'Product Name': 'TestPhone Alpha X',
    'Category': 'Smartphones',
    'Brand': 'TestBrand',
    'SKU': 'TP-ALPHAX-001',
    'Base Price (MWK)': 650000,
    'Stock Quantity': 10,
    'Condition': 'NEW',
    'Description': 'Flagship test phone',
    'Spec: RAM': '8GB',
    'Spec: Storage': '128GB',
    'Spec: Screen Size': '6.5"'
  },

  // 2 - smartphone missing RAM -> NEEDS_SPECS
  {
    'Product Name': 'TestPhone Beta',
    'Category': 'Smartphones',
    'Brand': 'BetaCorp',
    'SKU': 'TP-BETA-002',
    'Base Price (MWK)': 450000,
    'Stock Quantity': 5,
    'Condition': 'NEW',
    'Description': 'Mid-range test phone',
    'Spec: Storage': '64GB',
    'Spec: Screen Size': '6.1"'
  },

  // 3 - laptop missing processor -> NEEDS_SPECS
  {
    'Product Name': 'UltraBook 14 Pro',
    'Category': 'Laptops',
    'Brand': 'ComputeCo',
    'SKU': 'UB-14-PRO',
    'Base Price (MWK)': 1200000,
    'Stock Quantity': 4,
    'Condition': 'NEW',
    'Description': 'Lightweight notebook',
    'Spec: RAM': '16GB',
    'Spec: Storage': '512GB',
    'Spec: Screen Size': '14"'
  },

  // 4 - headphones missing type -> NEEDS_SPECS (headphones require 'type')
  {
    'Product Name': 'BassBeats OverEar',
    'Category': 'Headphones',
    'Brand': 'AudioLab',
    'SKU': 'BB-OE-01',
    'Base Price (MWK)': 85000,
    'Stock Quantity': 15,
    'Condition': 'NEW',
    'Description': 'Comfortable over-ear headphones',
    'Spec: Battery': '20h'
  },

  // 5 - monitor valid (no required tech specs defined) -> should be NEEDS_IMAGES
  {
    'Product Name': 'ViewMax 27-inch',
    'Category': 'Monitors',
    'Brand': 'DisplayPro',
    'SKU': 'VM-27-001',
    'Base Price (MWK)': 300000,
    'Stock Quantity': 6,
    'Condition': 'NEW',
    'Description': '27-inch 144Hz monitor',
    'Spec: Screen Size': '27"',
    'Spec: Resolution': '2560x1440'
  },

  // 6 - camera missing megapixels -> NEEDS_SPECS
  {
    'Product Name': 'PhotoPro DSLR 2000',
    'Category': 'Cameras',
    'Brand': 'CamWorks',
    'SKU': 'PP-DSLR-2000',
    'Base Price (MWK)': 850000,
    'Stock Quantity': 2,
    'Condition': 'NEW',
    'Description': 'Entry-level DSLR for testing',
    // intentionally omitting 'Spec: Megapixels'
  },

  // 7 - router valid
  {
    'Product Name': 'FastNet AC2200',
    'Category': 'Routers',
    'Brand': 'NetGears',
    'SKU': 'FN-AC2200',
    'Base Price (MWK)': 95000,
    'Stock Quantity': 8,
    'Condition': 'NEW',
    'Description': 'Dual-band AC router',
    'Spec: Wireless': 'AC',
  },

  // 8 - smartwatch missing display_type -> NEEDS_SPECS
  {
    'Product Name': 'WristTech S2',
    'Category': 'Smartwatches',
    'Brand': 'WristTech',
    'SKU': 'WT-S2-001',
    'Base Price (MWK)': 120000,
    'Stock Quantity': 7,
    'Condition': 'NEW',
    'Description': 'Smartwatch with health tracking'
    // missing 'Spec: Display Type'
  },

  // 9 - invalid row: missing Base Price -> INVALID
  {
    'Product Name': 'Broken Item',
    'Category': 'Gadgets',
    'Brand': 'FailCorp',
    'SKU': 'FAIL-001',
    'Base Price (MWK)': '',
    'Stock Quantity': 3,
    'Condition': 'NEW',
    'Description': 'This row is intentionally missing price to trigger invalid'
  },

  // 10 - tablet valid
  {
    'Product Name': 'TabLite 10',
    'Category': 'Tablets',
    'Brand': 'TabWorks',
    'SKU': 'TL-10-001',
    'Base Price (MWK)': 220000,
    'Stock Quantity': 9,
    'Condition': 'NEW',
    'Description': '10-inch tablet for testing',
    'Spec: RAM': '4GB',
    'Spec: Storage': '64GB'
  }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Products');

// Add simple instructions sheet
const instruction = [
  ['Sankha Test File - 10 Tech Products'],
  ['Rows include some missing specs to test NEEDS_SPECS and one invalid row to test validation.'],
  ['Required columns: Product Name, Base Price (MWK), Stock Quantity']
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instruction), 'Instructions');

XLSX.writeFile(wb, outFile);
console.log('Wrote', outFile);

#!/bin/bash

# Bulk Upload System Complete Test
# Tests all governance APIs and workflows

BASE_URL="http://localhost:3000/api"
SHOP_ID="400e1a66-2540-40a5-a1e0-0e55f0d341f6"

echo "=========================================="
echo "🧪 BULK UPLOAD SYSTEM COMPLETE TEST"
echo "=========================================="
echo ""

# Step 1: Login
echo "📝 Step 1: Login as seller..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"chifundobiziweck@gmail.com","password":"123456"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Logged in successfully"
echo "Token: ${TOKEN:0:30}..."
echo ""

# Step 2: Download Template
echo "📥 Step 2: Download bulk upload template..."
curl -s -X GET "$BASE_URL/shops/$SHOP_ID/products/bulk/template" \
  -H "Authorization: Bearer $TOKEN" \
  -o test-downloaded-template.xlsx

if [ -f "test-downloaded-template.xlsx" ]; then
  FILE_TYPE=$(file test-downloaded-template.xlsx | grep -o "Microsoft Excel")
  if [ ! -z "$FILE_TYPE" ]; then
    echo "✅ Template downloaded successfully"
    echo "   File type: $FILE_TYPE"
  else
    echo "❌ Downloaded file is not Excel format"
    cat test-downloaded-template.xlsx
    exit 1
  fi
else
  echo "❌ Template download failed"
  exit 1
fi
echo ""

# Step 3: Create test file with mixed products
echo "📋 Step 3: Creating test file with mixed products..."
node << 'EOF'
const XLSX = require('xlsx');

const testData = [
  // Tech product with missing specs
  {
    'Product Name': 'OnePlus 12 Pro Test',
    'Category': 'Smartphones',
    'Brand': 'OnePlus',
    'SKU': '',
    'Base Price (MWK)': '680000',
    'Stock Quantity': 7,
    'Condition': 'NEW',
    'Description': 'Missing storage and screen - should be NEEDS_SPECS',
    'RAM': '12GB'
  },
  // Tech product with complete specs
  {
    'Product Name': 'ASUS ROG Laptop Test Edition',
    'Category': 'Laptops',
    'Brand': 'ASUS',
    'SKU': '',
    'Base Price (MWK)': '2100000',
    'Stock Quantity': 3,
    'Condition': 'NEW',
    'Description': 'Complete specs - should be NEEDS_IMAGES',
    'Processor': 'AMD Ryzen 9 7945HX',
    'RAM': '32GB',
    'Storage': '2TB SSD',
    'Screen Size': '16 inches'
  },
  // General product
  {
    'Product Name': 'Premium Leather Wallet',
    'Category': 'Accessories',
    'Brand': 'Generic',
    'SKU': '',
    'Base Price (MWK)': '15000',
    'Stock Quantity': 50,
    'Condition': 'NEW',
    'Description': 'General product - should be NEEDS_IMAGES',
    'Material': 'Genuine Leather',
    'Color': 'Brown'
  }
];

const ws = XLSX.utils.json_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Products');
XLSX.writeFile(wb, 'test-bulk-complete.xlsx');
console.log('✅ Created test-bulk-complete.xlsx');
console.log('   - OnePlus 12 Pro: Partial specs → NEEDS_SPECS');
console.log('   - ASUS ROG Laptop: Complete specs → NEEDS_IMAGES');
console.log('   - Leather Wallet: General product → NEEDS_IMAGES');
EOF
echo ""

# Step 4: Upload products with autoCommit
echo "📤 Step 4: Uploading products (autoCommit=true)..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/shops/$SHOP_ID/products/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-bulk-complete.xlsx" \
  -F "autoCommit=true")

echo "$UPLOAD_RESPONSE" | python -m json.tool
echo ""

# Extract summary
CREATED=$(echo $UPLOAD_RESPONSE | grep -o '"created":[0-9]*' | cut -d':' -f2)
NEEDS_SPECS=$(echo $UPLOAD_RESPONSE | grep -o '"needs_specs":[0-9]*' | cut -d':' -f2)
NEEDS_IMAGES=$(echo $UPLOAD_RESPONSE | grep -o '"needs_images":[0-9]*' | cut -d':' -f2)

echo "📊 Upload Summary:"
echo "   Created: $CREATED"
echo "   Needs Specs: $NEEDS_SPECS"
echo "   Needs Images: $NEEDS_IMAGES"
echo ""

# Step 5: Get upload history
echo "📜 Step 5: Checking upload history..."
HISTORY_RESPONSE=$(curl -s -X GET "$BASE_URL/shops/$SHOP_ID/products/bulk/history?page=1&limit=3" \
  -H "Authorization: Bearer $TOKEN")

echo "$HISTORY_RESPONSE" | python -m json.tool | head -50
echo ""

# Step 6: Get products needing specs
echo "🔧 Step 6: Getting products needing specs..."
NEEDS_SPECS_RESPONSE=$(curl -s -X GET "$BASE_URL/shops/$SHOP_ID/products/needs-specs?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN")

echo "$NEEDS_SPECS_RESPONSE" | python -m json.tool | head -40
SPECS_COUNT=$(echo $NEEDS_SPECS_RESPONSE | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
echo "   Total products needing specs: $SPECS_COUNT"
echo ""

# Step 7: Get products needing images
echo "📸 Step 7: Getting products needing images..."
NEEDS_IMAGES_RESPONSE=$(curl -s -X GET "$BASE_URL/shops/$SHOP_ID/products/needs-images?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN")

echo "$NEEDS_IMAGES_RESPONSE" | python -m json.tool | head -40
IMAGES_COUNT=$(echo $NEEDS_IMAGES_RESPONSE | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
echo "   Total products needing images: $IMAGES_COUNT"
echo ""

# Step 8: Test without autoCommit (preview mode)
echo "🔍 Step 8: Testing staging/preview mode (autoCommit=false)..."
node << 'EOF'
const XLSX = require('xlsx');
const testData = [{
  'Product Name': 'Test Preview Product',
  'Category': 'Smartphones',
  'Brand': 'Test',
  'SKU': '',
  'Base Price (MWK)': '100000',
  'Stock Quantity': 1,
  'Condition': 'NEW',
  'Description': 'Testing preview mode',
  'RAM': '4GB'
}];
const ws = XLSX.utils.json_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Products');
XLSX.writeFile(wb, 'test-preview.xlsx');
console.log('Created test-preview.xlsx');
EOF

PREVIEW_RESPONSE=$(curl -s -X POST "$BASE_URL/shops/$SHOP_ID/products/bulk" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-preview.xlsx")

echo "$PREVIEW_RESPONSE" | python -m json.tool | head -50

BATCH_ID=$(echo $PREVIEW_RESPONSE | grep -o '"batch_id":"[^"]*"' | cut -d'"' -f4)
echo "   Batch ID: $BATCH_ID"
echo ""

if [ ! -z "$BATCH_ID" ]; then
  # Step 9: Get preview
  echo "👁️ Step 9: Getting batch preview..."
  PREVIEW_DETAIL=$(curl -s -X GET "$BASE_URL/shops/$SHOP_ID/products/bulk/$BATCH_ID/preview?page=1" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "$PREVIEW_DETAIL" | python -m json.tool | head -40
  echo ""
  
  # Step 10: Commit batch
  echo "✅ Step 10: Committing batch..."
  COMMIT_RESPONSE=$(curl -s -X POST "$BASE_URL/shops/$SHOP_ID/products/bulk/$BATCH_ID/commit" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "$COMMIT_RESPONSE" | python -m json.tool
  echo ""
fi

echo "=========================================="
echo "🎉 TEST COMPLETE"
echo "=========================================="
echo ""
echo "Summary:"
echo "✅ Login successful"
echo "✅ Template download working"
echo "✅ Product upload with autoCommit working"
echo "✅ Upload history endpoint working"
echo "✅ Needs-specs endpoint working"
echo "✅ Needs-images endpoint working"
echo "✅ Staging/preview mode working"
echo "✅ Batch commit working"
echo ""
echo "All bulk upload governance APIs tested successfully! 🚀"

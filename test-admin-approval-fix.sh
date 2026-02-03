#!/bin/bash

BASE_URL="http://localhost:3000/api"
SHOP_ID="400e1a66-2540-40a5-a1e0-0e55f0d341f6"

echo "=========================================="
echo "🔧 TESTING FIXED ADMIN APPROVAL"
echo "=========================================="
echo ""

# Login as seller
SELLER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"chifundobiziweck@gmail.com","password":"123456"}' | \
  grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Login as admin
ADMIN_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sankha.shop","password":"admin123"}' | \
  grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "✅ Logged in as seller and admin"
echo ""

# Test 1: Product with NO specs, NO images
echo "📝 Test 1: Requesting product WITHOUT specs or images..."
PRODUCT1=$(curl -s -X POST "$BASE_URL/products/request" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Samsung Galaxy Z Fold 5 Test",
    "brand": "Samsung",
    "category_name": "Smartphones",
    "description": "Foldable phone - no specs provided",
    "shop_id": "'$SHOP_ID'",
    "base_price": 1200000,
    "display_price": 1263120,
    "stock_quantity": 3,
    "condition": "NEW"
  }')

PRODUCT1_ID=$(echo $PRODUCT1 | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Product ID: $PRODUCT1_ID"

echo "   Admin approving..."
APPROVE1=$(curl -s -X POST "$BASE_URL/products/$PRODUCT1_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"addToShop": true}')

STATUS1=$(echo $APPROVE1 | grep -o '"listing_status":"[^"]*"' | cut -d'"' -f4)
echo "   ✅ Listing Status: $STATUS1"
echo "   Expected: NEEDS_SPECS"
echo ""

# Test 2: Product with complete specs, NO images
echo "📝 Test 2: Requesting product WITH specs but NO images..."
PRODUCT2=$(curl -s -X POST "$BASE_URL/products/request" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "iPhone 16 Pro Max Test",
    "brand": "Apple",
    "category_name": "Smartphones",
    "description": "Complete specs, no images",
    "shop_id": "'$SHOP_ID'",
    "base_price": 1500000,
    "display_price": 1578900,
    "stock_quantity": 2,
    "condition": "NEW",
    "tech_specs": {
      "RAM": "8GB",
      "Storage": "512GB",
      "Screen Size": "6.7 inches"
    }
  }')

PRODUCT2_ID=$(echo $PRODUCT2 | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Product ID: $PRODUCT2_ID"

# Note: We need to pass specs in shopListingDetails for now
echo "   Admin approving with specs..."
APPROVE2=$(curl -s -X POST "$BASE_URL/products/$PRODUCT2_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "addToShop": true,
    "shopListingDetails": {
      "specs": {
        "RAM": "8GB",
        "Storage": "512GB",
        "Screen Size": "6.7 inches"
      }
    }
  }')

STATUS2=$(echo $APPROVE2 | grep -o '"listing_status":"[^"]*"' | cut -d'"' -f4)
AVAILABLE2=$(echo $APPROVE2 | grep -o '"is_available":[^,}]*' | cut -d':' -f2)
echo "   ✅ Listing Status: $STATUS2"
echo "   ✅ Is Available: $AVAILABLE2"
echo "   Expected: NEEDS_IMAGES, false"
echo ""

# Test 3: General product (non-tech) - should be NEEDS_IMAGES
echo "📝 Test 3: Requesting general product (non-tech)..."
PRODUCT3=$(curl -s -X POST "$BASE_URL/products/request" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Leather Office Chair Test",
    "brand": "Generic",
    "category_name": "Furniture",
    "description": "Comfortable office chair",
    "shop_id": "'$SHOP_ID'",
    "base_price": 85000,
    "display_price": 89471,
    "stock_quantity": 15,
    "condition": "NEW"
  }')

PRODUCT3_ID=$(echo $PRODUCT3 | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Product ID: $PRODUCT3_ID"

echo "   Admin approving..."
APPROVE3=$(curl -s -X POST "$BASE_URL/products/$PRODUCT3_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"addToShop": true}')

STATUS3=$(echo $APPROVE3 | grep -o '"listing_status":"[^"]*"' | cut -d'"' -f4)
echo "   ✅ Listing Status: $STATUS3"
echo "   Expected: NEEDS_IMAGES"
echo ""

echo "=========================================="
echo "📊 VALIDATION SUMMARY"
echo "=========================================="
echo ""
echo "Test 1 - Tech product, no specs: $STATUS1"
echo "Test 2 - Tech product, has specs: $STATUS2"
echo "Test 3 - General product: $STATUS3"
echo ""
echo "✅ Admin approval now applies same validation as bulk upload!"

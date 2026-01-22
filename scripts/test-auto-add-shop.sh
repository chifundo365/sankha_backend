#!/bin/bash

echo "=========================================="
echo "  AUTO-ADD TO SHOP ON APPROVAL TEST"
echo "=========================================="

# Step 1: Login as Seller
echo ""
echo "📝 STEP 1: Login as Seller (John Phiri)"
echo "----------------------------------------"

LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.phiri@techstore.mw","password":"secure456"}')

SELLER_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SELLER_TOKEN" ]; then
  echo "❌ Seller login failed!"
  exit 1
fi
echo "✅ Seller logged in"

# Step 2: Seller requests a new product
echo ""
echo "📝 STEP 2: Seller Requests New Product"
echo "----------------------------------------"

PRODUCT_NAME="Google Pixel 9 Pro"
REQUEST_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/products/request" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$PRODUCT_NAME\",
    \"brand\": \"Google\",
    \"description\": \"Latest Google flagship with Tensor G4 chip and AI features\",
    \"base_price\": 650000
  }")

REQ_SUCCESS=$(echo "$REQUEST_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)
PENDING_PRODUCT_ID=$(echo "$REQUEST_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$REQ_SUCCESS" = "true" ]; then
  echo "✅ Product requested: $PRODUCT_NAME"
  echo "   Product ID: $PENDING_PRODUCT_ID"
  echo "   Status: PENDING"
else
  MESSAGE=$(echo "$REQUEST_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
  echo "⚠️  $MESSAGE"
  # Try to get existing pending product
  PENDING_PRODUCT_ID=$(echo "$REQUEST_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

# Step 3: Login as Admin
echo ""
echo "📝 STEP 3: Login as Admin (Peter Nyirenda)"
echo "----------------------------------------"

ADMIN_LOGIN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"peter.nyirenda@admin.com","password":"admin321"}')

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Admin login failed!"
  exit 1
fi
echo "✅ Admin logged in"

# Step 4: Admin views pending products
echo ""
echo "📝 STEP 4: Admin Views Pending Products"
echo "----------------------------------------"

PENDING_RESPONSE=$(curl -s "http://localhost:3000/api/products/pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

PENDING_COUNT=$(echo "$PENDING_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
echo "   Pending products: $PENDING_COUNT"

# Get the first pending product if we don't have one
if [ -z "$PENDING_PRODUCT_ID" ]; then
  PENDING_PRODUCT_ID=$(echo "$PENDING_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

PENDING_NAME=$(echo "$PENDING_RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   First pending: $PENDING_NAME (ID: $PENDING_PRODUCT_ID)"

# Step 5: Admin approves with auto-add to shop
echo ""
echo "📝 STEP 5: Admin Approves Product (Auto-Add to Shop)"
echo "----------------------------------------"

if [ ! -z "$PENDING_PRODUCT_ID" ]; then
  APPROVE_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/products/$PENDING_PRODUCT_ID/approve" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "auto_add_to_shop": true,
      "price": 680000,
      "stock_quantity": 10,
      "condition": "NEW",
      "shop_description": "Brand new Google Pixel 9 Pro with full warranty!"
    }')

  APPROVE_SUCCESS=$(echo "$APPROVE_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)
  APPROVE_MESSAGE=$(echo "$APPROVE_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
  AUTO_ADDED=$(echo "$APPROVE_RESPONSE" | grep -o '"autoAddedToShop":[^,}]*' | cut -d':' -f2)
  SHOP_NAME=$(echo "$APPROVE_RESPONSE" | grep -o '"name":"[^"]*"' | head -2 | tail -1 | cut -d'"' -f4)

  echo "   Response: $APPROVE_MESSAGE"
  echo "   Auto-added to shop: $AUTO_ADDED"
  
  if [ "$AUTO_ADDED" = "true" ]; then
    echo "   ✅ Product automatically added to seller's shop!"
    echo ""
    echo "   📦 Shop Listing Created:"
    LISTING_PRICE=$(echo "$APPROVE_RESPONSE" | grep -o '"price":"[^"]*"' | head -1 | cut -d'"' -f4)
    LISTING_STOCK=$(echo "$APPROVE_RESPONSE" | grep -o '"stock_quantity":[0-9]*' | head -1 | cut -d':' -f2)
    LISTING_SKU=$(echo "$APPROVE_RESPONSE" | grep -o '"sku":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "      - Price: MWK $LISTING_PRICE"
    echo "      - Stock: $LISTING_STOCK units"
    echo "      - SKU: $LISTING_SKU"
  fi
else
  echo "❌ No pending product ID found"
fi

# Step 6: Verify product is now in seller's shop
echo ""
echo "📝 STEP 6: Verify Product in Seller's Shop"
echo "----------------------------------------"

# Get seller's shop
SHOPS_RESPONSE=$(curl -s "http://localhost:3000/api/shops/my-shops" \
  -H "Authorization: Bearer $SELLER_TOKEN")

SHOP_ID=$(echo "$SHOPS_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ ! -z "$SHOP_ID" ]; then
  SHOP_PRODUCTS=$(curl -s "http://localhost:3000/api/shops/$SHOP_ID/products" \
    -H "Authorization: Bearer $SELLER_TOKEN")
  
  PRODUCT_COUNT=$(echo "$SHOP_PRODUCTS" | grep -o '"totalCount":[0-9]*' | cut -d':' -f2)
  echo "   Total products in shop: $PRODUCT_COUNT"
  
  # Check if our product is there
  if echo "$SHOP_PRODUCTS" | grep -q "Google Pixel"; then
    echo "   ✅ Google Pixel 9 Pro found in shop!"
  fi
fi

echo ""
echo "=========================================="
echo "           TEST COMPLETE!"
echo "=========================================="
echo ""
echo "🎉 NEW WORKFLOW:"
echo "   1. Seller requests new product"
echo "   2. Admin approves product"
echo "   3. Product AUTOMATICALLY added to seller's shop!"
echo ""
echo "   No extra step needed for seller! 🚀"
echo ""

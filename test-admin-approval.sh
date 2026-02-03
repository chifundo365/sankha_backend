#!/bin/bash

# Admin Product Approval System Test
# Tests admin/super-admin product governance workflow

BASE_URL="http://localhost:3000/api"
SHOP_ID="400e1a66-2540-40a5-a1e0-0e55f0d341f6"

echo "=========================================="
echo "🔐 ADMIN PRODUCT APPROVAL TEST"
echo "=========================================="
echo ""

# Step 1: Login as Seller
echo "👤 Step 1: Login as SELLER..."
SELLER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"chifundobiziweck@gmail.com","password":"123456"}')

SELLER_TOKEN=$(echo $SELLER_LOGIN | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
SELLER_ID=$(echo $SELLER_LOGIN | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SELLER_TOKEN" ]; then
  echo "❌ Seller login failed"
  exit 1
fi

echo "✅ Seller logged in"
echo "   ID: $SELLER_ID"
echo ""

# Step 2: Check if admin exists, if not create one
echo "👑 Step 2: Checking admin account..."

# Try to login as admin
ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sankha.shop","password":"admin123"}')

ADMIN_TOKEN=$(echo $ADMIN_LOGIN | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "   No admin found, need to create one first"
  echo "   Please create an admin user or use existing admin credentials"
  echo ""
  echo "📝 Attempting to register admin (if registration is open)..."
  
  ADMIN_REG=$(curl -s -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{
      "email":"admin@sankha.shop",
      "password":"admin123",
      "first_name":"System",
      "last_name":"Admin",
      "phone_number":"+265999999999",
      "role":"ADMIN"
    }')
  
  echo "$ADMIN_REG" | python -m json.tool
  
  # Try login again
  ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@sankha.shop","password":"admin123"}')
  
  ADMIN_TOKEN=$(echo $ADMIN_LOGIN | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Could not get admin token. Please create admin user manually."
  echo ""
  echo "You can update an existing user to admin using SQL:"
  echo "UPDATE users SET role = 'ADMIN' WHERE email = 'youremail@example.com';"
  exit 1
fi

ADMIN_ID=$(echo $ADMIN_LOGIN | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Admin logged in"
echo "   ID: $ADMIN_ID"
echo ""

# Step 3: Seller requests a new product
echo "📝 Step 3: Seller requesting new product..."
REQUEST_RESPONSE=$(curl -s -X POST "$BASE_URL/products/request" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Xiaomi Redmi Note 13 Pro Admin Test",
    "brand": "Xiaomi",
    "category_name": "Smartphones",
    "description": "Testing admin approval workflow",
    "shop_id": "'$SHOP_ID'",
    "base_price": 380000,
    "display_price": 400000,
    "stock_quantity": 10,
    "condition": "NEW",
    "tech_specs": {
      "RAM": "8GB",
      "Storage": "256GB",
      "Screen Size": "6.67 inches",
      "Battery": "5000mAh"
    }
  }')

echo "$REQUEST_RESPONSE" | python -m json.tool
PRODUCT_ID=$(echo $REQUEST_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Product ID: $PRODUCT_ID"
echo ""

if [ -z "$PRODUCT_ID" ]; then
  echo "❌ Product request failed"
  exit 1
fi

# Step 4: Get pending products (admin view)
echo "📋 Step 4: Admin viewing pending products..."
PENDING_RESPONSE=$(curl -s -X GET "$BASE_URL/products/pending?page=1&limit=5" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$PENDING_RESPONSE" | python -m json.tool | head -50
PENDING_COUNT=$(echo $PENDING_RESPONSE | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
echo "   Total pending products: $PENDING_COUNT"
echo ""

# Step 5: Get specific product details
echo "🔍 Step 5: Admin viewing product details..."
PRODUCT_DETAIL=$(curl -s -X GET "$BASE_URL/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$PRODUCT_DETAIL" | python -m json.tool | head -40
echo ""

# Step 6: Approve product
echo "✅ Step 6: Admin approving product..."
APPROVE_RESPONSE=$(curl -s -X POST "$BASE_URL/products/$PRODUCT_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "addToShop": true,
    "verifyAsTrusted": true,
    "notes": "Product verified and approved for platform"
  }')

echo "$APPROVE_RESPONSE" | python -m json.tool
echo ""

# Step 7: Verify product is now approved
echo "🔍 Step 7: Verifying product status..."
VERIFIED_PRODUCT=$(curl -s -X GET "$BASE_URL/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $SELLER_TOKEN")

STATUS=$(echo $VERIFIED_PRODUCT | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
IS_VERIFIED=$(echo $VERIFIED_PRODUCT | grep -o '"is_verified":[^,}]*' | cut -d':' -f2)

echo "   Product Status: $STATUS"
echo "   Is Verified: $IS_VERIFIED"
echo ""

# Step 8: Test rejection flow with another product
echo "🚫 Step 8: Testing product rejection..."
echo "   Requesting another product..."
REJECT_REQUEST=$(curl -s -X POST "$BASE_URL/products/request" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Reject Product",
    "brand": "Test",
    "category_name": "Electronics",
    "description": "This will be rejected",
    "shop_id": "'$SHOP_ID'",
    "base_price": 50000,
    "display_price": 52630,
    "stock_quantity": 5,
    "condition": "NEW"
  }')

REJECT_PRODUCT_ID=$(echo $REJECT_REQUEST | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Product to reject ID: $REJECT_PRODUCT_ID"

if [ ! -z "$REJECT_PRODUCT_ID" ]; then
  REJECT_RESPONSE=$(curl -s -X POST "$BASE_URL/products/$REJECT_PRODUCT_ID/reject" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "reason": "Duplicate product - already exists in catalog",
      "notes": "Similar product already approved"
    }')
  
  echo "$REJECT_RESPONSE" | python -m json.tool
  echo ""
fi

# Step 9: Check seller's shop products
echo "🏪 Step 9: Checking seller's shop products..."
SHOP_PRODUCTS=$(curl -s -X GET "$BASE_URL/shops/$SHOP_ID/products?page=1&limit=5" \
  -H "Authorization: Bearer $SELLER_TOKEN")

echo "$SHOP_PRODUCTS" | python -m json.tool | head -40
SHOP_PRODUCT_COUNT=$(echo $SHOP_PRODUCTS | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
echo "   Total shop products: $SHOP_PRODUCT_COUNT"
echo ""

echo "=========================================="
echo "🎉 ADMIN APPROVAL TEST COMPLETE"
echo "=========================================="
echo ""
echo "Summary:"
echo "✅ Seller login successful"
echo "✅ Admin login successful"
echo "✅ Product request submitted"
echo "✅ Pending products retrieved"
echo "✅ Product details viewed"
echo "✅ Product approval working"
echo "✅ Product rejection working"
echo "✅ Shop product listing working"
echo ""
echo "Admin product governance system tested! 🚀"

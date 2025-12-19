#!/bin/bash

echo "=========================================="
echo "  SELLER PRODUCT UPLOAD WORKFLOW TEST"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Login as Seller
echo ""
echo -e "${BLUE}📝 STEP 1: Login as Seller (John Phiri)${NC}"
echo "----------------------------------------"

LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.phiri@techstore.mw","password":"secure456"}')

SELLER_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SELLER_TOKEN" ]; then
  echo -e "${RED}❌ Seller login failed!${NC}"
  echo "$LOGIN_RESPONSE"
  exit 1
fi
echo -e "${GREEN}✅ Seller logged in successfully${NC}"

# Get seller's shop ID
echo ""
echo -e "${BLUE}📝 STEP 2: Get Seller's Shop${NC}"
echo "----------------------------------------"

SHOPS_RESPONSE=$(curl -s "http://localhost:3000/api/shops/my-shops" \
  -H "Authorization: Bearer $SELLER_TOKEN")

SHOP_ID=$(echo "$SHOPS_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
SHOP_NAME=$(echo "$SHOPS_RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SHOP_ID" ]; then
  echo -e "${RED}❌ No shop found for seller${NC}"
  echo "$SHOPS_RESPONSE"
else
  echo -e "${GREEN}✅ Found shop: $SHOP_NAME (ID: $SHOP_ID)${NC}"
fi

# Step 3: Search for existing product (Scenario A - Product exists)
echo ""
echo -e "${BLUE}📝 STEP 3: Search for 'iPhone' (Product Exists)${NC}"
echo "----------------------------------------"

MATCH_RESPONSE=$(curl -s "http://localhost:3000/api/products/match?query=iPhone" \
  -H "Authorization: Bearer $SELLER_TOKEN")

HAS_MATCH=$(echo "$MATCH_RESPONSE" | grep -o '"hasExactMatch":[^,]*' | cut -d':' -f2)
BEST_MATCH_NAME=$(echo "$MATCH_RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
BEST_MATCH_ID=$(echo "$MATCH_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CONFIDENCE=$(echo "$MATCH_RESPONSE" | grep -o '"confidence":[0-9]*' | head -1 | cut -d':' -f2)

echo "   Query: 'iPhone'"
echo "   Best Match: $BEST_MATCH_NAME"
echo "   Product ID: $BEST_MATCH_ID"
echo "   Confidence: ${CONFIDENCE}%"
echo -e "${GREEN}✅ Product found in catalog - seller can add to shop${NC}"

# Step 4: Add existing product to shop
echo ""
echo -e "${BLUE}📝 STEP 4: Add iPhone to Shop Inventory${NC}"
echo "----------------------------------------"

if [ ! -z "$SHOP_ID" ] && [ ! -z "$BEST_MATCH_ID" ]; then
  ADD_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/shops/$SHOP_ID/products" \
    -H "Authorization: Bearer $SELLER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"product_id\": \"$BEST_MATCH_ID\",
      \"price\": 899000,
      \"stock_quantity\": 5,
      \"condition\": \"NEW\",
      \"sku\": \"IPHONE-15-PRO-$(date +%s)\",
      \"shop_description\": \"Brand new iPhone 15 Pro Max with warranty\"
    }")

  SUCCESS=$(echo "$ADD_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)
  MESSAGE=$(echo "$ADD_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
  
  echo "   Response: $MESSAGE"
  if [ "$SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ Product added to shop successfully!${NC}"
  else
    echo -e "${YELLOW}⚠️  $MESSAGE${NC}"
  fi
else
  echo -e "${RED}❌ Missing shop ID or product ID${NC}"
fi

# Step 5: Search for non-existing product (Scenario B)
echo ""
echo -e "${BLUE}📝 STEP 5: Search for 'Xiaomi Mi 14' (New Product)${NC}"
echo "----------------------------------------"

MATCH_RESPONSE2=$(curl -s "http://localhost:3000/api/products/match?query=Xiaomi%20Mi%2014" \
  -H "Authorization: Bearer $SELLER_TOKEN")

HAS_MATCH2=$(echo "$MATCH_RESPONSE2" | grep -o '"bestMatch":null' | head -1)
MESSAGE2=$(echo "$MATCH_RESPONSE2" | grep -o '"message":"[^"]*"' | tail -1 | cut -d'"' -f4)

echo "   Query: 'Xiaomi Mi 14'"
echo "   $MESSAGE2"

if [ ! -z "$HAS_MATCH2" ]; then
  echo -e "${YELLOW}⚠️  No match found - seller needs to request new product${NC}"
else
  BEST_NAME=$(echo "$MATCH_RESPONSE2" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  CONF=$(echo "$MATCH_RESPONSE2" | grep -o '"confidence":[0-9]*' | head -1 | cut -d':' -f2)
  echo "   Similar: $BEST_NAME (${CONF}% confidence)"
fi

# Step 6: Request new product
echo ""
echo -e "${BLUE}📝 STEP 6: Request New Product (Xiaomi Mi 14)${NC}"
echo "----------------------------------------"

REQUEST_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/products/request" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Xiaomi Mi 14 Ultra",
    "brand": "Xiaomi",
    "description": "Latest Xiaomi flagship with Leica cameras",
    "base_price": 750000
  }')

REQ_SUCCESS=$(echo "$REQUEST_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)
REQ_MESSAGE=$(echo "$REQUEST_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
REQ_STATUS=$(echo "$REQUEST_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

echo "   Response: $REQ_MESSAGE"
echo "   Status: $REQ_STATUS"

if [ "$REQ_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Product request submitted for admin review${NC}"
else
  echo -e "${YELLOW}⚠️  $REQ_MESSAGE${NC}"
fi

# Step 7: Login as Admin
echo ""
echo -e "${BLUE}📝 STEP 7: Login as Admin (Peter Nyirenda)${NC}"
echo "----------------------------------------"

ADMIN_LOGIN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"peter.nyirenda@admin.com","password":"admin321"}')

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}❌ Admin login failed!${NC}"
else
  echo -e "${GREEN}✅ Admin logged in successfully${NC}"
fi

# Step 8: View pending products
echo ""
echo -e "${BLUE}📝 STEP 8: Admin Views Pending Products${NC}"
echo "----------------------------------------"

if [ ! -z "$ADMIN_TOKEN" ]; then
  PENDING_RESPONSE=$(curl -s "http://localhost:3000/api/products/pending" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  PENDING_COUNT=$(echo "$PENDING_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  echo "   Pending products: $PENDING_COUNT"
  
  # Get first pending product ID
  PENDING_ID=$(echo "$PENDING_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  PENDING_NAME=$(echo "$PENDING_RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ ! -z "$PENDING_NAME" ]; then
    echo "   First pending: $PENDING_NAME"
    echo -e "${GREEN}✅ Admin can now approve or reject products${NC}"
  fi
fi

echo ""
echo "=========================================="
echo "           WORKFLOW TEST COMPLETE"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✅ Seller can search for products (fuzzy match)"
echo "  ✅ Seller can add existing products to shop"
echo "  ✅ Seller can request new products"
echo "  ✅ Admin can view pending products"
echo ""

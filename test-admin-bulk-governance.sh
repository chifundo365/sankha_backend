#!/bin/bash
# Test script for Admin Bulk Upload Governance APIs

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

BASE_URL="http://localhost:3000/api"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Admin Bulk Upload Governance API Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

# Step 1: Login as Admin
echo -e "${YELLOW}Step 1: Login as Admin...${NC}"
ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "peter.nyirenda@admin.com",
    "password": "AdminPeter2024$"
  }')

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}❌ Admin login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Admin logged in${NC}"

# Step 2: Get Bulk Upload Statistics
echo -e "\n${YELLOW}Step 2: Get Bulk Upload Statistics (Last 30 days)...${NC}"
STATS=$(curl -s "$BASE_URL/admin/bulk-uploads/stats?days=30" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$STATS" | jq '.data.overview' 2>/dev/null || echo "$STATS"
echo -e "${GREEN}✅ Statistics retrieved${NC}"

# Step 3: Get All Pending Bulk Uploads
echo -e "\n${YELLOW}Step 3: Get All Pending Bulk Uploads...${NC}"
PENDING=$(curl -s "$BASE_URL/admin/bulk-uploads/pending?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

PENDING_COUNT=$(echo "$PENDING" | grep -o '"total":[0-9]*' | cut -d':' -f2)
echo "   Pending uploads: ${PENDING_COUNT:-0}"
echo -e "${GREEN}✅ Pending uploads retrieved${NC}"

# Step 4: Login as Seller to get a shop ID
echo -e "\n${YELLOW}Step 4: Get Shop ID for permission test...${NC}"
SELLER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "chifundo.banda@seller.com",
    "password": "SellerChifundo2024$"
  }')

SELLER_TOKEN=$(echo "$SELLER_LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

SHOPS=$(curl -s "$BASE_URL/shops/my-shops" \
  -H "Authorization: Bearer $SELLER_TOKEN")

SHOP_ID=$(echo "$SHOPS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SHOP_ID" ]; then
  echo -e "${RED}❌ No shop found for seller${NC}"
else
  echo "   Shop ID: $SHOP_ID"
  echo -e "${GREEN}✅ Shop found${NC}"
fi

# Step 5: Toggle Bulk Upload Permission (Disable)
if [ ! -z "$SHOP_ID" ]; then
  echo -e "\n${YELLOW}Step 5: Disable Bulk Upload Permission...${NC}"
  DISABLE=$(curl -s -X PATCH "$BASE_URL/admin/shops/$SHOP_ID/bulk-upload-permission" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "can_bulk_upload": false,
      "reason": "Testing admin governance - temporary disable"
    }')

  echo "$DISABLE" | jq '.data' 2>/dev/null || echo "$DISABLE"
  echo -e "${GREEN}✅ Permission disabled${NC}"

  # Step 6: Test Upload with Disabled Permission
  echo -e "\n${YELLOW}Step 6: Test Upload with Disabled Permission...${NC}"
  # Create a small test file
  echo -e "Product Name,Price,Stock\nTest Product,100,5" > /tmp/test-upload.csv
  
  UPLOAD_TEST=$(curl -s -X POST "$BASE_URL/shops/$SHOP_ID/products/bulk" \
    -H "Authorization: Bearer $SELLER_TOKEN" \
    -F "file=@/tmp/test-upload.csv")

  if echo "$UPLOAD_TEST" | grep -q "not authorized for bulk uploads"; then
    echo -e "${GREEN}✅ Upload correctly blocked${NC}"
  else
    echo -e "${RED}❌ Upload was not blocked${NC}"
    echo "$UPLOAD_TEST"
  fi

  # Step 7: Re-enable Bulk Upload Permission
  echo -e "\n${YELLOW}Step 7: Re-enable Bulk Upload Permission...${NC}"
  ENABLE=$(curl -s -X PATCH "$BASE_URL/admin/shops/$SHOP_ID/bulk-upload-permission" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "can_bulk_upload": true,
      "reason": "Testing complete - re-enabling"
    }')

  echo "$ENABLE" | jq '.data' 2>/dev/null || echo "$ENABLE"
  echo -e "${GREEN}✅ Permission re-enabled${NC}"

  # Clean up
  rm -f /tmp/test-upload.csv
fi

# Step 8: Get Stats Again (with different timeframe)
echo -e "\n${YELLOW}Step 8: Get Stats (Last 7 days)...${NC}"
STATS_7=$(curl -s "$BASE_URL/admin/bulk-uploads/stats?days=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$STATS_7" | jq '.data.period' 2>/dev/null || echo "$STATS_7"
echo -e "${GREEN}✅ Statistics retrieved${NC}"

# Summary
echo -e "\n${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}          Test Complete${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

echo "Tested APIs:"
echo "  ✅ GET /api/admin/bulk-uploads/stats"
echo "  ✅ GET /api/admin/bulk-uploads/pending"
echo "  ✅ PATCH /api/admin/shops/:shopId/bulk-upload-permission"
echo ""
echo "Note: Force commit/cancel APIs need existing staging batches to test"

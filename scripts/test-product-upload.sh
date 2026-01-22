#!/bin/bash
# Complete Product Upload Test Script

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

BASE_URL="http://localhost:3000/api"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Product with Images Upload Test${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

# Step 1: Login as Admin
echo -e "${YELLOW}Step 1: Logging in as Admin (Peter)...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"peter.nyirenda@admin.com","password":"AdminPeter2024$"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed!${NC}"
  echo $LOGIN_RESPONSE
  exit 1
fi

echo -e "${GREEN}✅ Login successful!${NC}"
echo -e "Token: ${TOKEN:0:30}...\n"

# Step 2: Get a category ID (we'll use the first one from seed data)
echo -e "${YELLOW}Step 2: Getting categories...${NC}"
CATEGORIES=$(curl -s -X GET "$BASE_URL/categories")
echo $CATEGORIES | head -c 200
echo -e "\n"

# Step 3: Create a new product without images
echo -e "${YELLOW}Step 3: Creating a new product...${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product - Gaming Headset",
    "brand": "TestBrand",
    "description": "High-quality gaming headset with RGB lighting and noise cancellation",
    "base_price": 89.99,
    "is_active": true
  }')

echo $CREATE_RESPONSE | head -c 500
echo -e "\n"

PRODUCT_ID=$(echo $CREATE_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$PRODUCT_ID" ]; then
  echo -e "${RED}❌ Product creation failed!${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Product created with ID: $PRODUCT_ID${NC}\n"

# Step 4: Upload images to the product
echo -e "${YELLOW}Step 4: Uploading images to product...${NC}"
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/products/$PRODUCT_ID/images" \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@temp_test_images/product1.jpg" \
  -F "images=@temp_test_images/product2.jpg" \
  -F "images=@temp_test_images/product3.jpg")

echo $UPLOAD_RESPONSE
echo -e "\n"

# Step 5: Verify the product with images
echo -e "${YELLOW}Step 5: Verifying product with images...${NC}"
VERIFY_RESPONSE=$(curl -s -X GET "$BASE_URL/products/$PRODUCT_ID")
echo $VERIFY_RESPONSE | head -c 800
echo -e "\n"

echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Test Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "\nProduct ID: ${BLUE}$PRODUCT_ID${NC}"
echo -e "You can view it at: ${BLUE}$BASE_URL/products/$PRODUCT_ID${NC}"

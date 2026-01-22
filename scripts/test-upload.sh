#!/bin/bash
# Test image upload script

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Base URL
BASE_URL="http://localhost:3000/api"

# Get token from login
echo -e "${BLUE}Logging in to get token...${NC}"
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "alice.johnson@example.com", "password": "password123"}' \
  | grep -o '"token":"[^"]*' \
  | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}Failed to get token${NC}"
  exit 1
fi

echo -e "${GREEN}Token obtained!${NC}\n"

# Create a simple test image (1x1 pixel PNG)
echo -e "${BLUE}Creating test image...${NC}"
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > test-image.png

echo -e "${GREEN}Test image created!${NC}\n"

# Test 1: Upload user profile image
echo -e "${BLUE}Test 1: Uploading user profile image...${NC}"
curl -X POST "$BASE_URL/users/profile/image" \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@test-image.png" | jq .

echo -e "\n"

# Test 2: Get user profile to verify image URL
echo -e "${BLUE}Test 2: Verifying profile image URL...${NC}"
curl -X GET "$BASE_URL/users/profile" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo -e "\n"

# Clean up
rm -f test-image.png

echo -e "${GREEN}Tests completed!${NC}"

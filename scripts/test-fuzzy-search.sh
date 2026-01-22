#!/bin/bash

# First, get a fresh token
echo "🔐 Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.phiri@techstore.mw","password":"secure456"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful!"
echo ""
echo "=========================================="
echo "    FUZZY SEARCH TEST RESULTS"
echo "=========================================="

# Function to run a test and format output
run_test() {
  local test_num=$1
  local description=$2
  local query=$3
  
  echo ""
  echo "📝 Test $test_num: $description"
  echo "   Query: '$query'"
  echo "   ----------------------------------------"
  
  RESULT=$(curl -s "http://localhost:3000/api/products/match?query=$query" \
    -H "Authorization: Bearer $TOKEN")
  
  # Extract key fields
  HAS_EXACT=$(echo "$RESULT" | grep -o '"hasExactMatch":[^,]*' | cut -d':' -f2)
  BEST_NAME=$(echo "$RESULT" | grep -o '"bestMatch":{[^}]*"name":"[^"]*"' | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  CONFIDENCE=$(echo "$RESULT" | grep -o '"confidence":[0-9]*' | head -1 | cut -d':' -f2)
  SCORE=$(echo "$RESULT" | grep -o '"score":[0-9.]*' | head -1 | cut -d':' -f2)
  MESSAGE=$(echo "$RESULT" | grep -o '"message":"[^"]*"' | tail -1 | cut -d'"' -f4)
  
  if [ -z "$BEST_NAME" ]; then
    echo "   ❌ No matches found"
  else
    echo "   ✅ Best Match: $BEST_NAME"
    echo "   📊 Confidence: ${CONFIDENCE}%"
    echo "   📈 Score: $SCORE (lower is better)"
  fi
  echo "   💬 $MESSAGE"
}

# Run all tests
run_test 1 "Exact name - 'iPhone'" "iPhone"
run_test 2 "Misspelled - 'iPone'" "iPone"
run_test 3 "Partial match - 'Galaxy'" "Galaxy"
run_test 4 "Misspelled brand - 'Samsng'" "Samsng"
run_test 5 "Abbreviation - 'PS5'" "PS5"
run_test 6 "Partial - 'MacBook'" "MacBook"
run_test 7 "Brand + type - 'Sony headphones'" "Sony%20headphones"
run_test 8 "Generic term - 'laptop'" "laptop"
run_test 9 "Misspelled - 'PlayStaion'" "PlayStaion"
run_test 10 "Case insensitive - 'IPHONE'" "IPHONE"

echo ""
echo "=========================================="
echo "    TESTS COMPLETE!"
echo "=========================================="

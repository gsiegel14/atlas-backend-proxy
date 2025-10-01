#!/bin/bash

# Test script for AI Chat History endpoints
# Usage: ./test-chat-history-endpoints.sh YOUR_JWT_TOKEN YOUR_USER_ID

BASE_URL="https://atlas-backend-proxy.onrender.com"
JWT_TOKEN="${1:-}"
USER_ID="${2:-auth0|test}"

if [ -z "$JWT_TOKEN" ]; then
    echo "❌ Error: JWT token required"
    echo "Usage: $0 YOUR_JWT_TOKEN [USER_ID]"
    exit 1
fi

echo "🧪 Testing AI Chat History Endpoints"
echo "===================================="
echo ""

# Test 1: Health check
echo "1️⃣ Testing health endpoint..."
curl -s "${BASE_URL}/health" | jq '.' || echo "❌ Health check failed"
echo ""
echo ""

# Test 2: Create chat history (POST)
echo "2️⃣ Testing CREATE chat history..."
curl -s -X POST "${BASE_URL}/api/v1/history/chat" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"transcript\": \"Test transcript at $(date)\",
    \"user_id\": \"${USER_ID}\"
  }" | jq '.' || echo "❌ Create failed"
echo ""
echo ""

# Test 3: Get user chat history
echo "3️⃣ Testing GET user chat history..."
curl -s "${BASE_URL}/user/${USER_ID}/chat-history?pageSize=5" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq '.' || echo "❌ Get user history failed"
echo ""
echo ""

# Test 4: Get all chat history (OSDK path)
echo "4️⃣ Testing GET all chat history (OSDK style)..."
curl -s "${BASE_URL}/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/AiChatHistoryProduction?pageSize=5" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq '.' || echo "❌ Get all history failed"
echo ""
echo ""

# Test 5: Search chat history
echo "5️⃣ Testing SEARCH chat history..."
curl -s -X POST "${BASE_URL}/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/AiChatHistoryProduction/search" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"where\": {
      \"field\": \"userId\",
      \"type\": \"eq\",
      \"value\": \"${USER_ID}\"
    },
    \"pageSize\": 5
  }" | jq '.' || echo "❌ Search failed"
echo ""
echo ""

echo "✅ Tests complete!"


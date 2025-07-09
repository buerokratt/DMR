#!/bin/bash


set -e

cd "$(dirname "$0")"

echo "🧪 Running E2E Tests (Local Mode)..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' 

echo -e "${YELLOW}📊 Checking service status...${NC}"
docker-compose -f "../docker-compose.e2e.yml" ps

# Navigate to test directory
cd ..

echo -e "${YELLOW}🧪 Running E2E Tests...${NC}"

# Set environment variables and run tests
export RABBITMQ_MANAGEMENT_URL=http://localhost:8072
export DMR_SERVER_1_URL=http://localhost:8075
export DMR_SERVER_2_URL=http://localhost:8076
export DMR_AGENT_A_URL=http://localhost:8077
export DMR_AGENT_B_URL=http://localhost:8078
export EXTERNAL_SERVICE_A_URL=http://localhost:8073
export EXTERNAL_SERVICE_B_URL=http://localhost:8074

npx --yes pnpm@latest test

echo -e "${GREEN}✅ E2E Tests completed!${NC}" 
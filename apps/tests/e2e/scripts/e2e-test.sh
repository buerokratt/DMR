#!/bin/bash

# Full E2E test script with setup and cleanup

set -e

cd "$(dirname "$0")"

echo "🚀 Starting DMR E2E Tests (Full Mode)..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOCKER_COMPOSE_FILE="../docker-compose.e2e.yml"

# Function to cleanup
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up containers...${NC}"
    docker-compose -f "${DOCKER_COMPOSE_FILE}" down --volumes --remove-orphans || true
    docker system prune -f || true
}

# Trap cleanup on exit
trap cleanup EXIT

# Build and start services
echo -e "${YELLOW}🔨 Building and starting services...${NC}"
docker-compose -f "${DOCKER_COMPOSE_FILE}" build
docker-compose -f "${DOCKER_COMPOSE_FILE}" up -d

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
timeout=300
counter=0

while [ $counter -lt $timeout ]; do
    healthy_services=$(docker-compose -f "${DOCKER_COMPOSE_FILE}" ps | grep -c "healthy" || echo "0")

    if [ "$healthy_services" -ge 5 ]; then
        echo -e "${GREEN}✅ All services are healthy!${NC}"
        break
    fi

    echo "Waiting for services... ($counter/$timeout)"
    sleep 5
    counter=$((counter + 5))
done

if [ $counter -ge $timeout ]; then
    echo -e "${RED}❌ Services failed to start within timeout${NC}"
    docker-compose -f "${DOCKER_COMPOSE_FILE}" logs --tail=100
    exit 1
fi

# Show service status
echo -e "${YELLOW}📊 Service Status:${NC}"
docker-compose -f "${DOCKER_COMPOSE_FILE}" ps

# Run the tests with environment variables
echo -e "${YELLOW}🧪 Running E2E Tests...${NC}"
cd ..

# Set environment variables and run tests
export RABBITMQ_MANAGEMENT_URL=http://localhost:8072
export RABBITMQ_DEFAULT_USER=user
export RABBITMQ_DEFAULT_PASSWORD=pass
export DMR_SERVER_1_URL=http://localhost:8075
export DMR_SERVER_2_URL=http://localhost:8076
export DMR_AGENT_A_URL=http://localhost:8077
export DMR_AGENT_B_URL=http://localhost:8078
export EXTERNAL_SERVICE_A_URL=http://localhost:8073
export EXTERNAL_SERVICE_B_URL=http://localhost:8074

npx --yes pnpm@latest test

echo -e "${GREEN}✅ E2E Tests completed successfully!${NC}"

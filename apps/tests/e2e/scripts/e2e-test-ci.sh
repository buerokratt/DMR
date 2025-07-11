#!/bin/bash


set -e

cd "$(dirname "$0")"

echo "🚀 Starting DMR E2E Tests (CI Mode)..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# CI environment setup
echo -e "${YELLOW}🔧 Setting up CI environment...${NC}"

# Verify Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not available${NC}"
    exit 1
fi

# Verify Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not available${NC}"
    exit 1
fi

echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker-compose --version)"

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

# Wait for services to be healthy with more aggressive checking
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
timeout=600  # 10 minutes timeout for CI
counter=0
check_interval=10

while [ $counter -lt $timeout ]; do
    # Check if services are healthy using a simpler approach
    healthy_services=$(docker-compose -f "${DOCKER_COMPOSE_FILE}" ps | grep -c "healthy" || echo "0")
    total_services=$(docker-compose -f "${DOCKER_COMPOSE_FILE}" ps | grep -c "dmr-\|external-service\|rabbitmq" || echo "0")

    echo "Healthy services: $healthy_services / $total_services"

    if [ "$healthy_services" -ge 5 ]; then  # Expecting at least 5 healthy services
        echo -e "${GREEN}✅ All critical services are healthy!${NC}"
        break
    fi

    echo "Waiting for services... ($counter/$timeout seconds)"
    sleep $check_interval
    counter=$((counter + check_interval))
done

if [ $counter -ge $timeout ]; then
    echo -e "${RED}❌ Services failed to start within timeout${NC}"
    echo -e "${YELLOW}📋 Service logs:${NC}"
    docker-compose -f "${DOCKER_COMPOSE_FILE}" logs --tail=100
    exit 1
fi

# Show service status
echo -e "${YELLOW}📊 Service Status:${NC}"
docker-compose -f "${DOCKER_COMPOSE_FILE}" ps

# Install dependencies for e2e tests
echo -e "${YELLOW}📦 Installing E2E test dependencies...${NC}"
cd ..
pnpm install --frozen-lockfile

# Run the tests with environment variables
echo -e "${YELLOW}🧪 Running E2E Tests...${NC}"

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

pnpm test

echo -e "${GREEN}✅ E2E Tests completed successfully!${NC}"

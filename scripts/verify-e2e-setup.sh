#!/bin/bash

# Script to verify E2E test setup is working

set -e

echo "🔍 Verifying E2E Test Setup..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required files exist
echo -e "${YELLOW}📋 Checking required files...${NC}"

required_files=(
    "docker-compose.e2e.yml"
    "apps/tests/e2e/package.json"
    "apps/tests/e2e/src/advanced-scenarios.e2e-spec.ts"
    "scripts/e2e-test.sh"
    "scripts/e2e-test-local.sh"
    "scripts/e2e-test-ci.sh"
    ".github/workflows/e2e-tests.yml"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "✅ $file"
    else
        echo -e "${RED}❌ $file${NC}"
        exit 1
    fi
done

# Check if Docker is available
echo -e "\n${YELLOW}🐳 Checking Docker...${NC}"
if command -v docker &> /dev/null; then
    echo -e "✅ Docker: $(docker --version)"
else
    echo -e "${RED}❌ Docker not found${NC}"
    exit 1
fi

if command -v docker-compose &> /dev/null; then
    echo -e "✅ Docker Compose: $(docker-compose --version)"
else
    echo -e "${RED}❌ Docker Compose not found${NC}"
    exit 1
fi

# Check if Node.js and npm are available
echo -e "\n${YELLOW}📦 Checking Node.js environment...${NC}"
if command -v node &> /dev/null; then
    echo -e "✅ Node.js: $(node --version)"
else
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

if command -v npm &> /dev/null; then
    echo -e "✅ npm: $(npm --version)"
else
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

# Check if scripts are executable
echo -e "\n${YELLOW}🔧 Checking script permissions...${NC}"
scripts=(
    "scripts/e2e-test.sh"
    "scripts/e2e-test-local.sh"
    "scripts/e2e-test-ci.sh"
)

for script in "${scripts[@]}"; do
    if [ -x "$script" ]; then
        echo -e "✅ $script (executable)"
    else
        echo -e "${YELLOW}⚠️  $script (not executable, fixing...)${NC}"
        chmod +x "$script"
        echo -e "✅ $script (fixed)"
    fi
done

# Validate package.json scripts
echo -e "\n${YELLOW}📜 Checking npm scripts...${NC}"
required_scripts=(
    "e2e:local"
    "e2e:setup"
    "e2e:teardown"
    "e2e:ci"
)

for script_name in "${required_scripts[@]}"; do
    if npm run | grep -q "$script_name"; then
        echo -e "✅ npm run $script_name"
    else
        echo -e "${RED}❌ npm run $script_name (missing)${NC}"
        exit 1
    fi
done

# Test Docker Compose file syntax
echo -e "\n${YELLOW}🔍 Validating Docker Compose syntax...${NC}"
if docker-compose -f docker-compose.e2e.yml config > /dev/null 2>&1; then
    echo -e "✅ docker-compose.e2e.yml syntax is valid"
else
    echo -e "${RED}❌ docker-compose.e2e.yml has syntax errors${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 E2E test setup verification completed successfully!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "  • Run ${GREEN}npm run e2e:setup${NC} to start services"
echo -e "  • Run ${GREEN}npm run e2e:local${NC} to test against running services"
echo -e "  • Run ${GREEN}npm run e2e:teardown${NC} to clean up"
echo -e "  • Or run ${GREEN}npm run e2e:full${NC} for complete test cycle"
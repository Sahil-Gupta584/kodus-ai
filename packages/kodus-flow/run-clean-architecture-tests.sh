#!/bin/bash

# 🧪 Test Runner for Clean Architecture
# Executa todos os testes da nova arquitetura limpa

echo "🚀 Running Clean Architecture Tests..."
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test categories
echo -e "${BLUE}📋 Test Categories:${NC}"
echo "1. 🏗️  Clean Architecture Tests"
echo "2. 🏭  PlannerFactory Tests"
echo "3. 🤖  ReActPlanner Tests"
echo "4. 🔄  Think→Act→Observe Tests"
echo "5. 🚀  Integration Tests"
echo "6. 🚨  LLM Mandatory Tests"
echo ""

# Check if GEMINI_API_KEY is set
if [ -z "$GEMINI_API_KEY" ]; then
    echo -e "${RED}❌ GEMINI_API_KEY environment variable is not set${NC}"
    echo "Please set your Gemini API key:"
    echo "export GEMINI_API_KEY=your_api_key_here"
    exit 1
fi

echo -e "${GREEN}✅ GEMINI_API_KEY is configured${NC}"
echo ""

# Function to run a test file
run_test() {
    local test_file=$1
    local test_name=$2
    
    echo -e "${YELLOW}🧪 Running: $test_name${NC}"
    echo "File: $test_file"
    
    if npx vitest run "$test_file" --reporter=verbose; then
        echo -e "${GREEN}✅ $test_name PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name FAILED${NC}"
        return 1
    fi
    echo ""
}

# Test execution
total_tests=0
passed_tests=0
failed_tests=0

echo -e "${BLUE}🚀 Starting Test Execution...${NC}"
echo ""

# 1. Clean Architecture Tests
((total_tests++))
if run_test "tests/orchestration/clean-architecture.test.ts" "Clean Architecture Tests"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi

# 2. PlannerFactory Tests
((total_tests++))
if run_test "tests/engine/planning/planner-factory.test.ts" "PlannerFactory Tests"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi

# 3. ReActPlanner Tests
((total_tests++))
if run_test "tests/engine/planning/react-planner.test.ts" "ReActPlanner Tests"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi

# 4. Think→Act→Observe Tests
((total_tests++))
if run_test "tests/engine/agents/think-act-observe.test.ts" "Think→Act→Observe Tests"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi

# 5. Integration Tests
((total_tests++))
if run_test "tests/integration/clean-architecture.integration.test.ts" "Integration Tests"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi

# 6. LLM Mandatory Tests
((total_tests++))
if run_test "tests/validation/llm-mandatory.test.ts" "LLM Mandatory Tests"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi

# Results summary
echo ""
echo "======================================"
echo -e "${BLUE}📊 Test Results Summary${NC}"
echo "======================================"
echo -e "Total Tests: $total_tests"
echo -e "${GREEN}✅ Passed: $passed_tests${NC}"
echo -e "${RED}❌ Failed: $failed_tests${NC}"

if [ $failed_tests -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}✅ Clean Architecture is working correctly!${NC}"
    echo ""
    echo "🏗️  Architecture verified:"
    echo "   - SDKOrchestrator apenas coordena (sem God Object)"
    echo "   - LLM obrigatório em todos os pontos"
    echo "   - PlannerFactory sem fallbacks"
    echo "   - ReActPlanner com LLM real"
    echo "   - Think→Act→Observe loop funcionando"
    echo "   - Integração end-to-end validada"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}❌ Some tests failed. Please review the output above.${NC}"
    echo ""
    exit 1
fi
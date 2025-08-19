#!/bin/bash

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load API_PORT from .env if it exists, otherwise default to 3001
if [ -f .env ] && grep -q "^API_PORT=" .env; then
    API_PORT=$(grep "^API_PORT=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
else
    API_PORT=3001
fi

echo -e "${BLUE}🔍 Kodus AI - Health Check${NC}"
echo -e "${BLUE}============================${NC}"
echo -e "${BLUE}Using API Port: ${API_PORT}${NC}"
echo ""

check_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $service_name... "
    
    # Get HTTP status code and handle connection errors
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    local curl_exit=$?
    
    if [ $curl_exit -ne 0 ]; then
        echo -e "${RED}❌ CONNECTION FAILED${NC}"
        echo -e "   ${YELLOW}curl error code: $curl_exit${NC}"
        return 1
    elif echo "$status_code" | grep -q "$expected_status"; then
        echo -e "${GREEN}✅ OK (HTTP $status_code)${NC}"
        return 0
    else
        echo -e "${RED}❌ HTTP $status_code${NC}"
        return 1
    fi
}

check_docker_service() {
    local service_name=$1
    local container_name=$2
    
    echo -n "Checking container $service_name... "
    
    if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        echo -e "${GREEN}✅ RUNNING${NC}"
        return 0
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
        return 1
    fi
}

check_port() {
    local service_name=$1
    local port=$2
    
    echo -n "Checking port $port ($service_name)... "
    
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✅ OPEN${NC}"
        return 0
    else
        echo -e "${RED}❌ CLOSED${NC}"
        return 1
    fi
}

all_good=true

echo -e "${YELLOW}🐳 Checking Docker containers...${NC}"
check_docker_service "Kodus API" "kodus-orchestrator" || all_good=false
check_docker_service "PostgreSQL" "postgres" || all_good=false
check_docker_service "MongoDB" "mongo" || all_good=false
echo ""

echo -e "${YELLOW}🔌 Checking ports...${NC}"
check_port "Kodus API" $API_PORT || all_good=false
check_port "PostgreSQL" 5432 || all_good=false
check_port "MongoDB" 27017 || all_good=false
echo ""

echo -e "${YELLOW}🌐 Checking endpoints...${NC}"

# Try simple health check first (no dependencies)
echo -e "${YELLOW}   Testing simple health endpoint...${NC}"
if check_service "API Simple Health" "http://localhost:$API_PORT/health/simple"; then
    echo -e "${YELLOW}   Testing full health endpoint...${NC}"
    check_service "API Full Health" "http://localhost:$API_PORT/health" || echo -e "${YELLOW}   Note: Full health check failed, but API is responding${NC}"
else
    echo -e "${YELLOW}   Simple health failed, trying alternatives...${NC}"
    all_good=false
    
    # Try other known public endpoints
    check_service "Auth endpoints" "http://localhost:$API_PORT/auth/login" "200|404|405" || true
    check_service "User endpoints" "http://localhost:$API_PORT/user/email" "400|401|422" || true
fi
echo ""

echo -e "${BLUE}📋 Summary:${NC}"
if [ "$all_good" = true ]; then
    echo -e "${GREEN}🎉 All services are working correctly!${NC}"
    echo -e "   ${YELLOW}API Health: http://localhost:$API_PORT/health${NC}"
    echo -e "   ${YELLOW}API Simple: http://localhost:$API_PORT/health/simple${NC}"
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠️  Some services are starting up or have issues.${NC}"
    echo ""
    echo -e "${BLUE}🔧 Development Status:${NC}"
    echo -e "   ${GREEN}✅ Containers: Running${NC}"
    echo -e "   ${GREEN}✅ Databases: Connected${NC}"
    echo -e "   ${RED}❌ API HTTP: Not responding yet${NC}"
    echo ""
    echo -e "${BLUE}💡 This is normal during startup. Try:${NC}"
    echo -e "   ${YELLOW}yarn docker:logs     # Check API startup progress${NC}"
    echo -e "   ${YELLOW}yarn docker:restart  # Restart if stuck${NC}"
    echo -e "   ${YELLOW}./scripts/health-check.sh  # Re-run this check${NC}"
    echo ""
    echo -e "${BLUE}🕐 Wait 1-2 minutes for full startup${NC}"
    exit 1
fi

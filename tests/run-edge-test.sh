#!/bin/bash

# Script para ejecutar tests de casos límite
# Autor: Bull Game Team

set -e  # Salir si hay error

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}🧪 Bull Game - Tests de Casos Límite${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""

# Verificar si el puerto 3001 está en uso
if lsof -ti:3001 > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: El puerto 3001 ya está en uso${NC}"
    echo -e "${YELLOW}Por favor, detén el proceso que está usando el puerto 3001${NC}"
    echo -e "${YELLOW}Puedes usar: lsof -ti:3001 | xargs kill${NC}"
    echo ""
    
    echo -e "${BLUE}🧹 Limpiando...${NC}"
    if [ -n "$SERVER_PID" ]; then
        echo -e "Deteniendo servidor (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Limpieza completada${NC}"
    echo ""
    exit 1
fi

# Función de limpieza
cleanup() {
    echo ""
    echo -e "${BLUE}🧹 Limpiando...${NC}"
    if [ -n "$SERVER_PID" ]; then
        echo -e "Deteniendo servidor (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Limpieza completada${NC}"
    echo ""
}

# Registrar limpieza al salir
trap cleanup EXIT INT TERM

# Iniciar servidor en background
echo -e "${GREEN}🚀 Iniciando servidor...${NC}"
npm run dev > /tmp/bull-edge-test-server.log 2>&1 &
SERVER_PID=$!
echo -e "Servidor iniciado con PID: $SERVER_PID"
echo -e "Logs del servidor: /tmp/bull-edge-test-server.log"

# Esperar a que el servidor esté listo
echo -e "Esperando a que el servidor esté listo"
for i in {1..20}; do
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        break
    fi
    echo -n "."
    sleep 0.5
done
echo ""

# Verificar si el servidor está corriendo
if ! curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo -e "${RED}❌ El servidor no respondió a tiempo${NC}"
    echo -e "${YELLOW}Últimas líneas del log:${NC}"
    tail -20 /tmp/bull-edge-test-server.log
    exit 1
fi

echo -e "${GREEN}✅ Servidor listo${NC}"
echo ""

# Ejecutar tests de casos límite
echo -e "${BLUE}🧪 Ejecutando tests de casos límite...${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""

npm run test:edge

# El cleanup se ejecutará automáticamente por el trap

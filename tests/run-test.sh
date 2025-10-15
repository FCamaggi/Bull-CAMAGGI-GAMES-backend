#!/bin/bash

# Script para ejecutar el test completo del juego Bull
# Este script inicia el servidor, ejecuta el test, y limpia al final

set -e

echo "=================================================="
echo "🎮 Bull Game - Test Completo Automatizado"
echo "=================================================="
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
BACKEND_DIR="/home/fabrizio/code/cumpleaños/Juegos/Bull/backend"
SERVER_PID=""
SERVER_PORT=3001
MAX_WAIT=30 # segundos para esperar que el servidor inicie

# Función de limpieza
cleanup() {
    echo ""
    echo -e "${YELLOW}🧹 Limpiando...${NC}"
    if [ ! -z "$SERVER_PID" ]; then
        echo "Deteniendo servidor (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Limpieza completada${NC}"
}

# Registrar cleanup al salir
trap cleanup EXIT INT TERM

# Cambiar al directorio del backend
cd "$BACKEND_DIR"

# Verificar que las dependencias estén instaladas
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependencias...${NC}"
    npm install
fi

# Verificar si el puerto está en uso
if lsof -Pi :$SERVER_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ Error: El puerto $SERVER_PORT ya está en uso${NC}"
    echo "Por favor, detén el proceso que está usando el puerto $SERVER_PORT"
    echo "Puedes usar: lsof -ti:$SERVER_PORT | xargs kill"
    exit 1
fi

# Iniciar el servidor en segundo plano
echo -e "${YELLOW}🚀 Iniciando servidor...${NC}"
npm run dev > /tmp/bull-server.log 2>&1 &
SERVER_PID=$!

echo "Servidor iniciado con PID: $SERVER_PID"
echo "Logs del servidor: /tmp/bull-server.log"

# Esperar a que el servidor esté listo
echo -n "Esperando a que el servidor esté listo"
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:$SERVER_PORT/health >/dev/null 2>&1; then
        echo ""
        echo -e "${GREEN}✅ Servidor listo${NC}"
        break
    fi
    echo -n "."
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -eq $MAX_WAIT ]; then
    echo ""
    echo -e "${RED}❌ Error: El servidor no inició en $MAX_WAIT segundos${NC}"
    echo "Últimas líneas del log:"
    tail -20 /tmp/bull-server.log
    exit 1
fi

# Dar un poco más de tiempo para que el servidor esté completamente listo
sleep 2

# Ejecutar el test
echo ""
echo -e "${YELLOW}🧪 Ejecutando test completo...${NC}"
echo "=================================================="
echo ""

npm run test:full

# El cleanup se ejecutará automáticamente al salir

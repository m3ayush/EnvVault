#!/bin/bash
# EnvVault Demo Launcher
# Usage: bash start-demo.sh          (local mode — runs services directly)
#        bash start-demo.sh docker    (Docker mode — uses docker-compose)

set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$1" = "docker" ]; then
  echo ""
  echo "  Starting EnvVault with Docker Compose..."
  echo ""
  cd "$ROOT_DIR"
  docker compose up --build -d
  echo ""
  echo "==========================================="
  echo "  EnvVault is running! (Docker mode)"
  echo "  Frontend:    http://localhost:3000"
  echo "  Backend:     http://localhost:3001"
  echo "  ML Service:  http://localhost:8000"
  echo "  MLflow UI:   http://localhost:5050"
  echo "  Grafana:     http://localhost:3002  (admin/envvault)"
  echo "  Prometheus:  http://localhost:9090"
  echo "==========================================="
  echo ""
  echo "View logs:  docker compose logs -f"
  echo "Stop all:   docker compose down"
  exit 0
fi

# -- LOCAL MODE ---------------------------------------------------------------

echo ""
echo "  Starting EnvVault (local mode)..."
echo ""

# Kill any existing processes on our ports
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

# Start ML Service
echo "  Starting ML Service (port 8000)..."
cd "$ROOT_DIR/envvault-ml"
if [ -d ".venv" ]; then
  source .venv/bin/activate
elif [ ! -d "venv" ]; then
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt -q
else
  source venv/bin/activate
fi
python app.py &
ML_PID=$!
sleep 3

if curl -s http://localhost:8000/health > /dev/null 2>&1; then
  echo "  ML Service running (PID: $ML_PID)"
else
  echo "  ML Service failed to start (continuing without it)"
fi

# Start Backend
echo "  Starting Backend API (port 3001)..."
cd "$ROOT_DIR/envvault-backend"
if [ ! -d "node_modules" ]; then
  npm install -q
fi
node server.js &
BACKEND_PID=$!
sleep 2

if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  echo "  Backend running (PID: $BACKEND_PID)"
else
  echo "  Backend failed to start!"
  kill $ML_PID 2>/dev/null
  exit 1
fi

# Start Frontend
echo "  Starting Frontend (port 5173)..."
cd "$ROOT_DIR/envvault-web"
if [ ! -d "node_modules" ]; then
  npm install -q
fi
npx vite --host &
FRONTEND_PID=$!
sleep 3

echo ""
echo "=========================================="
echo "  EnvVault is running! (local mode)"
echo "  Frontend:   http://localhost:5173"
echo "  Backend:    http://localhost:3001"
echo "  ML Service: http://localhost:8000"
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $ML_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait

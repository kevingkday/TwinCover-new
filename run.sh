#!/usr/bin/env bash
set -e

echo "==================================================================="
echo "              TWINCOVER COMMERCIAL BROKER PLATFORM"
echo "==================================================================="

# 1. Virtual Environment
if [ ! -d ".venv" ]; then
    echo "[1/4] Creating virtual environment in .venv..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# 2. Dependencies
echo "[2/4] Installing / Updating Backend Dependencies..."
pip install -r backend/requirements.txt --quiet

# 3. Seed Database & Generate Sample Policy
echo "[3/4] Initializing Database Schema & Seeding Templates..."
cd backend
python -c "import app.core.init_db; app.core.init_db.init_db()"
python create_sample_pdf.py
cd ..

# 4. Frontend Setup
echo "[4/4] Setting up Frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..

echo "==================================================================="
echo "TwinCover is ready! Starting dev servers..."
echo "Backend API:  http://127.0.0.1:8000 (Swagger docs at /docs)"
echo "Frontend App: http://localhost:5173"
echo "Demo Login:   broker@twincover.com / TwinCover2026!"
echo "==================================================================="

# Start backend and frontend concurrently
(cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait

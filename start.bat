@echo off
setlocal enabledelayedexpansion

echo ===================================================================
echo               TWINCOVER COMMERCIAL BROKER PLATFORM
echo ===================================================================
echo [1/4] Checking Python Virtual Environment...

if not exist ".venv" (
    echo Creating virtual environment in .venv...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo [2/4] Installing / Updating Backend Dependencies...
python -m pip install -r backend\requirements.txt --quiet

echo [3/4] Initializing Database Schema, Seeding Templates ^& Generating Sample Policy...
cd backend
python -c "import app.core.init_db; app.core.init_db.init_db()"
python create_sample_pdf.py
cd ..

echo [4/4] Checking Frontend Dependencies...
cd frontend
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
)
cd ..

echo ===================================================================
echo TwinCover is ready! Starting dev servers...
echo Backend API:  http://127.0.0.1:8000 (Swagger docs at /docs)
echo Frontend App: http://localhost:5173
echo Demo Login:   broker@twincover.com / TwinCover2026!
echo ===================================================================

start "TwinCover Backend (FastAPI)" cmd /k "cd backend && ..\.venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"
start "TwinCover Frontend (Vite)" cmd /k "cd frontend && npm run dev"

timeout /t 3 >nul
start http://localhost:5173

pause

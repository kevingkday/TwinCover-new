@echo off
title TwinCover Sovereign AI Node (Port 8000)
cd /d "c:\Users\kevin\source\repos\kevingkday\TwinCover-new\backend"

echo ========================================================
echo   TwinCover Sovereign AI Node - Starting on Port 8000
echo   Live Frontend: https://twincover.com
echo   Local API Docs: http://localhost:8000/docs
echo ========================================================
echo.

"..\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause

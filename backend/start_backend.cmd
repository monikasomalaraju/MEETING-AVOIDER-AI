@echo off
setlocal

set "ROOT=%~dp0"
set "PYTHON=%ROOT%.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
  echo Virtual environment not found at .venv. Recreate/install backend dependencies first.
  exit /b 1
)

cd /d "%ROOT%"
"%PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000

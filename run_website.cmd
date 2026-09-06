@echo off
setlocal

set "ROOT=%~dp0"
set "PYTHON=%ROOT%backend\.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
  echo Python venv not found at backend\.venv\Scripts\python.exe
  exit /b 1
)

echo Starting backend on http://127.0.0.1:8000 ...
pushd "%ROOT%backend"
start "MeetingAvoider Backend" /min "%PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
popd

echo Starting frontend on http://127.0.0.1:5500/pages/login.html ...
pushd "%ROOT%frontend"
start "MeetingAvoider Frontend" /min "%PYTHON%" -m http.server 5500
popd

echo.
echo App is starting. Open:
echo http://127.0.0.1:5500/pages/login.html

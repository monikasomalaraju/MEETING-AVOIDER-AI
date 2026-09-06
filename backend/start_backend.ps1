Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "Virtual environment not found at .venv. Recreate/install backend dependencies first."
}

# Do not use --reload here because this machine throws WinError 5 with multiprocessing watchers.
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

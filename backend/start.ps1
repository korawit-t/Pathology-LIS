# start.ps1
$ErrorActionPreference = "Stop"

# Change to script directory (alembic.ini must be here)
Set-Location $PSScriptRoot

# Activate virtualenv
$venvActivate = Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    . $venvActivate
} else {
    Write-Host "ERROR: venv not found at $venvActivate" -ForegroundColor Red
    exit 1
}

$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

Write-Host "Running alembic upgrade head..."
alembic upgrade head
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Starting server..."
uvicorn main:app --host 0.0.0.0 --port 8000

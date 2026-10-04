$ErrorActionPreference = "Continue"

Set-Location (Join-Path $PSScriptRoot "..")

docker compose down
if ($LASTEXITCODE -ne 0) {
    Write-Error "Error: docker compose down failed."
    exit 1
}

Write-Output "Kanban Studio stopped."

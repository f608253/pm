$ErrorActionPreference = "Continue"

Set-Location (Join-Path $PSScriptRoot "..")

function Assert-Ok([string]$message) {
    if ($LASTEXITCODE -ne 0) {
        Write-Error $message
        exit 1
    }
}

if (-Not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Error: docker is not installed. See https://docs.docker.com/get-docker/"
    exit 1
}

docker version --format "{{.Server.Version}}" *> $null
Assert-Ok "Error: docker is not running. Start Docker and try again."

if (-Not (Test-Path -LiteralPath ".env")) {
    Write-Error "Error: .env not found. Copy .env.example to .env and set OPENROUTER_API_KEY."
    exit 1
}

Write-Output "Starting Kanban Studio..."
docker compose up --build -d
Assert-Ok "Error: docker compose up failed."

Write-Output ""
Write-Output "Kanban Studio is running at http://localhost:8000"

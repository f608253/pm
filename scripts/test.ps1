$ErrorActionPreference = "Continue"

Set-Location (Join-Path $PSScriptRoot "..")

docker compose exec -T backend pytest @args
exit $LASTEXITCODE

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
docker compose -f compose.yaml -f compose.lab.yaml stop
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the lab.' }
Write-Host 'Stopped. Saved data is retained. Run Start-Lab.ps1 to resume.'

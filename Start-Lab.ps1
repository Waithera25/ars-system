param([switch]$SetupOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function New-LabSecret {
    $arsBytes = New-Object byte[] 32
    $arsRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $arsRng.GetBytes($arsBytes) } finally { $arsRng.Dispose() }
    return ([System.BitConverter]::ToString($arsBytes)).Replace('-','').ToLowerInvariant()
}
if (-not (Test-Path -LiteralPath '.env')) {
    $arsPassword = New-LabSecret
    $arsConfig = @"
ADMIN_EMAIL=admin@ars.local
ADMIN_PASSWORD=$arsPassword
N8N_ENCRYPTION_KEY=$(New-LabSecret)
N8N_WEBHOOK_SECRET=$(New-LabSecret)
PUBLIC_URL=http://localhost:3000
COOKIE_SECURE=false
N8N_WEBHOOK_URL=
"@
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $arsConfig, [System.Text.UTF8Encoding]::new($false))
    Write-Host 'Created local experiment settings. Your admin email is admin@ars.local.'
    Write-Host 'Open .env to find your generated ADMIN_PASSWORD. Keep this file private.'
} else {
    Write-Host 'Using your existing .env settings and saved accounts.'
}
if ($SetupOnly) { return }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop with its Linux engine, then run this script again.' }
docker compose -f compose.yaml -f compose.lab.yaml up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Docker could not start the lab. Check its output above.' }
Write-Host 'ARS: http://localhost:3000'
Write-Host 'n8n: http://localhost:5678'
Write-Host 'Connection lab: http://localhost:3100'
Write-Host 'See START-HERE.md for your first experiment and adding apps.'

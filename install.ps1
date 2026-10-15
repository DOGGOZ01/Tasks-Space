$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$PlaceholderSecretKey = "change-me-to-a-long-random-value"

if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
}
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}

Write-Host "Building the installer (skips anything already up to date)..."
docker compose build installer installer-web

function Test-Configured {
    if (-not (Test-Path "backend\.env")) { return $false }
    try {
        $line = Get-Content "backend\.env" -ErrorAction Stop | Where-Object { $_ -match '^SECRET_KEY=' } | Select-Object -Last 1
    } catch {
        return $false
    }
    if (-not $line) { return $false }
    $value = $line -replace '^SECRET_KEY=', ''
    if ([string]::IsNullOrEmpty($value)) { return $false }
    if ($value -eq $PlaceholderSecretKey) { return $false }
    return $true
}

function Get-EnvValue {
    param($Key, $File, $Default)
    if (-not (Test-Path $File)) { return $Default }
    try {
        $line = Get-Content $File -ErrorAction Stop | Where-Object { $_ -match "^$Key=" } | Select-Object -Last 1
    } catch {
        return $Default
    }
    if (-not $line) { return $Default }
    $value = ($line -replace "^$Key=", '').Trim('"').Trim("'")
    if ([string]::IsNullOrEmpty($value)) { return $Default }
    return $value
}

function Wait-BackendHealthy {
    Write-Host "Waiting for backend to become healthy..."
    for ($i = 0; $i -lt 150; $i++) {
        $container = docker ps --filter "label=com.docker.compose.service=backend" --format "{{.Names}}" | Select-Object -First 1
        if ($container) {
            $status = $null
            try { $status = docker inspect --format "{{.State.Health.Status}}" $container 2>$null } catch {}
            if ($status -eq "healthy") {
                Write-Host "backend is healthy."
                return $true
            }
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "Backend did not become healthy in time. Check 'docker compose logs backend'."
    return $false
}

function Show-DomainSetup {
    param($Domain, $Port)
    Write-Host ""
    Write-Host "Domain '$Domain' is set in .env. Add this to your nginx and get a certificate:"
    Write-Host ""
    Write-Host "  server {"
    Write-Host "      listen 80;"
    Write-Host "      server_name $Domain;"
    Write-Host "      location / {"
    Write-Host "          proxy_pass http://127.0.0.1:$Port;"
    Write-Host '          proxy_set_header Host $host;'
    Write-Host '          proxy_set_header X-Real-IP $remote_addr;'
    Write-Host '          proxy_set_header X-Forwarded-Proto $scheme;'
    Write-Host "      }"
    Write-Host "  }"
    Write-Host ""
    Write-Host "  certbot --nginx -d $Domain"
    Write-Host ""
}

function Show-AccessInfo {
    $httpPort = Get-EnvValue -Key "HTTP_PORT" -File ".env" -Default "80"
    $domain = Get-EnvValue -Key "DOMAIN" -File ".env" -Default ""

    if ($domain) {
        Show-DomainSetup -Domain $domain -Port $httpPort
    }

    $localIp = $null
    try {
        $localIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.254.*' } |
            Select-Object -First 1).IPAddress
    } catch {}

    $publicIp = $null
    try {
        $publicIp = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 3
    } catch {}

    Write-Host ""
    Write-Host "This server should be reachable at:"
    Write-Host "  This machine:    http://localhost:$httpPort"
    if ($localIp) { Write-Host "  Local network:   http://${localIp}:$httpPort" }
    if ($publicIp) { Write-Host "  Public internet: http://${publicIp}:$httpPort  (if your firewall forwards this port; for HTTPS with a domain see README)" }
    Write-Host ""
}

if (Test-Configured) {
    docker compose up -d
    Wait-BackendHealthy | Out-Null
    Show-AccessInfo
    exit 0
}

Write-Host "Tasks Space has not been configured yet."
Write-Host ""
Write-Host "How do you want to set it up?"
Write-Host "  1) Terminal wizard"
Write-Host "  2) Web browser wizard (only reachable from this machine, 127.0.0.1)"
Write-Host "     On a remote server, pick Terminal or use an SSH tunnel."
$choice = Read-Host "Choice [1]"

if ($choice -eq "2") {
    docker compose --profile installer-web up -d installer-web
    $installerPort = Get-EnvValue -Key "INSTALLER_WEB_PORT" -File ".env" -Default "7000"
    Write-Host ""
    Write-Host "Open http://localhost:$installerPort to finish setup in your browser."
    Write-Host "Waiting for you to submit the setup wizard there..."
    Start-Sleep -Milliseconds 2500
    try {
        Start-Process "http://localhost:$installerPort"
    } catch {}
    while (-not (Test-Configured)) {
        Start-Sleep -Seconds 2
    }
    Write-Host "Configuration received."
} else {
    docker compose --profile installer run --rm installer
}

docker compose up -d
Wait-BackendHealthy | Out-Null

if ($choice -eq "2") {
    try { docker compose stop installer-web *>$null } catch {}
}

Show-AccessInfo

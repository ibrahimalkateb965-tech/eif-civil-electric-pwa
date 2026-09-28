<#
.SYNOPSIS
    Universal LAN & Offline Launcher for Engineer Islam Fouda Work Management System
    Binds HTTP listener on 0.0.0.0:8765 for LAN tablet accessibility and local workstation use.
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Port = 8765
$Prefix = "http://+:8765/"
$LocalUrl = "http://localhost:$Port/index.html"
$FallbackUrl = "http://127.0.0.1:$Port/index.html"

# Discover active local IPv4 network adapters
$IPAddresses = @()
try {
    $IPAddresses = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'Virtual|Loopback|WSL' }).IPAddress
} catch {
    # Fallback discovery using ipconfig
    $ipconfigOutput = ipconfig
    $IPAddresses = ($ipconfigOutput | Select-String -Pattern 'IPv4 Address[ .:]+([0-9.]+)' | ForEach-Object { $_.Matches.Groups[1].Value })
}

# Fall back to localhost if no external network is connected
if (-not $IPAddresses -or $IPAddresses.Count -eq 0) {
    $IPAddresses = @("127.0.0.1")
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Engineer Islam Fouda - Work Management System" -ForegroundColor White
Write-Host " Version 16.48 (Production-Ready Offline Field Platform)" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [Workstation Access]: $LocalUrl" -ForegroundColor Green

foreach ($ip in $IPAddresses) {
    if ($ip -ne "127.0.0.1") {
        Write-Host " [LAN / Tablet Access]: http://${ip}:${Port}/index.html" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host " [QR Code Instructions]:" -ForegroundColor Magenta
Write-Host " Connect field tablets or mobile phones to the same Wi-Fi/Hotspot,"
Write-Host " then scan or navigate to the LAN URL above to access the app offline."
Write-Host ""

# Start HTTP server
$AppRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location -Path $AppRoot

try {
    # Check if START_APP.exe exists as compiled Go server
    $GoServer = Join-Path $AppRoot "START_APP.exe"
    if (Test-Path $GoServer) {
        Write-Host " Starting high-performance local server (START_APP.exe)..." -ForegroundColor Gray
        Start-Process -FilePath $LocalUrl
        & "$GoServer"
        exit 0
    }
} catch {
    Write-Warning "START_APP.exe unavailable. Falling back to PowerShell HTTP listener..."
}

# Native PowerShell HTTP Listener fallback on port 8765
try {
    $Listener = New-Object System.Net.HttpListener
    # Bind to 0.0.0.0 / wildcard prefix
    $Listener.Prefixes.Add("http://*:$Port/")
    $Listener.Start()
    Write-Host " Server listening actively on 0.0.0.0:$Port" -ForegroundColor Green
    Start-Process -FilePath $LocalUrl
} catch {
    Write-Host ""
    Write-Host " [ERROR] Port $Port already in use or requires elevation." -ForegroundColor Red
    Write-Host " Please close any other running instance of the application and try again." -ForegroundColor Yellow
    Write-Host " Falling back to direct browser launch: $LocalUrl" -ForegroundColor Gray
    Start-Process -FilePath $LocalUrl
    pause
    exit 1
}

# Basic static file server loop
try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response

        $RelPath = $Request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($RelPath)) { $RelPath = "index.html" }
        $FilePath = Join-Path $AppRoot $RelPath

        if (Test-Path $FilePath -PathType Leaf) {
            $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
            $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $ContentType = switch ($Ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".pdf"  { "application/pdf" }
                ".wasm" { "application/wasm" }
                default { "application/octet-stream" }
            }
            $Response.ContentType = $ContentType
            $Response.ContentLength64 = $Bytes.Length
            $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
        } else {
            $Response.StatusCode = 404
            $Msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $Response.OutputStream.Write($Msg, 0, $Msg.Length)
        }
        $Response.Close()
    }
} finally {
    if ($Listener) { $Listener.Stop(); $Listener.Close() }
}

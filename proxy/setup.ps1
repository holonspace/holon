#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# ── 讀取 domain 設定 ──────────────────────────────────────────────────────────
$configPath = "$PSScriptRoot\config.env"
foreach ($line in Get-Content $configPath) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    $key, $val = $line -split '=', 2
    Set-Variable -Name $key.Trim() -Value $val.Trim()
}

# 組合完整 domain
$WEB_DOMAIN   = if ($WEB_SUBDOMAIN)  { "$WEB_SUBDOMAIN.$BASE_DOMAIN"  } else { $BASE_DOMAIN }
$AUTH_DOMAIN  = "$AUTH_SUBDOMAIN.$BASE_DOMAIN"
$API_DOMAIN   = "$API_SUBDOMAIN.$BASE_DOMAIN"
$CERT_NAME    = "_wildcard.$BASE_DOMAIN+1"

# ── 安裝 mkcert ──────────────────────────────────────────────────────────────
$mkcertInstalled = $null -ne (Get-Command mkcert -ErrorAction SilentlyContinue)

if ($mkcertInstalled) {
    $ver = mkcert --version 2>&1
    Write-Host "==> mkcert already installed ($ver)"
} else {
    Write-Host "==> Installing mkcert..."

    # 嘗試 winget
    if ($null -ne (Get-Command winget -ErrorAction SilentlyContinue)) {
        winget install --id FiloSottile.mkcert -e --accept-source-agreements --accept-package-agreements
    }
    # 嘗試 scoop（winget 失敗時）
    elseif ($null -ne (Get-Command scoop -ErrorAction SilentlyContinue)) {
        scoop install mkcert
    }
    # 嘗試 choco
    elseif ($null -ne (Get-Command choco -ErrorAction SilentlyContinue)) {
        choco install mkcert -y
    }
    else {
        Write-Host "❌ Cannot auto-install mkcert. Please install manually:"
        Write-Host "   https://github.com/FiloSottile/mkcert#installation"
        exit 1
    }

    # 安裝後重新整理 PATH，讓當前 session 可以找到 mkcert
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

# ── 信任本地 CA ──────────────────────────────────────────────────────────────
Write-Host "==> Installing mkcert CA into system trust store..."
mkcert -install

# ── 生成萬用字元憑證 ─────────────────────────────────────────────────────────
$certDir  = "$PSScriptRoot\certs"
$certFile = "$certDir\$CERT_NAME.pem"

if (Test-Path $certFile) {
    Write-Host "==> Certificate already exists, skipping generation"
} else {
    Write-Host "==> Generating wildcard certificate..."
    New-Item -ItemType Directory -Force -Path $certDir | Out-Null
    Push-Location $certDir
    mkcert "*.$BASE_DOMAIN" $BASE_DOMAIN
    Pop-Location
}

# ── 寫入 hosts ───────────────────────────────────────────────────────────────
Write-Host "==> Adding hosts entries..."
$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$domains = @($WEB_DOMAIN, $AUTH_DOMAIN, $API_DOMAIN)

foreach ($domain in $domains) {
    # 每次迴圈重新讀取（上一輪可能剛寫入），用 ReadAllText 確保不持鎖
    $content = [System.IO.File]::ReadAllText($hostsPath)
    $escaped = [regex]::Escape($domain)
    # 比對整個 token，避免 holon.gg 誤匹配 auth.holon.gg
    if ($content -match "(\s|^)$escaped(\s|`$)") {
        Write-Host "  Skipped $domain (already exists)"
    } else {
        # AppendAllText 寫完立即釋放檔案控制代碼
        [System.IO.File]::AppendAllText($hostsPath, "`n127.0.0.1 $domain")
        Write-Host "  Added $domain"
    }
}

Write-Host ""
Write-Host "✅ Proxy setup complete."
Write-Host "   Run: docker compose up -d; pnpm dev"

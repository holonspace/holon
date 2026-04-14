#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ── 讀取 domain 設定 ──────────────────────────────────────────────────────────
source "$SCRIPT_DIR/config.env"

# 組合完整 domain
WEB_DOMAIN="${WEB_SUBDOMAIN:+${WEB_SUBDOMAIN}.}${BASE_DOMAIN}"
AUTH_DOMAIN="${AUTH_SUBDOMAIN}.${BASE_DOMAIN}"
API_DOMAIN="${API_SUBDOMAIN}.${BASE_DOMAIN}"
CERT_NAME="_wildcard.${BASE_DOMAIN}+1"

# ── 安裝 mkcert ──────────────────────────────────────────────────────────────
if command -v mkcert &>/dev/null; then
    echo "==> mkcert already installed ($(mkcert --version))"
else
    echo "==> Installing mkcert..."
    if command -v brew &>/dev/null; then
        brew install mkcert
    elif command -v apt-get &>/dev/null; then
        sudo apt-get update -q && sudo apt-get install -y mkcert
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm mkcert
    else
        echo "❌ Cannot auto-install mkcert. Please install manually:"
        echo "   https://github.com/FiloSottile/mkcert#installation"
        exit 1
    fi
fi

# ── 信任本地 CA ──────────────────────────────────────────────────────────────
echo "==> Installing mkcert CA into system trust store..."
mkcert -install

# ── 生成萬用字元憑證 ─────────────────────────────────────────────────────────
CERT_DIR="$SCRIPT_DIR/certs"
CERT_FILE="$CERT_DIR/${CERT_NAME}.pem"

if [ -f "$CERT_FILE" ]; then
    echo "==> Certificate already exists, skipping generation"
else
    echo "==> Generating wildcard certificate..."
    mkdir -p "$CERT_DIR"
    cd "$CERT_DIR"
    mkcert "*.${BASE_DOMAIN}" "${BASE_DOMAIN}"
    cd "$ROOT_DIR"
fi

# ── 寫入 hosts ───────────────────────────────────────────────────────────────
echo "==> Adding hosts entries (requires sudo)..."
HOSTS="/etc/hosts"
for domain in "$WEB_DOMAIN" "$AUTH_DOMAIN" "$API_DOMAIN"; do
    if ! grep -q "[[:space:]]${domain}$\|[[:space:]]${domain}[[:space:]]" "$HOSTS" 2>/dev/null; then
        echo "127.0.0.1 $domain" | sudo tee -a "$HOSTS" > /dev/null
        echo "  Added $domain"
    else
        echo "  Skipped $domain (already exists)"
    fi
done

echo ""
echo "✅ Proxy setup complete."
echo "   Run: docker compose up -d && pnpm dev"

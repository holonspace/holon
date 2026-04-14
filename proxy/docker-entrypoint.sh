#!/bin/sh
set -e

# 讀取 config.env
set -a
. /etc/nginx/config.env
set +a

# 組合完整 domain
if [ -n "$WEB_SUBDOMAIN" ]; then
    WEB_DOMAIN="${WEB_SUBDOMAIN}.${BASE_DOMAIN}"
else
    WEB_DOMAIN="${BASE_DOMAIN}"
fi
AUTH_DOMAIN="${AUTH_SUBDOMAIN}.${BASE_DOMAIN}"
API_DOMAIN="${API_SUBDOMAIN}.${BASE_DOMAIN}"

export WEB_DOMAIN AUTH_DOMAIN API_DOMAIN

# 用 envsubst 生成 nginx.conf
envsubst '$BASE_DOMAIN $WEB_DOMAIN $AUTH_DOMAIN $API_DOMAIN $WEB_PORT $AUTH_PORT $API_PORT' \
    < /etc/nginx/nginx.conf.template \
    > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'

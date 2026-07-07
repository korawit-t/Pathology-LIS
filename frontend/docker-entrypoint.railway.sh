#!/bin/sh
# Custom entrypoint for the Railway build (Dockerfile.railway) — bypasses
# nginx's built-in envsubst-on-templates mechanism because that one only
# fills in env vars, and this config also needs RESOLVER_ADDR, which isn't
# an env var — it has to be read from /etc/resolv.conf at container start
# (Railway assigns it dynamically per container, it's not knowable at
# build time or settable as a fixed env var).
set -e

: "${BACKEND_UPSTREAM:?BACKEND_UPSTREAM env var is required, e.g. BACKEND_UPSTREAM=backend.railway.internal:8000}"

# nginx's `resolver` directive requires IPv6 literals wrapped in [brackets]
# (otherwise it tries to parse text after the last ":" as a port number,
# e.g. "fd12::10" -> "invalid port in resolver"). IPv4 addresses are left
# bare.
RESOLVER_ADDR=$(awk '
    $1 == "nameserver" {
        addr = $2
        if (index(addr, ":") > 0) { printf "[%s] ", addr }
        else { printf "%s ", addr }
    }
' /etc/resolv.conf)
export RESOLVER_ADDR="${RESOLVER_ADDR:-127.0.0.11}"

envsubst '${BACKEND_UPSTREAM} ${RESOLVER_ADDR}' \
    < /etc/nginx/nginx.conf.template \
    > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'

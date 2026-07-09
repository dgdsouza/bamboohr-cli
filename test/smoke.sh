#!/usr/bin/env bash
# Offline smoke tests for the bundled CLI. No network access required.
set -euo pipefail

cd "$(dirname "$0")/.."
CLI=scripts/bamboohr.js
export HOME="$(mktemp -d)"
trap 'rm -rf "$HOME"' EXIT
unset BAMBOOHR_DOMAIN BAMBOOHR_API_KEY BAMBOOHR_CLIENT_ID BAMBOOHR_CLIENT_SECRET \
      BAMBOOHR_REDIRECT_URI BAMBOOHR_CONFIG_DIR 2>/dev/null || true

fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "ok: $1"; }

node "$CLI" --help >/dev/null || fail "--help exits non-zero"
pass "--help"

[ "$(node "$CLI" status | node -pe 'JSON.parse(require("fs").readFileSync(0)).authenticated')" = "false" ] \
  || fail "fresh status should be unauthenticated"
pass "status unauthenticated"

OUT=$(node "$CLI" login-oauth-start --domain acme --client-id id --client-secret sec)
echo "$OUT" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0));
  if (d.status !== "pending") process.exit(1);
  if (!d.authorize_url.includes("acme.bamboohr.com/authorize.php")) process.exit(1);
  if (d.redirect_uri !== "http://localhost:19876/callback") process.exit(1);
' || fail "login-oauth-start default output"
[ -f "$HOME/.bamboohr-cli/oauth-pending.json" ] || fail "pending file not written"
pass "login-oauth-start (default redirect URI)"

OUT=$(node "$CLI" login-oauth-start --domain acme --client-id id --client-secret sec \
      --redirect-uri https://hr-login.example.com/callback)
echo "$OUT" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0));
  if (d.redirect_uri !== "https://hr-login.example.com/callback") process.exit(1);
  if (!d.authorize_url.includes(encodeURIComponent("https://hr-login.example.com/callback"))) process.exit(1);
' || fail "custom redirect URI not honored"
node -e '
  const p = JSON.parse(require("fs").readFileSync(process.env.HOME + "/.bamboohr-cli/oauth-pending.json"));
  if (p.redirectUri !== "https://hr-login.example.com/callback") process.exit(1);
' || fail "redirectUri not persisted in pending file"
pass "login-oauth-start (custom redirect URI)"

if node "$CLI" login-oauth-complete \
     --redirect-url 'https://hr-login.example.com/callback?code=x&state=WRONG' 2>/dev/null; then
  fail "state mismatch was accepted"
fi
pass "state mismatch rejected"

if node "$CLI" login-oauth-start --domain acme --client-id id --client-secret sec \
     --redirect-uri 'javascript:alert(1)' 2>/dev/null; then
  fail "non-http redirect URI was accepted"
fi
pass "non-http redirect URI rejected"

export BAMBOOHR_CONFIG_DIR="$HOME/workspace/.bamboohr"
node "$CLI" login-oauth-start --domain acme --client-id id --client-secret sec >/dev/null
[ -f "$BAMBOOHR_CONFIG_DIR/oauth-pending.json" ] || fail "BAMBOOHR_CONFIG_DIR not used"
[ "$(cat "$BAMBOOHR_CONFIG_DIR/.gitignore")" = "*" ] || fail "config dir .gitignore missing or wrong"
pass "BAMBOOHR_CONFIG_DIR + self-gitignore"

echo "All smoke tests passed."

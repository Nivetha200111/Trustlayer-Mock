#!/usr/bin/env bash
# Smoke test for the Fisher mock integrations.
# Usage: test/smoke.sh <BASE_URL> [API_KEY]
#   e.g. test/smoke.sh http://localhost:3000 "$MOCK_API_KEY"

set -u

BASE_URL="${1:?Usage: $0 <BASE_URL> [API_KEY]}"
BASE_URL="${BASE_URL%/}"
API_KEY="${2:-}"

command -v curl >/dev/null || { echo "curl is required"; exit 2; }
command -v jq >/dev/null || { echo "jq is required"; exit 2; }

FAILURES=0
STATUS=""
BODY=""

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; echo "      status=$STATUS body=$BODY"; FAILURES=$((FAILURES + 1)); }
check() { if [ "$2" = "true" ]; then pass "$1"; else fail "$1"; fi; }

# request METHOD PATH [JSON] [--no-key] -> sets STATUS and BODY
request() {
  local method="$1" path="$2" data="${3:-}" no_key="${4:-}"
  local args=(-s -o - -w '\n%{http_code}' -X "$method" -H 'Content-Type: application/json')
  if [ -n "$API_KEY" ] && [ "$no_key" != "--no-key" ]; then args+=(-H "x-api-key: $API_KEY"); fi
  if [ -n "$data" ]; then args+=(--data "$data"); fi
  local out
  out="$(curl "${args[@]}" "$BASE_URL$path" | tr -d '\r')"
  STATUS="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}

# jqt FILTER -> "true" if the filter yields true on BODY
jqt() { echo "$BODY" | jq -e "$1" >/dev/null 2>&1 && echo true || echo false; }

coi() { request POST /api/trustlayer/coi-check "{\"vendor_name\":\"$1\",\"project_code\":\"85117\",\"reference\":\"CMR0001001\"}"; }

echo "Smoke testing $BASE_URL"

# 1. health
request GET /api/health "" --no-key
check "1. GET /api/health -> 200 ok" "$([ "$STATUS" = 200 ] && jqt '.status == "ok"' || echo false)"

# 2. missing key
if [ -n "$API_KEY" ]; then
  request POST /api/trustlayer/coi-check '{"vendor_name":"Acme Test Co"}' --no-key
  check "2. coi-check without x-api-key -> 401" "$([ "$STATUS" = 401 ] && jqt '.error == "Invalid API key"' || echo false)"
else
  echo "SKIP  2. no API_KEY given, auth check skipped"
fi

# 3. wrong method
request GET /api/trustlayer/coi-check
check "3. GET /api/trustlayer/coi-check -> 405" "$([ "$STATUS" = 405 ] && jqt '.error == "Use POST"' || echo false)"

# 4. missing vendor_name
request POST /api/trustlayer/coi-check '{"project_code":"85117"}'
check "4. coi-check without vendor_name -> 400" "$([ "$STATUS" = 400 ] && jqt '.error | test("vendor_name")' || echo false)"

# 5. Red Mesa -> Deficient
coi "Red Mesa Equipment Services LLC"
check "5. Red Mesa -> Deficient, compliant=false, 3 gaps" \
  "$([ "$STATUS" = 200 ] && jqt '.status == "Deficient" and .compliant == false and (.gaps | length) == 3' || echo false)"

# 6. other profiles
coi "Ironpeak Site Services"
check "6a. Ironpeak -> Expired" "$([ "$STATUS" = 200 ] && jqt '.status == "Expired" and .compliant == false' || echo false)"
coi "canyon haul logistics"
check "6b. Canyon Haul (case-insensitive) -> Missing, certificate null" \
  "$([ "$STATUS" = 200 ] && jqt '.status == "Missing" and .certificate == null' || echo false)"
coi "Acme Test Co"
check "6c. Acme Test Co -> Compliant, no gaps" \
  "$([ "$STATUS" = 200 ] && jqt '.status == "Compliant" and .compliant == true and (.gaps | length) == 0' || echo false)"

# 7. ecms missing amount
request POST /api/ecms/subcontracts '{"contract_number":"CNT0010042","vendor_name":"Red Mesa Equipment Services LLC","project_code":"85117"}'
check "7. ecms without amount -> 400" "$([ "$STATUS" = 400 ] && jqt '.error | test("amount")' || echo false)"

# 8. ecms idempotency
ECMS_BODY='{"contract_number":"CNT0010042","vendor_name":"Red Mesa Equipment Services LLC","project_code":"85117","amount":184500,"start_date":"2026-10-01","end_date":"2027-03-31"}'
request POST /api/ecms/subcontracts "$ECMS_BODY"
FIRST_STATUS="$STATUS"
FIRST_NO="$(echo "$BODY" | jq -r '.subcontract_no // empty' 2>/dev/null | tr -d '\r')"
request POST /api/ecms/subcontracts "$ECMS_BODY"
SECOND_NO="$(echo "$BODY" | jq -r '.subcontract_no // empty' 2>/dev/null | tr -d '\r')"
check "8. ecms same contract twice -> same subcontract_no ($FIRST_NO), format SC-85117-###" \
  "$([ "$FIRST_STATUS" = 201 ] && [ "$STATUS" = 201 ] && [ -n "$FIRST_NO" ] && [ "$FIRST_NO" = "$SECOND_NO" ] \
     && [[ "$FIRST_NO" =~ ^SC-85117-[0-9]{3}$ ]] && echo true || echo false)"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "All checks passed."
else
  echo "$FAILURES check(s) failed."
  exit 1
fi

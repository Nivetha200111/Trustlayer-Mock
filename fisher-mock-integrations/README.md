# fisher-mock-integrations

Stand-in APIs for a **ServiceNow demo** for Fisher Industries. These are **mocks**, not the real
**TrustLayer** (certificate-of-insurance verification) or **eCMS / Computer Guidance** (ERP) APIs.
They return deterministic, canned data so that ServiceNow Flow Designer can make real outbound REST
calls during the demo. The request and response shapes are meant to stay stable, so that the
connection alias can later be pointed at the real systems.

- Vercel serverless functions, plain Node.js (CommonJS), no dependencies, no database.
- Every response is JSON. Expected errors return 4xx and never 5xx, because ServiceNow's ADC masks 5xx bodies.

## Base URL

```
https://fisher-mock-integrations.vercel.app
```

## Auth

When the `MOCK_API_KEY` environment variable is set (it is in production), every endpoint except
`/api/health` requires this header:

```
x-api-key: <MOCK_API_KEY>
```

A missing or wrong key returns `401 {"error":"Invalid API key"}`. A method other than POST returns
`405 {"error":"Use POST"}`.

## Endpoints

### GET /api/health

No auth required.

```bash
curl https://fisher-mock-integrations.vercel.app/api/health
```

```json
{ "status": "ok", "services": ["trustlayer/coi-check", "ecms/subcontracts"], "time": "2026-09-25T12:00:00.000Z" }
```

### POST /api/trustlayer/coi-check

| Field | Type | Required |
|---|---|---|
| `vendor_name` | string | yes (400 if missing) |
| `project_code` | string | no |
| `reference` | string | no (for example, the CMR number) |

```bash
curl -X POST https://fisher-mock-integrations.vercel.app/api/trustlayer/coi-check \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MOCK_API_KEY" \
  -d '{"vendor_name":"Red Mesa Equipment Services LLC","project_code":"85117","reference":"CMR0001001"}'
```

```json
{
  "service": "COI verification (TrustLayer mock)",
  "vendor_name": "Red Mesa Equipment Services LLC",
  "project_code": "85117",
  "reference": "CMR0001001",
  "status": "Deficient",
  "compliant": false,
  "requirements": {
    "general_liability_per_occurrence": 1000000,
    "auto_liability": 1000000,
    "workers_comp": "Statutory",
    "additional_insured": "Fisher Industries"
  },
  "certificate": {
    "carrier": "Sonoran Casualty Co.",
    "policy_number": "GL-RM-10392",
    "general_liability_per_occurrence": 250000,
    "auto_liability": 0,
    "workers_comp": "Statutory",
    "additional_insured": false,
    "expiration_date": "2027-03-31"
  },
  "gaps": [
    "General liability 250,000 below required 1,000,000",
    "No automobile liability",
    "Fisher Industries not named as additional insured"
  ],
  "checked_at": "2026-09-25T12:00:00.000Z"
}
```

`compliant` is `true` only when `status` is `"Compliant"`. `certificate` is `null` when the status is `"Missing"`.

#### Vendor → status (the `vendor_name` match ignores case)

| vendor_name | status | Carrier / policy | GL | Auto | WC | Add'l insured | Expires | gaps |
|---|---|---|---|---|---|---|---|---|
| Ironpeak Site Services | **Expired** | Desert Mutual Insurance / GL-IP-44821 | 1,000,000 | 1,000,000 | Statutory | yes | 2026-08-31 | Certificate expired on 2026-08-31 |
| Canyon Haul Logistics | **Missing** | — (`certificate: null`) | — | — | — | — | — | No certificate of insurance on file |
| Red Mesa Equipment Services LLC | **Deficient** | Sonoran Casualty Co. / GL-RM-10392 | 250,000 | 0 | Statutory | no | 2027-03-31 | GL below required; No automobile liability; Fisher not additional insured |
| *anything else* | **Compliant** | Southwest General Insurance / GL-STD-00001 | 2,000,000 | 1,000,000 | Statutory | yes | 2027-12-31 | *(none)* |

### POST /api/ecms/subcontracts

| Field | Type | Required |
|---|---|---|
| `contract_number` | string | yes |
| `vendor_name` | string | yes |
| `project_code` | string | yes (becomes the eCMS `job`) |
| `amount` | number | yes (a numeric string such as `"184500"` is also accepted) |
| `cost_code` | string | no (default `710.15`) |
| `start_date` | string (YYYY-MM-DD) | no |
| `end_date` | string (YYYY-MM-DD) | no |

Missing required fields return `400 {"error":"Missing fields: a, b"}`.

The endpoint is **idempotent**: the same `contract_number` always yields the same `subcontract_no`,
in the format `SC-<project_code>-<3 digits>`. The digits come from a deterministic hash of
`contract_number`.

```bash
curl -X POST https://fisher-mock-integrations.vercel.app/api/ecms/subcontracts \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MOCK_API_KEY" \
  -d '{"contract_number":"CNT0010042","vendor_name":"Red Mesa Equipment Services LLC","project_code":"85117","amount":184500,"start_date":"2026-10-01","end_date":"2027-03-31"}'
```

```json
{
  "service": "eCMS subcontract (mock)",
  "subcontract_no": "SC-85117-299",
  "status": "Created",
  "job": "85117",
  "cost_code": "710.15",
  "vendor_name": "Red Mesa Equipment Services LLC",
  "amount": 184500,
  "start_date": "2026-10-01",
  "end_date": "2027-03-31",
  "source_contract": "CNT0010042",
  "created_at": "2026-09-25T12:00:00.000Z"
}
```

## Local development and tests

```bash
npx vercel dev                                   # serves on http://localhost:3000
bash test/smoke.sh http://localhost:3000 "$MOCK_API_KEY"
bash test/smoke.sh https://fisher-mock-integrations.vercel.app "$MOCK_API_KEY"
```

`test/smoke.sh <BASE_URL> [API_KEY]` needs `bash`, `curl` and `jq`. It prints PASS/FAIL for each
check and exits non-zero if any check fails. Without an API key it skips the 401 check.

## ServiceNow setup

### 1. Connection & Credential alias

1. **Connections & Credentials → Connection & Credential Aliases → New**: Name `Fisher Mock Integrations`, Type `Connection and Credential`, Connection type `HTTP`.
2. **Credential**: create an **API Key Credentials** record holding the `MOCK_API_KEY` value, and attach it to the alias.
3. **Connection**: create an **HTTP(s) Connection** on the alias. Set Connection URL = `https://fisher-mock-integrations.vercel.app`, and set the credential to the API key credential.
4. Send the key as a header. On the credential/connection, set the API key to be sent in the **Header** with the name `x-api-key`. If your release doesn't expose that option, add a header on each REST step instead: `x-api-key` = the credential value.

When you move to the real TrustLayer or eCMS, change only the connection URL and credential. Keep the flows as they are.

### 2. TrustLayer flow: COI check on a contract request

- **Trigger**: Record Updated on **Contract Management Request** (`sn_cm_core_contract_request`), condition *State changes to Work in progress*.
- **Action** (custom action with a **REST** step):
  - Connection: use the `Fisher Mock Integrations` alias.
  - Resource path `/api/trustlayer/coi-check`, method **POST**, header `Content-Type: application/json`.
  - Body:
    ```json
    { "vendor_name": "${vendor_name}", "project_code": "${project_code}", "reference": "${cmr_number}" }
    ```
    Map these from the trigger record: vendor name, project code, and the CMR **Number**.
  - Parse the response body (JSON Parser step, or a script step with `JSON.parse`), and output `status`, `compliant` and `gaps`.
- **Update Record** on the CMR: add a work note such as
  `TrustLayer COI check: <status>. Gaps: <gaps joined with "; " or "none">`.
- **If** `compliant` is `false`, flag the request: for example, set a flag or priority field, add a
  "COI non-compliant" work note or tag, and/or create a task for the vendor manager.

### 3. eCMS flow: push a subcontract

- **Trigger**: Record Created on **Contract repository** (`sn_lg_cnt_repository`).
- **Action** (custom action with a **REST** step):
  - Same alias. Resource path `/api/ecms/subcontracts`, method **POST**, header `Content-Type: application/json`.
  - Body:
    ```json
    {
      "contract_number": "${number}", "vendor_name": "${vendor_name}", "project_code": "${project_code}",
      "amount": ${amount}, "cost_code": "${cost_code}", "start_date": "${start_date}", "end_date": "${end_date}"
    }
    ```
  - Parse the response, and output `subcontract_no`.
- **Update Record** on the contract: add the work note `Pushed to eCMS: <subcontract_no>`.

Retries are safe. Resending the same contract returns the same `subcontract_no`.

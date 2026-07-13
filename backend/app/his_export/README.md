# Outbound HIS Export (Hospital Information System)

Sends finalized reports (surgical / gyne cytology / non-gyne cytology) back out to an
external HIS once a case is signed out — the opposite direction of `app/his_adapters/`
(which pulls patient data *in*). This is a completely separate integration with its own
env vars, its own pluggable adapters, and its own outbox/delivery-log table — the two
directions don't share config or code, only the same "adapter pattern, selected by an
env var" shape.

## Architecture

```
[Case reaches PUBLISHED / SIGNED_OUT]   (6 exact CRUD-layer call sites — see below)
        │  cheap synchronous DB insert, same transaction, no network I/O
        ▼
  his_export_logs (status=pending)
        │
        ▼  polled by an in-process asyncio loop (SELECT ... FOR UPDATE SKIP LOCKED)
  HisExportAdapterBase.send(payload)   ← selected by HIS_EXPORT_TYPE
        │
   ┌────┼──────────────┬───────────────────────┐
   ▼    ▼               ▼                        ▼
 none  generic_webhook  custom (escape hatch)   [not built: hl7v2_mllp, fhir_rest]
```

There is **no separate worker process/container** — the poll loop runs inside the
existing `backend` service via a FastAPI `lifespan` hook (`worker.py`'s
`export_worker_lifespan`, wired in `main.py`). This project has no background-job infra
(no Celery/APScheduler/Redis) and this feature doesn't add any — see CLAUDE.md.

## Configuration (.env)

```env
# Select the adapter: none (default, disabled) | generic_webhook | custom
HIS_EXPORT_TYPE=none

# Attach the rendered report PDF (base64) alongside structured fields.
# Off by default — PDF rendering is the most expensive step per delivery.
HIS_EXPORT_INCLUDE_PDF=false

# Worker tuning
HIS_EXPORT_POLL_INTERVAL_SECONDS=15
HIS_EXPORT_BATCH_SIZE=10
HIS_EXPORT_MAX_ATTEMPTS=8
HIS_EXPORT_BACKOFF_BASE_SECONDS=60
HIS_EXPORT_BACKOFF_MAX_SECONDS=3600
HIS_EXPORT_STALE_PROCESSING_SECONDS=300

# generic_webhook only:
HIS_EXPORT_WEBHOOK_URL=
HIS_EXPORT_WEBHOOK_AUTH_HEADER=Authorization
HIS_EXPORT_WEBHOOK_AUTH_TOKEN=
HIS_EXPORT_WEBHOOK_TIMEOUT_SECONDS=15
```

`HIS_EXPORT_TYPE=none` (the default) means the app behaves exactly as it does without
this feature at all — no rows are ever enqueued, nothing is sent anywhere.

## Supported Adapters

### 1. None (`HIS_EXPORT_TYPE=none`, default)

No-op. `enqueue()` (`app/crud/his_export_log.py`) short-circuits before even inserting a
row when this is selected, so there's nothing for the worker to pick up.

### 2. Generic Webhook (`HIS_EXPORT_TYPE=generic_webhook`)

POSTs the export payload as JSON to a single configured URL
(`app/his_export/generic_webhook.py`). This is the simplest, most universally-compatible
option: nearly every interface engine (Mirth Connect, Rhapsody, or a hospital's own
script) can accept a plain HTTP POST, so integrating requires no HL7/FHIR knowledge on
either side.

**Important**: unlike the Slack/LINE notification webhooks elsewhere in this codebase,
`HIS_EXPORT_WEBHOOK_URL` has **no SSRF/public-IP guard**. That's deliberate — this URL is
an env-var set by whoever deploys the server (the same trust tier as `HIS_DATABASE_URL`),
not a value any authenticated application user can influence via an API, and the expected
target for a LAN-only deployment (see CLAUDE.md) is usually an on-LAN interface engine —
plain `http://` and a private IP are both completely normal here.

### 3. Custom (`HIS_EXPORT_TYPE=custom`)

Escape hatch for hospital-specific logic that doesn't fit a plain webhook (e.g. calling a
vendor SDK, SOAP, or something needing real HL7v2/MLLP framing). `send()` in
`app/his_export/custom_adapter.py` raises `NotImplementedError` out of the box — edit
that file directly for a private/single-hospital deployment.

If you're building something reusable that other hospitals could use, prefer copying
`custom_adapter.py` to a new named file (e.g. `hl7v2_mllp.py`) and adding a branch in
`get_his_export_adapter()` (`app/his_export/__init__.py`) instead of overwriting
`custom_adapter.py` in place — same pattern `app/his_adapters/hosxp.py` / `ssb.py` follow
for inbound.

### Not built yet: HL7v2/MLLP, FHIR

No real spec was available when this was built (every hospital's interface engine wants
something slightly different), so these are a documented extension point rather than a
guess dressed up as an implementation. Adding one requires **zero changes** to the base
class, the outbox table, the trigger points, or the worker — only:

1. A new adapter file implementing `HisExportAdapterBase.send(payload) -> DeliveryResult`
   (using an MLLP socket / FHIR-aware HTTP client internally instead of plain `httpx`).
2. One new `elif` branch in `get_his_export_adapter()`.
3. Adapter-specific env vars, read inside that adapter's own file (mirroring
   `generic_webhook.py`'s pattern) — segment/resource field mapping is real new work at
   that point, deliberately out of scope here.

## Trigger points

Enqueuing happens at the **CRUD layer**, at the exact 6 places each report's status
flips to its terminal `PUBLISHED`/`SIGNED_OUT` value — not at the router layer, and not by
mirroring `notification_service.notify_signed_out()` (that hook fires unconditionally
regardless of whether a case actually reached a terminal state, and is missing from
several real terminal points — see its docstring and CLAUDE.md before copying its shape
for anything else):

| # | Function | File | Domain |
|---|---|---|---|
| 1 | `finalize_and_snapshot_orchestrator` (direct-publish branch) | `app/crud/surgical_report.py` | Surgical |
| 2 | `process_report_approval` (APPROVE) | `app/crud/report_crud.py` | Surgical |
| 3 | `publish_gyne_report` (direct-publish branch) | `app/crud/gyne_cyto_report.py` | Gyne |
| 4 | `complete_gyne_review` (agree branch) | `app/crud/gyne_cyto_report.py` | Gyne |
| 5 | `publish_nongyne_report` (direct-publish branch, `enable_non_gyne_approve_system` off) | `app/crud/nongyne_cyto_report.py` | Non-gyne |
| 6 | `process_nongyne_report_approval` (APPROVE) | `app/crud/nongyne_cyto_report.py` | Non-gyne |

Non-gyne now mirrors Surgical: `publish_nongyne_report()` only routes to
`pending_approval` (leaving #6 as the terminal point) when
`enable_non_gyne_approve_system` is on. When it's off, publish itself is site #5 —
the terminal `PUBLISHED` transition — and enqueues immediately.

Sites #4 and #6 enqueue *after* each domain's `signers_snapshot` sync, not immediately
after the status flip — hooking in earlier would export a payload where the signer who
just signed still shows `signed_at: null`. See `test_his_export_trigger_wiring.py` for
the regression tests.

## Idempotency & retry semantics

One row = one export "episode." Automatic retries update the *same* row (increment
`attempt_count`, overwrite `error_message`, push `next_attempt_at` out on a backoff
schedule). A manual retry (admin "Retry" button / `POST /his-export-logs/{id}/retry`)
inserts a **new** row instead, leaving the old terminal row untouched — so the full
history of attempts across episodes is visible in the log, not just the latest state.

A Postgres partial unique index (`resource_type, resource_id` WHERE `status IN
('pending','processing')`) guarantees at most one row is ever *actively* in flight per
report — enforced at the DB level, not just in application code, so a duplicated/retried
HTTP request hitting the same finalize/approval endpoint twice can't create two
in-flight export attempts for the same report.

## API Endpoints (admin-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/his-export-logs` | List/filter export log entries (`status`, `resource_type`, `accession_no`) |
| GET | `/his-export-logs/{id}` | Get one entry |
| POST | `/his-export-logs/{id}/retry` | Manually retry a terminal (sent/dead_letter/cancelled) entry |

Frontend: `frontend/src/pages/Admin/HisExportLogPage.tsx`, under IT Administration in the
sidebar.

## File Structure

```
app/
├── his_export/
│   ├── __init__.py        # Base class + factory + shared env vars
│   ├── worker.py           # asyncio poll loop + FastAPI lifespan hook
│   ├── none_adapter.py
│   ├── generic_webhook.py
│   ├── custom_adapter.py  # Escape hatch — edit directly, or copy to a new named adapter
│   └── README.md          # This file
├── crud/
│   └── his_export_log.py  # enqueue / claim_batch / record_attempt_result / retry / list
├── models/
│   └── his_export_log.py
├── routers/
│   └── his_export_log.py
└── schemas/
    └── his_export.py
```

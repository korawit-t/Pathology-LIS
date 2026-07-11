# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` | ✅ |
| Older commits | ❌ — always run the latest revision |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use [GitHub Security Advisories](../../security/advisories/new) to report privately. This keeps the disclosure confidential until a fix is available.

Please include:
- Description of the vulnerability and affected component
- Steps to reproduce (curl commands, screenshots, or a minimal test case)
- Potential impact (data exposure, auth bypass, etc.)
- Suggested fix or patch, if you have one

**Response timeline:**
- Acknowledgement within **72 hours**
- Triage and severity assessment within **7 days**
- Fix or mitigation plan for Critical/High issues within **14 days**

Once a fix is released we will publish a GitHub Security Advisory and credit the reporter (unless anonymity is requested).

---

## Scope

**In scope:**
- Authentication or authorization bypass
- PHI (patient data) exposure via API endpoints
- SQL injection, XSS, CSRF, path traversal
- JWT / session token vulnerabilities
- Insecure direct object references (accessing another patient's records)
- Privilege escalation between roles

**Out of scope:**
- Deployment configuration issues (TLS, CORS, firewall) — these are the deployer's responsibility; see [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md)
- Denial-of-service attacks
- Vulnerabilities in HOSxP / HIS third-party systems
- Issues only reproducible on unsupported or modified versions
- Social engineering of hospital staff

---

## Medical Software Disclaimer

This software is **not a certified medical device** and has not been approved by any medical regulatory authority. Deploying institutions are solely responsible for:

- Regulatory compliance (Thailand PDPA, HIPAA, or applicable local law)
- Completing the [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) before production use
- Ensuring all pathology reports are reviewed and signed by a qualified pathologist

See [TERMS_OF_USE.md](./TERMS_OF_USE.md) for the full liability disclaimer.

---

## Changelog

### 2026-07-11

Proactive multi-class review (SSRF / stored XSS / audit-integrity) ahead of the public release, looking beyond the §2 role-gate findings:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| Medium | SSRF | `backend/app/services/notification_service.py` | The Slack sender POSTed to a `webhook_url` read verbatim from a channel's `credentials` — and notification-channel credentials are writable by any authenticated user, so a user could point `webhook_url` at internal infra (LAN services, or `169.254.169.254` cloud-metadata on a PaaS) and fire it via the "send test" endpoint. Added `_assert_public_https_url()` (require https + reject any host resolving to a loopback / private / link-local / reserved IP) and applied it in both the async (`send_slack_message`) and sync fire-and-forget (`_send_slack_sync`) paths. LINE uses a hardcoded `api.line.me` host and was never affected. |
| Medium | Stored XSS | `frontend/src/pages/Pathologist/SurgicalDiagnosisReportForm/components/IHCResultPanel.tsx`, `frontend/src/pages/NongyneCytoDiagnosis/components/NongyneIHCResultPanel.tsx` | `buildPreviewHtml` built the report-preview markup by raw string-interpolating user-entered IHC fields (`<li>${marker}: ${value}</li>`, `<p>${prefix}</p>`) and injected the result via `dangerouslySetInnerHTML`, bypassing the `sanitizeHtml()` (DOMPurify) helper every other such usage in the app routes through. Wrapped both call sites in `sanitizeHtml(...)`, so a marker/value/prefix containing HTML can no longer render as live markup. |
| Low | Audit Falsification | `backend/app/routers/block_storage.py`, `slide_storage.py`, `sectioning.py` | The block/slide-storage and sectioning batch-create endpoints recorded the acting user from the client-supplied `payload.user_id` instead of the JWT, letting an authenticated user attribute a storage/sectioning action to someone else. Each now sets `payload.user_id = current_user.id` before the crud call — the same fix already applied to `stain_run.py`/`embedding.py`/`tissue_processing.py`/`surgical_block_stain.py`; the `dispose_*` routes in these same routers already derived it correctly. |

Regression tests added: `tests/test_ssrf_guard.py` (8 refuse cases incl. cloud-metadata + IPv6 loopback, 1 public-allow). The affected notification/storage/sectioning suites still pass.

### 2026-07-09

Continuation of the 2026-07-07 OWASP #1 pass — `surgical_diagnosis.py` was the one PHI-read router that pass missed, found while adding systematic code-security tooling ahead of open-sourcing:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| High | Authorization Bypass | `backend/app/routers/surgical_diagnosis.py` | `DELETE /case/{case_id}/case-level-draft` had no dependency at all (and `main.py` adds no global auth) — an unauthenticated caller could delete a case's case-level draft diagnosis by iterating `case_id`. Added `CAN_WRITE_REPORT`, matching the write/delete gate on every sibling route. |
| Medium | Insecure Direct Object Reference | `backend/app/routers/surgical_diagnosis.py` | The three `CAN_READ_REPORT`-gated GET endpoints (`/specimen/{id}`, `/case/{case_id}`, `/patient/{patient_id}`) fetched diagnoses with no hospital check — an external `clinician`/`hospital` account could read another hospital's surgical diagnoses by incrementing ids. Added `assert_hospital_scoped_access(current_user, case.hospital_id)` to the specimen/case routes (resolving the case via the specimen for the former); the patient-history route filters results to the caller's hospitals via a new `hospital_ids` param on `get_diagnoses_by_patient` (mirroring the `get_cases` pattern from 2026-07-07). |

Regression tests added to `test_hospital_scoping_router.py` (10 new tests across 2 classes — `TestSurgicalDiagnosisCaseLevelDraftDeleteGate`, `TestSurgicalDiagnosisHospitalScoping` — reusing the file's `_make_clinician_at_hospital` helper). Both gaps were confirmed accidental (gyne/nongyne diagnosis routers are write-role-gated and never exposed; the frontend calls these endpoints only from `ProtectedRoute` pages) — defense-in-depth, no user-facing change.

### 2026-07-07

Found while writing HTTP-level test coverage for all backend routers (a broader audit than a targeted security review, but it surfaced the same bug class as the 2026-07-05 findings below):

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| Critical | Authorization Bypass / PHI Exposure | `backend/app/routers/legacy_reports.py` | Every endpoint (unified search across all case types, and per-type list/get/pdf/mark-read for surgical/gyne/nongyne) had no auth dependency at all — reachable by anyone with no login, exposing historical patient report data (name, HN, diagnosis-adjacent fields). Added `CAN_READ_REPORT`/`CAN_READ_GYNE_CYTO_REPORT`/`CAN_READ_NONGYNE_CYTO_REPORT` per case-type group, matching each type's live-report router; mark-read routes got `get_current_user` only, matching how the live-report routers' own mark-read is intentionally looser than their read-gate. The one endpoint commented "Public unified search (for ResultPage / HospitalResultPage)" turned out to have zero callers in the frontend — dead code, not an intentional public feature; both pages are already behind `ProtectedRoute`. |
| High | Authorization Bypass | `backend/app/routers/surgical_report.py` | `preview_report_pdf`/`preview_report_data_api` had no dependency at all, unlike every other route in the file (including the "final" PDF endpoint two lines below) — added `CAN_READ_REPORT` to match. |
| Medium | Authorization Bypass | `backend/app/routers/gyne_cyto_stain.py`, `nongyne_cyto_stain.py` | Most endpoints (queues, create, update, run listing) had no auth dependency; only the batch-run/print-stickers endpoints did (one inline-commented "👈 ถ้ามีระบบ Auth" / "if there's an auth system", suggesting ad hoc application rather than deliberate design). Added router-level `get_current_user` to close the gap uniformly. |
| Medium | Authorization Bypass | `backend/app/routers/stain_run.py` | `list_runs`/`get_run`/`update_status` had no auth dependency; only `create_run` did. Added router-level `get_current_user`. |
| Medium | Authorization Bypass | `backend/app/routers/slide_dispatch.py` | `read_dispatches` had no auth dependency, unlike its 3 siblings in the same file. Added router-level `get_current_user`. |

Follow-up same day, prompted by a direct OWASP Top 10 #1 review request: the fixes above (and the 2026-07-05 role-gate fixes) confirmed each endpoint requires *a* valid role, but didn't check whether an external-facing account (`clinician`/`hospital`, scoped to specific hospitals via `User.hospitals`) was reading a resource *outside* their assigned hospitals — an IDOR gap distinct from missing auth. `app/dependencies/auth.py`'s `assert_hospital_scoped_access`/`get_scoped_hospital_ids` (already used correctly by `storage.py`, the request-files/consult-pdf endpoints, and the `/archive`/`/search-public`/`/hospital-cases` endpoints per 2026-07-05) had never been applied to the *primary* read paths:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| Medium | Insecure Direct Object Reference | `backend/app/routers/surgical_report.py`, `gyne_cyto_report.py`, `nongyne_cyto_report.py` | The report-by-id, report-pdf, and report-history (by case_id) endpoints in all three files fetched and returned/streamed the resource with no hospital check — an external account could read any hospital's report snapshot by incrementing the id. Added `assert_hospital_scoped_access(current_user, report.hospital_id)` (or the case's, for the by-case_id history routes) right after the existing not-found check, mirroring the exact pattern already used on `surgical_case.py`'s request-files endpoints. |
| Medium | Insecure Direct Object Reference | `backend/app/routers/legacy_reports.py` | Same gap on all 6 `get_legacy_*`/`get_legacy_*_pdf` routes, using each legacy model's own `hospital_id` snapshot column. |
| Medium | Insecure Direct Object Reference | `backend/app/routers/surgical_case.py`, `gyne_cyto_case.py`, `nongyne_cyto_case.py` | Two gaps per file: (1) the main case-detail `GET /{case_id}` had no hospital check at all (only `gyne`/`nongyne` even had a role check beyond login); (2) the case-list endpoints' `hospital_id` query param was an unrestricted client-supplied filter, never intersected with the caller's own assigned hospitals — omitting it returned every hospital's cases, and supplying one just filtered to whatever the caller chose. Fixed the detail endpoints the same way as the report routers; fixed the list endpoints by resolving `get_scoped_hospital_ids` and either 403ing on an out-of-scope explicit `hospital_id`, or restricting the query to the caller's allowed set via a new `hospital_ids: list` param added to `get_cases`/`get_gyne_cases`/`get_nongyne_cases` (mirroring the naming already used by `search_public_cases_with_latest_report` in the same crud module) when no explicit `hospital_id` was given. |
| Medium | Authorization Bypass | `backend/app/routers/surgical_specimen.py` | `set_additional_sections` had no role gate at all beyond login, unlike every sibling route in the file (`CAN_GROSS`) — added the same `CAN_GROSS` dependency, which already excludes `clinician`/`hospital`, closing the gap without needing new hospital-scoping code in this file. |

Regression tests added to the existing `test_hospital_scoping_router.py` (25 new tests across 7 new classes, reusing its established `_make_clinician_at_hospital(s)` helper).

All five were confirmed as accidental gaps, not intentional public-access design, before fixing: every consuming frontend page is already gated behind `ProtectedRoute`/login, so this is pure defense-in-depth with no user-facing behavior change. Regression tests updated in `test_legacy_reports_router.py`, `test_surgical_report_router.py`, `test_gyne_cyto_stain_router.py`, `test_nongyne_cyto_stain_router.py`, `test_stain_run_router.py`, `test_slide_dispatch_router.py`.

### 2026-07-06

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| High | Broken Session Management / Token Exposure | `backend/app/routers/auth.py`, `frontend/src/services/httpClient.tsx`, `frontend/src/contexts/AuthContext.tsx` | `/auth/login` and `/auth/refresh` already set the access and refresh tokens as `httponly` cookies, but also returned both tokens in the JSON response body — the frontend read that body and persisted the refresh token to `localStorage` (and kept the access token in a JS-readable variable), so a single XSS anywhere in the SPA could exfiltrate the refresh token. Both endpoints now omit the token fields from the response body entirely; the frontend no longer reads or stores any token in JS and relies solely on the httpOnly cookies (sent automatically via `withCredentials`) for both the initial request and the silent-refresh-on-401 flow. Also removed the now-unused `RefreshRequest` body fallback on `/auth/refresh` and consolidated three divergent client-side logout code paths (including one that called `localStorage.clear()` without ever hitting the logout endpoint) into a single shared cleanup path. |
| Medium | Broken Authentication | `backend/app/routers/users.py`, `backend/app/schemas/user.py` | `PUT /users/me/password` accepted a new password from any authenticated caller with no rate limit and no verification of the account's current password — a hijacked session could silently take over the account. `PasswordUpdate` now requires `current_password`, verified against the caller's hash before the change is applied, and the endpoint is rate-limited (5/minute) like `/auth/login`. |
| Low | Path Traversal | `backend/app/routers/system_setting.py` | `PATCH /system-settings/report-templates` only checked `.exists()` on the raw joined path, so a `../` sequence resolving to any real file elsewhere on disk would be accepted and persisted as the "active" template reference (not directly exploitable for file read through this endpoint alone, but inconsistent with its `preview` sibling). Added the same `.resolve().is_relative_to(TEMPLATES_DIR)` containment check and report-type prefix check the preview endpoint already has. |

### 2026-07-05

Fixed the three Critical findings from `SECURITY_CHECKLIST.md`'s "Known Open Findings" audit:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| Critical | Authorization Bypass | `backend/app/routers/gyne_cyto_case.py`, `nongyne_cyto_case.py` | `GET`/`PATCH`/`DELETE /{case_id}` had no auth dependency at all — added `Depends(get_current_user)` so an unauthenticated request can no longer read, edit, or delete any cytology case. |
| Critical | Path Traversal / Unauthenticated File Read | `backend/app/routers/wsi_viewer.py` | `/wsi/info`, `/thumbnail`, `/dzi-info`, `/dzi-tile/...` had no auth dependency and no path containment check. Added `Depends(CAN_VIEW_WSI)` to all four, and `_open_slide()` now resolves the requested path and rejects anything outside the configured `WsiSetting.wsi_root_path`, mirroring `storage.py`. |
| Critical | Audit Falsification / Authorization Bypass | `backend/app/routers/surgical_diagnosis.py`, `crud/surgical_report.py` | `POST /{case_id}/finalize` was missing the `CAN_WRITE_REPORT` role gate every other write route in the file has, and trusted a client-supplied `signed_by_id` — allowing any authenticated user to sign a case out as a different pathologist. `finalize_and_snapshot_orchestrator` now takes the signer's identity as an explicit server-derived parameter instead of reading it from the request body; both call sites (`surgical_report.py`, `surgical_diagnosis.py`) now pass `current_user.id`. Also fixed a latent bug found during the same change: the `/surgical-diagnoses/{case_id}/finalize` route referenced a nonexistent `crud.finalize_and_snapshot_orchestrator` (wrong module), so the endpoint always 400'd — corrected the import. |

Also fixed earlier the same day: `PUT /users/{user_id}` privilege escalation — a `lab_manager` could grant themselves or another user the `admin` role, because the guard checked the target's pre-update roles instead of the incoming requested roles (see `backend/app/routers/users.py`).

Fixed the four High findings from the same audit:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| High | Stored XSS | `frontend/src/pages/Pathologist/SurgicalDiagnosisReportForm/components/SurgicalDiagnosisEditor.tsx`, `frontend/src/pages/Report/IHCStatPage.tsx` | Unsanitized `dangerouslySetInnerHTML` rendering `gross_description`/`diagnosis` — both wrapped with the existing `sanitizeHtml()` (DOMPurify) helper already used elsewhere in the app. |
| High | Audit Falsification | `backend/app/routers/embedding.py`, `backend/app/routers/tissue_processing.py` | `POST /embedding/runs` and `PATCH /tissue-processing/{run_id}/status` accepted the acting user's ID from the request body (`payload.user_id`, `status_update.completed_by_id`). Both now derive it from `Depends(get_current_user)` and ignore the body field — same class of bug already fixed once in `stain_run.py`. |
| High | Broken Session Management | `backend/app/core/security.py`, `backend/app/routers/auth.py` | Refresh tokens carried no `jti` and were never revoked on rotation or logout, so a stolen refresh token stayed valid for its full 3-day TTL even after the legitimate user refreshed past it or logged out. `create_refresh_token` now returns `(token, jti, expires_at)`; `/auth/refresh` revokes the just-used token and rejects replay of an already-rotated one; `/auth/logout` now revokes the refresh token in addition to the access token. |
| High | Broken Authentication (timing oracle) | `backend/app/core/security.py`, `backend/app/routers/auth.py` | Login short-circuited (`if not user or not verify_password(...)`) so the slow Argon2 computation only ran when the username existed, making failed-login response time distinguish real vs. nonexistent usernames. `verify_password` now always runs against either the real hash or a fixed dummy hash, so both cases take the same time. |

Regression tests added: `tests/test_actor_identity_router.py`, `tests/test_security.py`, `tests/test_auth.py::TestRefreshRotationAndReuseDetection`.

Fixed two of the Medium findings from the same audit:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| Medium | Insecure Direct Object Reference | `backend/app/routers/surgical_case.py`, `gyne_cyto_case.py`, `nongyne_cyto_case.py` | The request-files and consult-pdf upload/download/delete endpoints had no role or ownership check beyond login, so an external-facing account (`clinician`/`hospital` role) could reach another hospital's files by ID — inconsistent with `storage.py`'s existing `_EXTERNAL_ROLES` check and with `search-public`/`hospital-cases`, which already scope those same roles to their own hospital. Internal lab staff (pathologist, admin, cytotechnologist, etc.) are *intentionally* not hospital-scoped, since one lab commonly serves multiple hospitals — that part of the design was correct and unchanged. The fix promotes `storage.py`'s `_EXTERNAL_ROLES` set to a shared `EXTERNAL_ROLES` constant plus an `assert_hospital_scoped_access()` helper in `app/dependencies/auth.py`, applied to all 18 request-files/consult-pdf endpoints across the three routers. |
| Medium | Authorization Bypass | `backend/app/routers/gyne_diagnosis.py`, `backend/app/routers/nongyne_diagnosis.py` | Diagnosis create/update/revise (and, for non-gyne, delete) only required login, with no role gate — unlike the surgical diagnosis equivalent, which gates every write route. Added `CAN_WRITE_GYNE_CYTO_REPORT`/`CAN_WRITE_NONGYNE_CYTO_REPORT` to create/update/revise, and `CAN_MANAGE_SETTINGS` to non-gyne's delete, matching the existing role-constant naming convention. |

Regression tests added: `tests/test_hospital_scoping_router.py`, `tests/test_diagnosis_role_gate_router.py`.

### 2026-06-10

Fixed four vulnerabilities identified during pre-release security review:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| High | Path Traversal | `backend/app/routers/system_setting.py` | Added `.resolve().is_relative_to()` check on template preview endpoint to prevent directory escape |
| High | Authorization Bypass | `backend/app/routers/surgical_specimen.py` | Added `CAN_GROSS` role guard to `POST /surgical-specimens/` |
| High | Stored XSS | `frontend/src/pages/NongyneCytoDiagnosis/NongyneDiagnosisEntryPage.tsx` | Wrapped all `dangerouslySetInnerHTML` usages with `sanitizeHtml()` |
| Medium | Audit Falsification | `backend/app/routers/surgical_block_stain.py`, `backend/app/crud/stain_run.py` | `POST /batch-run` now derives `operator_id` from the authenticated JWT instead of the client-supplied payload |

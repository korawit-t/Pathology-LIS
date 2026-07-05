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

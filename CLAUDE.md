# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Pathology LIS — an open-source Laboratory Information System for anatomical pathology departments (surgical pathology, gyne cytology, non-gyne cytology), covering registration → grossing/processing → diagnosis → PDF report sign-out. Built for real hospital use in Thailand (optional HOSxP HIS integration) but adaptable elsewhere. Typically deployed **LAN-only** inside a hospital network, not internet-facing — factor that into any security recommendation (MFA, TLS-to-HIS, malware scanning on uploads are consciously deprioritized for this reason).

Stack: FastAPI + SQLAlchemy + PostgreSQL (backend), React 18 + Vite + TypeScript + Ant Design 5 (frontend), WeasyPrint + Jinja2 for PDF reports, Docker Compose for deployment.

## Commands

### Backend (`backend/`)

```bash
# Setup
cd backend
python -m venv .venv && source .venv/bin/activate   # or venv/bin/activate per README
pip install -r requirements.txt

# Run dev server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Tests (real Postgres required — see Testing below)
pytest                        # all tests
pytest -k auth                # tests matching a keyword
pytest tests/test_surgical_cases.py::TestListCases::test_admin_can_list_cases  # single test

# Migrations
alembic revision --autogenerate -m "message"
alembic upgrade head
alembic heads                 # check for multiple heads before creating a new revision — merge first if >1
```

**Testing**: `backend/tests/conftest.py` connects to a **real Postgres** database (`pathology_lis_test` via peer-auth locally, or `TEST_DATABASE_URL` env var in CI) — not sqlite/mocks. Tables are created fresh from `Base.metadata` at session start and dropped at the end, so no Alembic migration is needed to run tests. Fixtures `client`, `admin_client`, `pathologist_client`, `clinician_client` are pre-authenticated `TestClient` instances.

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev                   # Vite dev server
npm run build
npm run lint                  # eslint .
npm test                      # vitest run (all tests)
npm run test:watch            # vitest watch mode
npx vitest run path/to/file.test.tsx   # single test file
npm run coverage
```

### Full stack (Docker)

```bash
docker compose up -d --build                          # dev (auto-loads docker-compose.override.yml: dev DB password, seed_data.py on every start, admin/admin1234)
docker compose -f docker-compose.yml up -d --build     # production — never omit -f in prod, the override has insecure defaults
docker compose exec backend alembic upgrade head       # apply migrations
```

### CI

`.github/workflows/tests.yml` runs backend pytest (with a Postgres 16 service container), frontend vitest, and a blocking `frontend-quality` job (`tsc --noEmit` + `eslint`) on every push/PR to `main`. `.github/workflows/security.yml` runs gitleaks, pip-audit, bandit, and npm audit.

## Architecture

### Backend: strict router → crud → schema → model layering

Every domain (surgical case, gyne cytology, non-gyne cytology, outlab consult, WSI, etc.) gets its own file in each of `app/routers/`, `app/crud/`, `app/schemas/`, `app/models/` (~60 files each). Routers are thin HTTP glue only — they resolve auth/query params and call the matching `crud` function; business logic and query-building lives in `crud`; Pydantic `schemas` mediate request/response shape; SQLAlchemy `models` are the DB layer. When adding a feature, touch the same quartet of files following the naming convention of the domain you're extending (e.g. `nongyne_cyto_case.py` in all four dirs).

Other backend dirs: `app/core/` (config, security/JWT, `roles.py` RBAC constants), `app/dependencies/auth.py` (`RoleChecker`, `get_current_user`), `app/middleware/audit_middleware.py`, `app/his_adapters/` (HOSxP/SSB HIS integration — see below), `app/services/`, `app/enums/`, `app/utils/`, `app/templates/reports/` (Jinja2 PDF templates).

**RBAC**: role gates are declared once in `app/core/roles.py` as `RoleChecker([...])` constants (e.g. `CAN_ACCESS_PATIENT`, `CAN_WRITE_GYNE_CYTO_REPORT`, `CAN_APPROVE`) and applied as FastAPI `Depends(...)` at the router. Follow the existing naming pattern (`CAN_{ACCESS|READ|WRITE|APPROVE}_{DOMAIN}`) rather than inlining role lists in a router.

**Multi-signer sign-out**: surgical/gyne/non-gyne diagnosis models each have a `signers` JSON column (`[{user_id, role, signed_at}]`) supporting primary/consultant/co-signer sign-out. Filtering "cases I've already signed" or "cases I still need to co-sign" is done via `jsonb_path_exists`/`JSONB.contains` queries against this column in `crud` (see `get_gyne_cases`'s `exclude_signed_by`/`signer_id` params, mirrored in `get_nongyne_cases` and `get_cases` for surgical). When adding a similar filter to a new case-type domain, mirror this exact pattern rather than inventing a new one.

**HIS integration** (`app/his_adapters/hosxp.py`): queries an external HOSxP MySQL database read-only to auto-fill patient data. SQL is built via `text(f"...")` for structural WHERE-fragments (marked `# nosec B608` with justification), but actual user-supplied values (hn, dates) are always bound via `:param` placeholders — never interpolate user input directly into the f-string. Optional integration; the app works without `HIS_DATABASE_URL` configured.

**Outbound HIS export** (`app/his_export/`): the opposite direction — sends a finalized report back out to an external HIS once a case is signed out, via a pluggable adapter (`none` default | `generic_webhook` | `custom` escape hatch; HL7v2/FHIR are a documented extension point, not implemented — no real spec was available to build against). Enqueuing happens at 6 exact CRUD-layer terminal-state transitions (see `app/his_export/README.md`), into a dedicated `his_export_logs` outbox table (not per-report columns — a 2026-06-27 migration added unused `his_sent_at`/etc. columns to the report tables before this existed; they were dropped in favor of the dedicated table). Delivery is an in-process asyncio poll loop wired via FastAPI `lifespan` (`app/his_export/worker.py`) — this project has no Celery/APScheduler/Redis, and this feature doesn't add any.

**Accession numbers**: per-case-type prefixed sequences (`S`=surgical, `C`=gyne cytology, `N`=non-gyne cytology) generated with `with_for_update()` row locking to avoid duplicates under concurrent registration (see `_get_next_nongyne_accession_no` and equivalents).

**Gotchas** (from prior debugging in this repo):
- FastAPI root collection routes must use `@router.get("")` not `@router.get("/")` — the latter causes a 307 redirect since the router prefix already defines the path.
- Every new model must be imported in `app/models/__init__.py`, or `alembic revision --autogenerate` silently produces an empty migration and the table won't exist at runtime.
- After any model column change, also hand-write the raw SQL (`ALTER TABLE` / `CREATE INDEX ... IF NOT EXISTS`) so it can be applied directly to a production DB if needed alongside the Alembic migration.
- Run `alembic heads` before creating a new revision — if there's more than one head, merge them first. Both the Railway deploy and the on-prem Windows deploy (`start.ps1`) auto-run `alembic upgrade head` before starting the server and will crash on failure. Raw-SQL patches applied manually to a DB need `alembic stamp head` afterward so the next auto-upgrade doesn't try to re-run them.

### Frontend: page-per-feature + service-per-domain, mirroring the backend

`src/pages/` has ~35 top-level feature directories (one per workflow area: Dashboard, Pathologist, GyneCytologyCase, SurgicalBlock, WSIViewer, etc.). `src/services/` has one file per backend domain (`surgicalCaseService.ts`, `gyneCytoCaseService.ts`, ...), mirroring `app/routers/` 1:1 — when a backend router gains a query param, the matching frontend service's `getAll()` param type usually needs the same field added.

`src/pages/Dashboard/dashboardViewResolver.tsx` is the central routing hub: a `VIEW_CONFIG` map of view keys to lazy-loaded page components, each wrapped in `RequireRoleView` against `PAGE_PERMISSIONS` (`src/constants/pagePermissions.ts`) for per-page RBAC — this is the frontend's equivalent of `roles.py`.

`src/pages/Pathologist/` is the most complex feature: `hooks/useCaseWorklist.ts` builds a unified "My Worklist" across surgical/gyne/non-gyne cases (badge counts computed as a deduped union of per-tab bucket queries, since one case can appear in multiple tabs — see `fetchGyneBadgeTotal` for the pattern), plus `SurgicalDiagnosisReportForm/` (the report-writing sub-app: block grid, IHC panel, finalize/sign flow, AI-assisted draft, tumor registry modal).

**UI conventions** (established across the codebase, follow rather than reinvent):
- Standard page layout: `PageContainer` with `withCard`, `title`/`extra`/`onBack` props; back-button icon style `marginRight:12 color:#595959`; multi-view pages compute the title as a variable rather than inlining conditionals in JSX.
- Tab + count UI: Ant Design `Tabs` with a `Badge` for the count placed as a **standalone sibling** next to the tab label text, not wrapping the text — wrapping shrinks the font size. Use `Segmented` for sub-filters within a tab, not nested `Tabs`.
- Patient display name: always `[title?.title, name, ln].filter(Boolean).join(" ")` — the `name` field alone is only the first name; never render it without title and last name (`ln`).

## Known non-feature work in flight

See `SECURITY_AUDIT.md` in the repo root for a security review — **note it is untracked in git and has gone stale**: several items it lists as "still open" (Jinja2 autoescape in `pdf_service.py`, upload magic-byte/EXIF validation in `app/utils/file_handler.py`, cross-hospital object-level authz) are already fixed in code. Re-verify any finding against current code before acting on it; don't treat the file as ground truth. Genuinely open: no ClamAV scanning on uploads, no MFA, HOSxP connection is unencrypted TCP, Dockerfile isn't multi-stage and doesn't pin a digest — all currently accepted as low-priority given the LAN-only deployment model.

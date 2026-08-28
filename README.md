# Pathology LIS (Laboratory Information System)

An open-source Laboratory Information System for anatomical pathology departments, covering the full workflow from case registration through diagnosis and PDF report generation.

Built for real-world hospital use in Thailand, but designed to be adaptable to other settings.

---

## Why this project?

Most commercial LIS solutions are expensive, tightly coupled to specific HIS vendors, or lack the workflow depth that a busy pathology lab actually needs. This project was built to fill that gap — a self-hosted, open-source LIS that covers the complete surgical and cytology pathology workflow out of the box.

---

## ⚠️ Terms of Use

Before installing or using this software, please read:

- **[TERMS_OF_USE.md](./TERMS_OF_USE.md)** — Scope of responsibility and support policy
- **[LICENSE.md](./LICENSE.md)** — MIT License
- **[SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md)** — Complete this before handling real patient data in production

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Ant Design 5 |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Database | PostgreSQL 15 |
| PDF Generation | WeasyPrint + Jinja2 |
| Containerization | Docker & Docker Compose |

---

## Features

> New to the system? **[docs/lis-workflow-overview.html](./docs/lis-workflow-overview.html)**
> walks a single case from the front desk to a signed report on one page — the eight main
> steps, the branches that loop back from the pathologist's desk, and the switches that
> decide how a result reaches the requesting clinician. Open it in a browser.

**Accession & Registration**
- Surgical Pathology, Gyne Cytology, Non-Gyne Cytology case registration
- HIS integration (HOSxP) — auto-fill patient data from hospital HIS. HOSxP is a widely-used Hospital Information System in Thailand; integration is optional and the system works fully without it.
- Unified Accession view across all case types

**Laboratory Workflow**
- Grossing with specimen management and gross image upload
- Tissue processing (embedding, sectioning, staining) tracking
- Block & slide management with dispatch and storage tracking
- IHC (Immunohistochemistry) result recording
- External lab (outlab) referral management

**Diagnosis & Reporting**
- Structured diagnosis entry for all 3 case types
- Multi-pathologist sign-out with role-based signatory system (primary, consultant, co-signer)
- Cytotechnologist + pathologist dual sign-out for cytology
- PDF report generation (WeasyPrint) with customizable layout templates and color scheme
- Cumulative reporting support
- Report approval workflow (configurable)

**Administration**
- Role-based access control (RBAC)
- System Settings — lab branding, TAT/SLA, barcode format, workflow toggles
- Master Data — hospitals, departments, positions, titles, medical schemes, specimen types, pathology tests, holidays, external labs
- Report Templates — select PDF layout and primary accent color per report type
- HIS integration settings (HOSxP order-form mapping)
- Google Calendar integration for pathologist scheduling

---

## Installation

### System Requirements

- Docker & Docker Compose v2
- RAM ≥ 8 GB, CPU ≥ 4 cores
- Storage for image files (gross photos, microscopic images)

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/Pathology_LIS.git
cd Pathology_LIS
```

### 2. Create environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 3. Configure environment variables

**`backend/.env`** — required changes:

| Variable | What to set |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (use service name `db` inside Docker) |
| `SECRET_KEY` | Random secret — generate with `openssl rand -hex 32` |
| `MFA_ENCRYPTION_KEY` | Encrypts stored TOTP secrets. See **[docs/mfa-setup.md](./docs/mfa-setup.md)**. Only needed once MFA is enabled; the backend boots without it. **Must not be the same value as `SECRET_KEY`** - a signing key and an encryption key should be separate, and tying TOTP secrets to `SECRET_KEY` would make it impossible to rotate without locking out every enrolled user. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Accepts a comma-separated list to rotate: new key first, old key kept until nothing needs it. |
| `ENVIRONMENT` | `development` (plain HTTP) or `production` (HTTPS). See **Environment modes** below. Defaults to `production`. |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins (scheme + host + port). In `production` **all must be `https://`**; in `development` `http://` is allowed. |
| `COOKIE_SAMESITE` | `lax` (default — frontend & backend on the same site) or `none` (genuinely different sites, e.g. two Railway domains). `none` requires `ENVIRONMENT=production`. |
| `TRUSTED_PROXY_IPS` | IP/CIDR of the reverse proxy directly in front of the backend (e.g. `127.0.0.1`). Drives the audit-log client IP **and** both login rate limits — set it correctly or every request looks like it came from the proxy: audit rows all record the proxy's address, and the per-IP cap becomes one shared bucket for everyone. Login still works in that state, because the per-username cap and the per-account failure backoff do the account-level work, but the audit trail is useless for tracing an incident. |
| `COOKIE_DOMAIN` | Only when frontend/backend are on different subdomains of one custom domain (e.g. `.yourdomain.com`). Leave blank otherwise. |
| `HIS_TYPE` | `hosxp` or leave blank to disable HIS |
| `HIS_DATABASE_URL` | HIS database connection string (if using HIS integration) |

#### Environment modes

`ENVIRONMENT` decides whether the app assumes there is **HTTPS in front of it** — not whether it is your "real" server:

| | `development` | `production` |
|---|---|---|
| Auth cookies | plain (work over HTTP) | `Secure` (HTTPS only) |
| CORS | allows `http://` origins | rejects non-`https://`; **refuses to boot** on http/localhost origins |
| Swagger `/docs` | enabled | disabled |
| Use for | local dev, **hospital LAN over plain HTTP** | internet-facing / any HTTPS deployment |

> ⚠️ If you serve over plain HTTP but set `ENVIRONMENT=production`, the backend refuses to start with `ALLOWED_ORIGINS contains plaintext origin ... but ENVIRONMENT=production`. Either keep `development`, or put HTTPS in front and switch the origins to `https://`.

**`frontend/.env`** — `VITE_API_BASE_URL` is the backend URL as seen from the **browser**. It is **baked into the build** (`npm run build`), not read at runtime, so **each deployment target is a separate build** and any change means rebuilding:

| Deployment | `VITE_API_BASE_URL` | How the browser reaches the API |
|---|---|---|
| Local dev (`npm run dev`) | `http://localhost:8000` | direct to the backend |
| Docker / LAN (direct) | `http://<server-ip>:8000` | direct to the backend (different port = still same-site) |
| On-prem IIS (reverse proxy) | `/api` | IIS rewrites `/api/*` → backend — see **4D** |
| Cloud / Railway (`Dockerfile.railway`) | *(empty)* | nginx reverse-proxies to the backend |

> ⚠️ Use the server's real IP — not `localhost` — when accessing from other machines. And don't set `/api` globally: it only applies to the IIS reverse-proxy setup (4D); on Railway it would 404 because that nginx doesn't strip `/api`.

---

### 4A. Development mode

Auto-loads `docker-compose.override.yml` which sets dev defaults automatically:

```bash
docker compose up -d --build
```

What the override does:
- Uses a default DB password (`dev_password_change_me`) — no manual DB setup needed
- Exposes port `5432` for direct DB access (psql / DBeaver / DataGrip)
- Runs `seed_data.py` on every backend start
- Creates default admin account: **username `admin`, password `admin1234`**
  - 🔒 System forces a password change on first login (minimum 8 characters)

### 4B. Production mode

```bash
# 1. Set all required variables in backend/.env and frontend/.env

# 2. Start without the dev override:
docker compose -f docker-compose.yml up -d --build

# 3. Seed initial data (run once after first install):
docker compose -f docker-compose.yml run --rm backend python seed_data.py

# 4. Login with admin / admin1234 — change password immediately
```

> ⚠️ Never run `docker compose up` (without `-f`) on production — it auto-loads the dev override with insecure defaults.

### 4C. Cloud deployment (e.g. Railway) as two separate services

If frontend and backend are deployed as two separate services with two different hostnames (Railway, or similar PaaS), **Safari will block the login cookie** — it treats the two hostnames as cross-site, even with `SameSite=None; Secure` set. This does not affect the Docker/LAN setup above, where frontend and backend share a host (only the port differs), which every browser treats as same-site.

Two ways to fix it, pick one:

- **You own a custom domain** — put frontend and backend on subdomains of it (e.g. `app.yourdomain.com` + `api.yourdomain.com`) and set `COOKIE_DOMAIN=.yourdomain.com` in `backend/.env` (see the variable's comment in `backend/.env.example` for details).
- **No custom domain** — build the frontend with `frontend/Dockerfile.railway` instead of `frontend/Dockerfile`. It serves the app and reverse-proxies API calls to the backend through the same nginx, so the browser only ever sees one origin. Requires setting `BACKEND_UPSTREAM=<backend-service>.railway.internal:8000` (get the exact hostname from the backend service's private-networking settings) and leaving `VITE_API_BASE_URL` empty. See the comments in `frontend/nginx.railway.conf.template` for the full explanation.

### 4D. On-premise Windows (IIS reverse proxy, no Docker)

For a Windows Server where IIS serves the frontend and the backend runs via `backend/start.ps1` (Uvicorn on port 8000). The browser is routed through **one origin** so the auth cookie works with no CORS or mixed-content issues.

**1. Build the frontend with the `/api` base** (baked in — rebuild whenever it changes):

```powershell
cd frontend
$env:VITE_API_BASE_URL="/api"; npm run build
```

Copy the contents of `frontend/dist/` into the IIS site folder (e.g. `C:\inetpub\wwwroot\pathology_web`).

**2. Reverse-proxy `/api` → backend via IIS URL Rewrite + ARR.**
`frontend/public/web.config` already ships the rule and is bundled into `dist/` on every build, so it survives redeploys (a rule added by hand to the server folder gets overwritten on the next deploy). It forwards `/api/*` → `http://127.0.0.1:8000/*`, stripping the `/api` prefix. For IIS to actually proxy to that URL you must set this up **once** (server-level — it lives in `applicationHost.config` and persists across redeploys):

- Install **URL Rewrite 2.1** and **Application Request Routing 3.0** (from Microsoft).
- IIS Manager → **server node** (top) → *Application Request Routing Cache* → **Server Proxy Settings…** → tick **Enable proxy** → Apply.

**3. Backend `backend/.env`:**

- IIS serves over **HTTPS** → `ENVIRONMENT=production`, `ALLOWED_ORIGINS=https://<host>`, `TRUSTED_PROXY_IPS=127.0.0.1`
- IIS serves over plain **HTTP** → `ENVIRONMENT=development`, `ALLOWED_ORIGINS=http://<host>`

**4. Verify on the server** (isolates which layer is wrong):

```powershell
# backend directly — must return JSON
curl.exe "http://127.0.0.1:8000/system-settings/public?slug=master"

# through IIS — must return the SAME JSON
curl.exe -k "https://<host>/api/system-settings/public?slug=master"
```

| Symptom on the second call | Cause |
|---|---|
| StaticFile **404** (IIS tries a physical path `...\api\...`) | URL Rewrite rule not loaded — module not installed, or `web.config` missing from the site folder |
| **502** | ARR proxy not enabled (step 2) |
| Returns `index.html` | SPA rule caught `/api` first — the API rule must be **above** it with `stopProcessing="true"` |

> `start.ps1` auto-runs `alembic upgrade head` before starting Uvicorn. `VITE_API_BASE_URL` is compiled in, so changing it means rebuilding the frontend and recopying `dist/`.

---

### 5. Accessing the system

| Service | URL |
|---|---|
| Web application | `http://<server-ip>:3000` |
| API documentation | `http://<server-ip>:8000/docs` (development only) |

### 6. Firewall / Network

Open inbound rules on the server firewall:

| Port | Purpose |
|---|---|
| `3000` | Frontend (web browser access) |
| `8000` | Backend API |
| `5432` | PostgreSQL — **internal only, do not expose publicly** |

### 7. Backup

| Data | Location |
|---|---|
| Uploaded images & files | `./backend/data/storage/` |
| Database | Docker volume `postgres_data` |

Back up both locations regularly. The storage directory can be bind-mounted to an external drive or NAS in `docker-compose.yml`.

---

## Customizing Report Templates

PDF report layouts live in `backend/app/templates/reports/`. Each file is a Jinja2 HTML template rendered by WeasyPrint.

### How it works

The repository ships `*.html.example` files (the tracked defaults). The actual `*.html` files are **gitignored** — each lab maintains its own copy without being affected by future `git pull` updates.

On first start, the backend automatically copies every `.html.example` → `.html` if the file doesn't already exist. No manual step required.

### To customize a template

```bash
# The .html files are already created on first start — just edit them directly:
nano backend/app/templates/reports/surgical_report_template.html
```

Changes take effect immediately (WeasyPrint reads the file at render time — no restart needed).

### To reset a template to the default

```bash
cp backend/app/templates/reports/surgical_report_template.html.example \
   backend/app/templates/reports/surgical_report_template.html
```

### Adding a new template variant

Drop any `*.html` file into `backend/app/templates/reports/` with the correct prefix (`surgical_report_template_*.html`, `gyne_cyto_report_template_*.html`, `nongyne_cyto_report_template_*.html`). It will appear automatically in **System Settings → Report Templates**.

---

## Versioning and Releases

Backend and frontend ship together under one version number. The running
version is visible in three places:

```bash
curl http://localhost:8000/version      # {"version": "2.0.0", "environment": "..."}
```

…in the footer of the login page, and in **System Settings → About**, which
lists the frontend and backend numbers separately — they should always match.

The number is [Semantic Versioning](https://semver.org/spec/v2.0.0.html), read
from the point of view of whoever performs the upgrade:

| Part | Bump when |
|---|---|
| **MAJOR** | the upgrade needs a human — a new or renamed env var, hand-run SQL, a data backfill, a required starting alembic revision, or a workflow change users must be retrained on |
| **MINOR** | at least one new feature (`feat:`) |
| **PATCH** | fixes and internal work only |

A migration that `alembic upgrade head` applies by itself is **not** a MAJOR —
both the Railway deploy and the on-prem `start.ps1` run it automatically before
the server starts. MAJOR is reserved for upgrades that fail, or silently do the
wrong thing, if nobody reads the release notes first.

Every release is a git tag, so `git checkout v2.0.0` gets you the exact code a
given deployment is running. [CHANGELOG.md](./CHANGELOG.md) lists what changed
in each one, and carries the upgrade notes for any MAJOR.

### Cutting a release

Tag when you deploy to a real lab, not on every merge — the version should
answer "what is running in the hospital right now".

```bash
python scripts/version.py bump minor    # or: major | patch | set 2.1.0
```

That rewrites `backend/app/core/config.py` and `frontend/package.json` (plus
the lock file) together; CI fails the **Version Sync** check if they ever
disagree. Then collect the entries for CHANGELOG.md:

```bash
git log v2.0.0..HEAD --format='- %s' --no-merges
```

Commit, merge the PR, and tag the merge commit on `main`:

```bash
git tag -a v2.1.0 -m "v2.1.0" && git push origin v2.1.0
```

---

## Database Migrations

Migrations are managed with Alembic. After pulling updates that include model changes:

```bash
docker compose exec backend alembic upgrade head
```

Or locally (inside the backend virtualenv):

```bash
cd backend
source venv/bin/activate
alembic upgrade head
```

### Upgrading across the 2026-08-18 baseline

Migration history before `b7e4a1c05f38` was squashed into a single baseline
revision, because the old chain had become cyclic and `alembic upgrade head`
consequently never terminated on a fresh database. New installs are unaffected
and need no special handling — the baseline creates the whole schema in one
step.

An **existing** database must already be at `b7e4a1c05f38` before you deploy a
version containing the baseline. If yours is on an older revision, upgrade it
with the previous release first:

```bash
git checkout <the release you are currently running>
alembic upgrade head
```

Then deploy as normal. A database stamped at an id that no longer exists fails
with `Can't locate revision identified by ...` — loudly, and before the server
starts, but it does fail. If you are certain a database already has the current
schema, you can instead adopt the baseline directly:

```bash
alembic stamp b7e4a1c05f38
```

---

## Two-Factor Authentication

Optional and off by default. See **[docs/mfa-setup.md](./docs/mfa-setup.md)** for
enabling it, enrolling, and recovering an account whose device was lost.

> ⚠️ **Check the server clock before enabling it.** TOTP codes are calculated
> from the current time, so a server drifting more than ~30 seconds rejects
> every code from every user at once — and the failure looks like "the codes are
> wrong" rather than anything to do with the clock. `w32tm /query /status` on
> Windows, `timedatectl status` on Linux.

There are no printed recovery codes: a lost device is cleared by an
administrator who has verified who is asking, and `backend/scripts/reset_mfa.py`
covers the case where nobody can sign in at all. Make sure your written
procedure names who is contactable out of hours.

---

## Backup and Restore

`backup.ps1` (Windows, native PostgreSQL) and `backup.sh` (Linux, PostgreSQL in
Docker) each take a compressed `pg_dump` of the database plus an archive of the
uploads directory. Both read all their configuration from `backend/.env` —
`BACKUP_ROOT`, `BACKUP_PG_BIN` (Windows), `DB_CONTAINER` (Linux), `STORAGE_DIR`,
`BACKUP_KEEP`, and an optional `SLACK_BACKUP_WEBHOOK`.

Run one manually:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\path\to\Pathology_LIS\backup.ps1"
```

```bash
./backup.sh
```

Each run writes `db_<timestamp>.dump` and `storage_<timestamp>.zip` (`.tar.gz`
on Linux) to `BACKUP_ROOT`, appends a row to `backup_log.csv`, and keeps the
newest `BACKUP_KEEP` of each (default 14). Pruning happens only after a run
that succeeded and verified, so a spell of failures cannot age out the last
good copy.

The dump is checked with `pg_restore -l` before it is renamed into place. A
run that fails partway leaves a discarded `.part` file and the previous
backups untouched.

> On Windows, `Compress-Archive` cannot produce a valid zip beyond 2 GB. The
> script uses 7-Zip automatically when it is installed, warns from 1.5 GB, and
> refuses to run past 2 GB without it rather than writing an archive that only
> proves unreadable at restore time.

### Verifying a backup

A backup nobody has restored is not yet a backup. To prove one end to end,
restore it into a throwaway database and compare row counts against the live
one:

```bash
createdb lis_restore_check
pg_restore -d lis_restore_check /path/to/db_<timestamp>.dump
psql -d lis_restore_check -tAc "select count(*) from surgical_cases"
psql -d <production_db> -tAc "select count(*) from surgical_cases"
dropdb lis_restore_check
```

A quicker structural check, without restoring — this lists the archive's table
of contents and should report roughly one line per table:

```bash
pg_restore -l /path/to/db_<timestamp>.dump | grep -c "TABLE DATA"
```

### Restoring for real

Restore into a **new** database first and inspect it. Never restore straight
over a live one — if the dump turns out to be older or thinner than expected,
you have then lost the current state as well.

---

## Setting the Starting Accession Number

If your lab previously used a different system (paper-based or another LIS), run this script once to set the correct starting point before registering your first real case.

### ⚠️ Prerequisites

The script requires **at least one patient** and **one user** in the system to use as placeholder foreign keys.

> Create a dummy patient via the UI: **Patients → Add Patient** (any name/HN will do).
> If no real patients exist yet, log in as admin and create a temporary patient first.

### Usage

```bash
# Surgical (S)
python seed_accession_start.py S26-01500   # → next case will be S26-01501

# Gyne Cytology (C)
python seed_accession_start.py C26-00800   # → next case will be C26-00801

# Non-Gyne Cytology (N)
python seed_accession_start.py N26-00300   # → next case will be N26-00301
```

```bash
# Inside Docker container
docker compose exec backend python seed_accession_start.py S26-01500

# Or directly via virtualenv
cd backend
python seed_accession_start.py S26-01500
```

- The number you pass is the **last accession number already used** (not the next one)
- The script inserts a placeholder case (status=`cancelled`) into the database
- The next real case will automatically receive that number **+1**
- Run this script only once, before registering your first case — never again after that

---

## Whole Slide Image (WSI) Viewer — Optional Setup

The WSI viewer allows pathologists to open whole slide scan files (.svs, .ndpi, .tiff, etc.) directly in the browser. It requires the **OpenSlide** native library to be installed on the backend server.

### Step 1 — Install OpenSlide (system library)

**macOS**
```bash
brew install openslide
```

**Ubuntu / Debian**
```bash
sudo apt install openslide-tools libopenslide-dev
```

**RHEL / CentOS / Rocky Linux**
```bash
sudo yum install openslide
# or on newer systems:
sudo dnf install openslide
```

**Windows**
1. Download the prebuilt binary from [openslide.org/download](https://openslide.org/download/) (choose the `openslide-win64-*.zip`)
2. Extract the zip
3. Add the `bin\` folder inside the extracted directory to your system `PATH`
   - Control Panel → System → Advanced → Environment Variables → PATH → Edit → Add the path
4. Restart the backend server after changing PATH

### Step 2 — Install Python bindings (inside backend virtualenv)

```bash
# macOS / Linux
cd backend
source venv/bin/activate
pip install openslide-python

# Windows
cd backend
venv\Scripts\activate
pip install openslide-python
```

Verify the installation:
```bash
python -c "import openslide; print(openslide.__version__)"
```

### Step 3 — Configure WSI Root Path

1. Log in as admin
2. Go to **System Settings → WSI Settings**
3. Set **WSI Root Path** to the folder where your scanner saves slide files:
   - Local disk: `/data/wsi_storage` (Linux/Mac) or `C:\WSI_Storage` (Windows)
   - NAS / network share: `/mnt/nas/wsi` (Linux) or `\\192.168.1.50\wsi` (Windows UNC path)
4. Add a **Scanner Profile** matching your scanner's filename convention:
   - **Pattern**: `{accession}_{block}` (e.g. for `S26-001_A1.svs`)
   - **Extensions**: `svs`, `ndpi`, `tiff` (add what your scanner produces)
   - **Separator**: `_` or `-` depending on your scanner

### Supported File Formats

| Format | Scanner Brand |
|---|---|
| `.svs` | Aperio (Leica) |
| `.ndpi` | Hamamatsu |
| `.scn` | Leica |
| `.mrxs` | MIRAX / 3DHISTECH |
| `.tiff` / `.btf` | Generic tiled TIFF |
| `.vms`, `.vmu` | Hamamatsu (older) |

> **Note**: Zeiss `.czi` files require an additional library (`aicspylibczi`) and are not supported out of the box.

---

## First-time Setup Checklist

After installation, log in as admin and configure the following under **System Settings**:

- [ ] Lab name (Thai & English), address
- [ ] Upload report logo and login logo
- [ ] TAT / SLA days (routine and express) for each case type
- [ ] Accession number format (e.g. `{year}-{no}`)
- [ ] Barcode settings (OPD/IPD prefix, type codes)
- [ ] Enable/disable approval workflow per case type
- [ ] Default pathology tests for each case type

Under **Master Data**:
- [ ] Add hospitals, departments, positions
- [ ] Configure pathology tests and specimen types
- [ ] Set up medical schemes (insurance schemes)
- [ ] Add external labs if using outlab referral

Under **Master Data → Report Templates**:
- [ ] Select active PDF layout for Surgical / Gyne / Non-Gyne
- [ ] Set primary accent color for report branding

*(Optional)* Under **System Settings → WSI Settings** (if using whole slide scanner):
- [ ] Install OpenSlide on the backend server (see [WSI Viewer Setup](#whole-slide-image-wsi-viewer--optional-setup))
- [ ] Set WSI Root Path to the folder where scanner saves files
- [ ] Add scanner profile(s) with filename pattern matching your scanner

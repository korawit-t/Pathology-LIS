# Changelog

All notable changes to Pathology LIS.

The version is a single number for the whole product — backend and frontend
ship together and are tagged together. It follows [Semantic Versioning], read
from the point of view of whoever performs the upgrade:

- **MAJOR** — the upgrade needs a human: a new or renamed env var, hand-run
  SQL, a data backfill, a required starting alembic revision, or a workflow
  change users must be retrained on. Read this section before deploying.
- **MINOR** — new features. Deploy normally.
- **PATCH** — fixes only.

A migration that `alembic upgrade head` applies by itself is not a MAJOR:
both the Railway deploy and the on-prem `start.ps1` run it automatically
before the server starts.

Entries below are the `feat:` and `fix:` commits of each release. Commits
touching only tests or CI are left out.

## [3.3.0] — 2026-11-14

A case can now go to an out-lab consult more than once. Each round is its
own record with its own number on the case's accession (S26-01234-C1, -C2,
…), its result PDF has to be approved before the case is released, and the
report prints a cover for every approved round, gyne and non-gyne included.
The diagnosis pages list every round with the destination lab's reference,
the reader and the concordance.

Also: a specimen 1, 2, 3 / block A, B, C label scheme, patient search across
every case type, and a sidebar with clearer names that asks before it drops
unsaved work.

### Upgrade notes

Nothing to run by hand: `alembic upgrade head` applies the three new
migrations. Worth doing:

- **Back up the database first.** One migration creates consult round 1 for
  every case already flagged or dispatched for out-lab consult and links the
  existing consult run lines to it; another fills in each case's latest
  round number.
- **Tell the pathologists about consult approval.** A case cannot be
  released while its consult is out, or until the returned PDF is approved
  with the new **Approve** button in the consult panel (surgical, gyne and
  non-gyne). Replacing or deleting the PDF clears the approval. Once the
  latest round is released, the case can be sent again.
- **Tell the gross room** that a block which has left it (past grossed, in a
  processing run, or with a printed slide sticker) can no longer be deleted.
  Deleting one used to remove its processing, embedding, sectioning, stain
  and storage records while the cassette still existed.
- **Menu names changed.** Front Desk → Report Print Queue; Gyne / Non-Gyne
  Cytology → Worklist and Staining Runs; Internal Staining → Stain Orders and
  Staining Runs; External Lab is now **Outlab** (Send & Track, Staining Runs,
  Consults, Test Queue); Diagnosis → Pending Approvals. Histology → Process
  Out now lists only the runs still in the processor. QC Review and Report
  Archive each appear once per user.
- **Passwords:** the Security tab's minimum length now also applies when an
  administrator creates a user or resets a password, and is never below 8.
- **Linux / Docker backups:** `backup.sh` now refuses a `BACKUP_ROOT` on the
  system disk or the Docker data disk, and sends the Slack failure alert. A
  site that does mean to back up there sets `BACKUP_SKIP_DISK_CHECK=true`.
- **Optional:** the specimen 1, 2, 3 / block A, B, C scheme is under
  **System Settings → Workflow & SLA → Grossing Pipeline**. The default keeps
  A / A1 as before, and switching never relabels an existing case.

### Added

- **outlab-consult** — one record per consult round, numbered on the case's accession (S26-01234-C1, -C2), approve before release
- **outlab-consult** — the report prints a cover for every approved round; gyne and non-gyne reports print consult covers too
- **outlab-consult** — rounds panel on the surgical, gyne and non-gyne diagnosis pages (status, destination lab and its reference, reader, concordance, PDF), with a round count
- **outlab-consult** — send a case again once its latest round is released
- **outlab-consult** — round tag (C2) on My Worklist's External Consult tab and the consult queue, run and tracking tables
- **surgical** — specimen 1, 2, 3 / block A, B, C label scheme, and a setting for whether deleting a block renumbers the rest

### Fixed

- **outlab-consult** — uploading or deleting a consult PDF needs the outlab-result permission; clinician and hospital accounts could reach it
- **surgical** — refuse deleting a block that has left the gross room, with the reason in English
- **surgical** — specimen labels sort 1…9, 10, and the label after 9 is 10 (was ":")
- **patients** — search by name, CID or the HN of any case type on the server; Patient Management only searched its first 100 rows
- **patients** — refuse deleting a patient who has cases (surgical cases were deleted with the patient; a gyne or non-gyne case made it fail)
- **users** — say why a password is refused, and apply the minimum length on create and reset
- **backup** — refuse a BACKUP_ROOT on the system or Docker disk, and alert Slack when the backup cannot start
- **menu** — one entry per page per role, names that match their pages, Report Print Queue no longer offered to roles that got a 403
- **side-menu** — 240px sidebar so no label is cut off, one background in dark mode, icons on groups only, the user's own group opens
- **dashboard** — ask before the menu, logo or Logout drops unsaved Grossing or surgical report edits; keep the parent menu item highlighted on report forms and other sub-pages
- **nongyne-worklist** — draw the Non-Gyne tab like the Gyne tab; a published case no longer reads "Screened" in the cytotechnologist worklist

## [3.2.0] — 2026-11-11

The lab can now see when an IHC result went out, and how long it took. A
stain's result counts as out when the pathologist signs off the report that
carries it, whether or not the IHC panel was filled in, since some pathologists
type IHC results straight into the diagnosis. With the approve system on, it
reaches the clinician when the report is approved. Report Analytics gets an
IHC TAT tab for surgical and for non-gyne cases.

Also: notifications to LINE groups through the หมอพร้อม bot (MOPH Notify),
importing reports from an old system, and slide counts on the dispatch note.

### Upgrade notes

Nothing to run by hand: `alembic upgrade head` applies the six new
migrations and their backfills. Worth doing:

- **Back up the database first.** Three of the migrations rewrite existing
  stain rows. They fill in when each slide was ready, when its result was
  signed off, and when it was published, working from the stain runs, outlab
  receipts and past reports. A ready IHC or special stain still at "stained"
  after a complete sign-off (its result typed into the diagnosis) moves to
  "completed". That drops it from the pathologists' "awaiting review" lists.
- **Tell the pathologists about the sign-off page.** Signing off as complete
  ("Yes, Signed Off") now records every ready IHC / special stain on the case
  as reported. Signing off as "No, Pending" records only the ones already
  reviewed. The page lists both, plus the stains not back yet. If an approver
  rejects the report, those stains wait for the next sign-off.
- **Set the IHC target** under **System Settings → Workflow → Turnaround
  Time**. It defaults to 10 working days from order to result out.
- **To use MOPH Notify**, add a notification channel with the client-key and
  secret-key from the หน่วยบริการ menu of the MOPH Notify CMS.

### Added

- **stains** — record when an IHC / special stain result goes out: at the pathologist's sign-off, independent of the IHC panel
- **stains** — record when it reaches the clinician: on publish, which is the approval when the approve system is on
- **stains** — record when a slide becomes readable (outlab receive, stain run)
- **report** — IHC TAT dashboard in Report Analytics, for surgical and non-gyne cases, with an IHC TAT target setting
- **nongyne** — IHC / special stain sign-off notices and result timeline for non-gyne cases
- **notifications** — send to LINE groups through MOPH Notify (the หมอพร้อม bot)
- **notifications** — {name_short} and {clinician_short} template variables
- **legacy-import** — import old-system reports into the legacy report tables (IT Administration → Legacy Report Import)
- **slide-dispatch** — show slides per case and the total on the dispatch note

### Fixed

- **sign-off** — list the case's IHC / special stains (the list only ever loaded the routine H&E), and those not back yet
- **report** — give non-gyne report rounds surgical's dated headings
- **report** — show the time on non-gyne Collected and Received
- **gross** — list test fees by CGD code, not by name
- **legacy-reports** — page the legacy report search in the database, so it stays fast once imports land
- **stain-run** — stamp a stain run's completion with the app's clock, not the database's

## [3.1.1] — 2026-11-10

Fixes found by installing 3.1.0 under Docker the way another site would: login
from a second machine, a checkout made on Windows, a backup restored onto an
empty server, the database restarting under a running backend. Two of them
also reach an on-premise Windows install: colleagues behind one address no
longer sign each other out, and the first requests after a database restart no
longer fail.

### Upgrade notes

Nothing is required. Worth checking on a Docker install:

- **Never run `docker compose down -v` on a production server.** 3.1.0's notes
  — in **System Settings → About** as well as here — suggested it for resetting
  a dev database. It permanently deletes the database volume and every
  uploaded file. [README → 4A](./README.md#4a-development-mode) now has
  commands that empty only the dev database.
- **A `$` in `backend/.env` has to be written `$$`.** Compose expands `$name`
  in that file's values, so a password containing `$` (a HIS password, say)
  reached the backend cut short, with only a `variable is not set` warning
  from `docker compose up`. An install without Docker is unaffected.
- **New optional settings in the root `.env`:** `COMPOSE_PROJECT_NAME`,
  `FRONTEND_PORT`, `BACKEND_PORT`, `WSI_HOST_PATH`, and `DB_PORT` for the dev
  override. Unset, everything behaves as before. If an existing install sets
  `COMPOSE_PROJECT_NAME`, it must be the name its volumes already carry
  (`<name>_postgres_data` in `docker volume ls`), or the next `up` starts on
  empty volumes.

### Fixed

- **auth** — limit token refresh, password changes and MFA per user, not per client address
- **db** — test a pooled connection before handing it out, so a database restart costs no 500s
- **docker** — rotate container logs instead of keeping every line forever
- **docker** — take the ports, the project name and the WSI scanner folder from the root .env
- **docker** — check shell scripts out with LF line endings on Windows, so init-db.sh runs
- **docker** — pin the backend base image to Debian trixie
- **docker** — put the frontend's port in the ALLOWED_ORIGINS example, so login works from another machine
- **docker** — replace the `down -v` dev reset with commands that cannot touch production
- **docs** — Docker upgrade, restore, backup check, WSI and troubleshooting steps; the real clone URL; `$$` in backend/.env

## [3.1.0] — 2026-11-10

Three features and a round of fixes, most of them to the Docker install, which
could not be brought up from the README as it stood: the database had no
credentials, the backend refused a LAN origin, and the frontend sent its API
calls to itself. An on-premise Windows install needs nothing beyond the usual
deploy.

The release notes now also appear in the app, under **System Settings → About**,
so a hospital without internet access can still read what changed.

### Upgrade notes

**All installs**

- **The database clock now follows the app.** Every database session is set
  to Asia/Bangkok, the zone the app already writes its own times in. On a
  PostgreSQL server that was already on Asia/Bangkok — the usual on-premise
  Windows install — nothing changes. On one left on UTC (the postgres Docker
  image, most managed hosts), columns the database fills itself, such as a
  case's registration time, were stored 7 hours early, and anything registered
  before 07:00 carried the previous day's date. New rows are right from this
  release; rows written before it keep their old times. Check yours with
  `SHOW timezone;` in psql.

**Docker installs**

- **Production needs a root `.env`** with `POSTGRES_USER`, `POSTGRES_PASSWORD`
  and `POSTGRES_DB`. `docker-compose.yml` always read them, but nothing said so
  and nothing showed the format; `.env.example` at the repo root now does. Keep
  the password to letters and digits.
- **`ENVIRONMENT` is read from `backend/.env`.** `docker-compose.yml` used to
  force `production` over it. If you serve the app over HTTPS, make sure
  `backend/.env` says `ENVIRONMENT=production`, or the auth cookies lose their
  `Secure` flag.
- **Migrations run in their own `migrate` service**, as the database owner,
  before the backend starts. `backend/.env` may now point `DATABASE_URL` at the
  least-privilege `lis_app_rw` role, which used to break the first migration.
- **A dev database made by the old override has no Alembic revision**, so the
  new `migrate` service stops on it with `DuplicateTable`. Empty it once with
  the commands in [README → 4A](./README.md#4a-development-mode); it holds only
  seed data. *(This note first said `docker compose down -v`, which also
  deletes the uploads volume and, run on a production server, the real
  database. Corrected in 3.1.1.)*

**New settings (all optional)**

- `UPDATE_CHECK_REPO` — which GitHub repository the admin's update notice
  compares against; `off` for a server with no internet access.
- `HIS_DISPLAY_NAME` — the name staff know your HIS by, shown on the HIS button
  and search screen.

**Database**

One new revision (`96a7ae501bf4`, the update-notice switches), applied by
`alembic upgrade head`.

### Added

- **about** — show the release notes in System Settings → About
- **his** — show which HIS is connected and hide what it can't do
- **update-check** — let an admin switch each update notice off
- **update-check** — tell admins about a newer release, and open tabs about a new build

### Fixed

- **docker** — build the frontend with the API URL from frontend/.env, not an empty one
- **docker** — let backend/.env decide ENVIRONMENT, so a LAN install over HTTP starts
- **docker** — document the root .env the database container needs
- **docker** — run migrations as the database owner in a one-shot `migrate` service
- **docker** — build the dev schema with Alembic instead of create_tables.py
- **docker** — wait for PostgreSQL to accept connections before migrating
- **docker** — keep .env, virtualenvs and node_modules out of the images
- **docker** — keep dev uploads in the named volume, so a Linux host can write them
- **docker** — answer a missing JS/CSS chunk with a 404 instead of index.html
- **time** — put every database session on Asia/Bangkok
- **backup** — read backend/.env without executing it, so backup.sh runs again
- **start.sh** — stop splitting .env values into words before the server starts
- **accession** — show clinical HTML as text and keep it on save
- **pathologist** — open the provisional reason box under its toggle

## [3.0.0] — 2026-11-05

About ten weeks of work since 2.0.0 — 17 features and 36 fixes. It is a MAJOR
because a Docker install has to rescue its uploads before it upgrades, and a
deploy still running the example `SECRET_KEY` no longer starts. Both are
below, along with a change to who may perform a gyne QC review.

### Upgrade notes

Back up the database and the uploads before you start — see
[Backup and Restore](./README.md#backup-and-restore).

**Do these before you deploy**

- **Docker installs: copy the uploads out of the backend container first.**
  `docker-compose.yml` used to mount `./backend/data/storage`, a path the
  backend never writes to, so every uploaded image and file lived inside the
  container and was lost whenever it was recreated. This release mounts a
  named volume, `uploads_data`, at `/app/uploads`. Copy the files out before
  you rebuild and back in afterwards; the four commands are under
  [README → Backup](./README.md#7-backup). On-premise Windows installs are not
  affected.
- **`SECRET_KEY` must be a real key.** The backend now refuses to start when
  `SECRET_KEY` contains `change_me` or `changeme`, which is what
  `backend/.env.example` ships with. If yours does, generate a new one with
  `openssl rand -hex 32` before you deploy.

**Changes users will notice**

- **Everyone signs in once more after the upgrade.** Tokens issued before it
  carry no issue time, so they count as older than any password change. From
  now on a password change or an admin reset ends that user's other sessions,
  and a disabled account stops working at its next request.
- **A temporary or expired password now blocks the whole API**, not only 11
  routers. Until it is changed, the user can load their profile and
  preferences and change the password, nothing else.
- **Gyne QC review is limited to pathologists.** Only a pathologist or senior
  pathologist can Agree/Disagree — not a cytotechnologist, a lab manager or an
  admin — and never on a case they screened or sent for review. A
  pathologist's own abnormal or unsatisfactory read-out now publishes directly
  instead of queueing a review of themselves, and a case in `pending_review`
  leaves it only through the review. Tell the cytology staff before go-live.
- **"Require All Signatures"** (gyne and non-gyne): while it is on, the server
  records each signature itself, so a user can add only their own. A sign-off
  that is still missing one is refused and names who is outstanding.

**New settings (both optional)**

- `EXPOSE_DOCS` — `/docs`, `/redoc` and `/openapi.json` are now closed unless
  this is the literal `true`. They used to follow `ENVIRONMENT=development`,
  which a LAN install has to run with, so they were open to the whole subnet.
  Leave it unset wherever real patient data lives;
  `docker-compose.override.yml` sets it for the dev stack.
- `UPLOAD_ROOT` — moves the uploads folder to another disk or a file share.
  Unset keeps `backend/uploads`, as before. A folder set here must already
  exist and be writable, or the backend refuses to start. See
  [Moving the uploads folder](./README.md#moving-the-uploads-folder).

**Database**

Eleven new revisions, all applied by `alembic upgrade head`. `start.ps1` and
Railway run it before the server starts; if you start uvicorn any other way,
run it yourself first, or pages that read the new columns fail with a 500.
One revision (`04b59817b3b5`) backfills an image snapshot for every existing
report — nothing to do by hand. Coming from 2.0.0 needs no particular starting
revision.

### Added

- **molecular** — add a Molecular tab to the pathologist's My Worklist
- **uploads** — make the uploads folder configurable with UPLOAD_ROOT
- **molecular** — show when an out-lab PDF is in but not yet finalized
- **gyne** — give pathologists a QC Review tab in their worklist
- **slide-storage** — give a slide sticker's QR the slide's own identity
- **report** — find cases by specimen text and diagnosis text
- **molecular** — hand out the out-lab report as cover pages only
- **pathologist** — count badge and click-to-preview on the gross images tab
- **nongyne** — rename the disposal queue tab to "ครบกำหนด"
- **nongyne** — leave slides-only specimen types out of storage and disposal
- **pathologist** — approve outlab results from inside the PDF preview
- **molecular** — add Molecular to the print queue and put a barcode on its PDFs
- **nongyne** — add the specimen storage step and make disposal depend on it
- **surgical** — enforce the specimen retention gate on disposal sheets
- **nongyne** — add specimen disposal with a backend-enforced retention gate
- **images** — add rotate/flip, re-editable uploads, and a locked-case guard
- **qc** — compare cytotech screening against the signed-out diagnosis

### Fixed

- **reports** — re-render signed reports with the letterhead they were issued with
- **reports** — reprint each report version with the images it went out with
- **docker** — persist uploads in a named volume and back them up
- **uploads** — re-encode JPEG/WebP at quality 92 instead of Pillow defaults
- **auth** — end sessions on password change, enforce forced change everywhere, refuse placeholder key
- **security** — close file read, cross-hospital and external-account access holes
- enforce gyne QC reviewer eligibility and cyto sign-off server-side
- **slide-storage** — list the special stains Manual Select was hiding
- **slide-storage** — match a scanned slide against the barcode its sticker prints
- **report** — export the case list as real .xlsx, and stop the placeholder sitting on typed text
- **security** — put the API docs on their own flag so a LAN deploy can close them
- **backup** — stage the storage archive under a name Compress-Archive accepts
- **backup** — say why the storage archive failed, and keep one that is merely incomplete
- **molecular** — keep a case inside the hospital that sent it
- **molecular** — hand a result to the referring side only once it is signed out
- **gross** — keep a case in the gross worklist when stain orders change
- **consult** — let an out-lab round sign off without a typed diagnosis
- **editor** — keep the caret on its line when using the toolbar
- **reports** — keep the lab header on every consult cover page
- **disposal** — keep the signatures on a page that lists cases
- **pathologist** — make the Pending tab list the cases its label names
- **pathologist** — float pending immuno cases in the All tab too
- **pathologist** — float pending diagnosis cases alongside slide sent in the All tab
- **molecular** — name the signer on the out-lab cover sheet
- **cyto** — let a cleared pathologist assignment actually save
- **nongyne** — sort the work still to be done to the top of the "All" tab
- **pathologist** — count tab badges up front, not on first click
- **deps** — reach a patched @tiptap/core by dropping four unused shim packages
- **his** — stop showing HOSxP-only UI, and stop reporting a failed HIS lookup as an empty result
- **deps** — bump browserslist to 4.28.8 for GHSA-73wf-gq98-2v4g / GHSA-c83g-rgw3-j3cx
- **deps** — bump pypdf 6.15.0 -> 6.16.2 for CVE-2026-84309/84310/84311
- **his** — stop the visits-today query full-scanning vn_stat
- **release-form** — print HN and accession no on the slide/block request form
- **case-status** — stop late blocks pulling a dispatched case backward
- **accession** — align the Out Lab and Molecular tables with the case tables
- **editor** — trim the &nbsp; blank lines an HTML paste brings along

## [2.0.0] — 2026-08-28

The first tagged release since the initial public one. It collects roughly two
months of work — 55 features and 95 fixes — and is a MAJOR because of the
migration baseline below.

### Upgrade notes

Migration history before `b7e4a1c05f38` was squashed into a single baseline
revision. **An existing database must already be at `b7e4a1c05f38` before you
deploy this release.** New installs need no special handling — the baseline
creates the whole schema in one step. See
[Upgrading across the 2026-08-18 baseline](./README.md#upgrading-across-the-2026-08-18-baseline)
for what to do if your database is on an older revision; a database stamped at
an id that no longer exists fails loudly, before the server starts.

### Added

- **nongyne** — give the cytotechnologist a Signatories card
- **print-queue** — sort reports still awaiting print to the front
- **outlab** — make the clickable accession look clickable
- **outlab** — show copy-ready registration details for consult cases
- **dashboard** — surface pending Molecular cases on the pathologist card
- **nongyne-diagnosis** — save the draft when Sign-off is pressed
- **settings** — print a controlled-document number on the disposal checklist
- **specimen-storage** — require a signed checklist before specimens can be disposed
- **auth** — make the step-up re-check a setting, off by default
- **auth** — enforce the MFA enrolment deadline
- **auth** — let an administrator reset a user's second factor from the UI
- **auth** — add a two-factor panel to the account menu
- **auth** — let an administrator turn MFA on from the settings screen
- **auth** — add the two-step login and the MFA setup page
- **auth** — let an admin reset MFA, and add a break-glass console script
- **auth** — re-check a factor before irreversible actions
- **auth** — trust known browsers so MFA does not prompt on every login
- **auth** — require a second factor at login when MFA is enabled
- **auth** — add MFA enrolment endpoints
- **auth** — add MFA_ENCRYPTION_KEY and the Fernet helper for TOTP secrets
- **auth** — add the MFA factor and backup-code schema
- **quality** — record a free-text comment with each quality assessment
- **tissue-processing** — count the tissue per cassette, not per case
- **reports** — print a footer barcode on cyto reports, only for a real visit
- **accession** — expand an out-lab run to see the cases inside it
- **tissue-processing** — show tissue count per case in the run detail modal
- **gyne** — key the gyne barcode off VN/AN like surgical and non-gyne
- **stain** — add a HosXP Key tab for internal staining
- **notifications** — flag patients who are currently admitted
- **notifications** — name the specimen in malignancy and critical alerts
- **notifications** — attach upcoming HOSxP appointments to malignancy alerts
- **outlab-consult** — allow requesting an out-lab consult without signing off
- **gross** — convert surgical gross_description from rich text to plain text
- **molecular** — print parent Surgical case accession on sticker
- **histology** — add daily H&E control slide tracking + sticker printing
- **image-capture** — extract shared ImageCapture util, bump HQ resolution to 1080p
- **gross** — add optional HQ capture mode via ImageCapture API
- **pathologist** — add optional HQ capture mode via ImageCapture API
- **outlab** — itemize pending stains in the scheduled alert message
- **outlab** — add {case_id} placeholder to scheduled outlab-visit alert
- **gyne-cyto** — record outlab test result upload date
- **gyne-cyto** — notify configured channels when a case is randomly selected for QC review
- **outlab** — scheduled notification for patients visiting today with pending outlab results
- **molecular** — live-generated result PDF, rich text, ResultPage integration, delete guard
- **gyne-outlab** — show a lab-header cover sheet on outlab test result PDFs
- **gyne-outlab** — gate outlab test result behind pathologist sign-off
- **outlab** — let staff pick specific pages when uploading a PDF
- add Molecular Pathology case type with assist pathologist tracking
- **surgical** — replace consult-PDF page-prepend with generated cover sheet
- **nongyne** — add editable malignancy/critical switches to diagnosis form
- **nongyne-cyto** — show number of slides on diagnosis pages
- **surgical-case** — add clinical history field to registration form
- **nongyne-worklist** — show badge count on My New Cases tab
- **workflow** — add toggle to simplify grossing->staining pipeline
- **his-export** — add outbound HIS export with pluggable adapters and admin log viewer

### Fixed

- **nongyne** — stop seeding an unsigned cytotechnologist as a signatory
- **signatories** — stop losing and misreporting the unsigned state
- **reports** — stop the footer barcode printing over the last line
- **specimen-disposal** — drop "คงเหลือ" from the form title, add the storage date
- **specimen-disposal** — keep referring-side accounts out of the signature fields
- **internal-stain** — list every special-stain case, paginated by case
- **settings** — persist barcode codes and molecular prefix instead of dropping them
- **cyto-histo** — show the Bethesda category, not an attribute that never existed
- **case-status** — guard the 5 remaining writers against reopening closed cases
- **ap-tests** — stop AP test orders reopening signed-out surgical cases
- **gross** — show and filter "Sectioned" cases in the case tables
- **case-status** — put "formalin_fixing" back in the surgical catalogue
- **molecular** — let the whole lab attach an out-lab result, not just signers
- **gross** — stop a gross edit sending a sectioned case back to "grossed"
- **pathologist** — stop Confirm & Sign Off disabling itself mid-request
- **auth** — raise the step-up prompt above the full-screen sign-off overlays
- **auth** — put the step-up prompt in front of the user who triggered it
- **gyne-qc** — close three ways a case could skip NILM QC review
- **gyne-qc** — repair pagination, search and navigation on the QC Review page
- **auth** — let the security settings save survive the step-up guard
- **auth** — stop persisting enrolment status, and read it from the server
- **auth** — give the MFA setup QR code a size so it is actually visible
- **backup** — stop overwriting the only backup, and verify it before keeping it
- **auth** — cap login attempts per username, not only per source address
- **auth** — throttle failed logins with backoff instead of locking the account
- **slide-block-release** — print the consent form for cytology releases
- **histology** — gate each workflow step on the one before it
- **cyto** — capture VN/AN on non-gyne registration, and fix the cyto footer font
- **his** — move already-imported vn/an values into their correct columns
- **reports** — give the page margin boxes the report font
- **reports** — print the footer barcode at its generated size, not CSS-scaled
- **his** — stop storing outpatient VNs in the AN field
- **reports** — move "Printed:" out from under the surgical report barcode
- **notifications** — restore the patient title in alert names
- **stain** — recognise "Special Stain" category on the Internal Stain page
- **images** — stop double-applying the API base so secure images load on IIS
- **deps** — bump pypdf to 6.15.0 and nanoid to 3.3.18 to clear CI audits
- **iis** — add API reverse-proxy rewrite to web.config so redeploys keep it
- **microscopic-images** — harden path-traversal check to resolve+relative_to
- **deps** — bump pdfjs-dist to 6.2.108 (CVE-2026-16633)
- **security** — harden login (token-type, SameSite via env, nginx headers)
- **outlab** — Send to Outlab queue was dropping IHC ordered on old blocks
- **reports** — replace fragile <p>/<br/> regex with a proper text normalizer
- **deps** — bump cryptography 48.0.1 -> 50.0.0 to close 3 CVEs
- **deps** — bump transitive undici and brace-expansion to patch newly disclosed CVEs
- **editor** — keep locked/disabled fields focusable so Ctrl+A stays scoped
- **reports** — strip all leading/trailing <br/> when flattening diagnosis <p> for PDF
- **editor** — fix paste sanitization to not corrupt slice merge metadata
- **editor** — strip blank paragraphs from pasted content in rich-text editor
- **stain** — stop post-dispatch stains from reappearing in Slide Dispatch
- **reports** — stop diagnosis badge from shifting on page-break
- **surgical-report** — require primary signature before publish in PRIMARY ONLY mode
- **nongyne-diagnosis** — suppress semgrep dangerouslySetInnerHTML false-positive
- **image-capture** — capture at native resolution, re-encode HQ blobs to JPEG
- **nongyne-diagnosis** — revoke the previous preview PDF before generating a new one
- **deps** — align all @tiptap/* packages to 3.29.0
- **reports** — narrow Tooltip labelFormatter arg for recharts 3.10.0
- **deps** — bump pydantic-core to 2.46.4 alongside pydantic 2.13.4
- **nongyne-diagnosis** — suppress semgrep react-dangerouslysetinnerhtml findings
- **image-capture** — align client upload size caps with backend limit
- **gyne** — stop auto-toggling Abnormal switch for Unsatisfactory adequacy
- **gyne-qc** — flag unsatisfactory specimens for QC review, add signed-at column
- **outlab** — include is_hosxp_keyed/hosxp_keyed_at in outlab run detail response
- **gyne-cyto** — stop Save Draft from wiping already-recorded signatures
- **pdf-page-selector** — lazy-load pdfjs-dist to avoid jsdom crash
- **deps** — bump pyasn1 to 0.6.4
- **molecular** — match generate_consult_cover_pdf's current 1-arg signature
- **tissue-processing** — add explicit ascending sorter on Accession No. column
- **tissue-processing** — sort accession numbers ascending in run detail modal
- **surgical** — restore consult PDF cover on reports finalized before the cover-sheet feature
- **sticker** — zero-pad surgical block number on slide stickers
- **wsi** — send auth cookie on WSI Viewer info/dzi-info fetch calls
- **notifications** — stop leaking raw exception text from trigger_event
- **gross** — use DOMPurify-based stripping in GrossEditView emptiness check
- **reports** — use DOMPurify-based stripping for CSV export text fields
- **surgical-case** — use crypto.randomUUID for pending upload uid
- **reports** — enlarge barcode sizing on label sheet and report footer
- **migrations** — merge divergent alembic heads
- **settings** — wire up dead System Setting flags, remove unused ones
- **security** — bump click and pillow to patch known CVEs
- **auth** — handle race condition on concurrent token revocation
- **gross** — don't revert GROSSED status to in-progress on draft save
- **security** — SSRF guard on webhooks, sanitize IHC preview, JWT-derive storage-run user
- use findByTitle instead of getByTitle for the pagination page-2 test
- bump Docker base image to Python 3.14 to match numpy>=2.5.1 requirement
- stop leaking hashed_password from nongyne stain run endpoints
- grant register role access to Report Archive / Print Report Queue
- render printed barcodes as vector SVG instead of a scaled raster PNG
- **frontend** — drop case-duplicate SurgicalReportService.ts
- **frontend** — clear tsc + eslint errors, make CI gates blocking
- **security** — close authz gaps in surgical_diagnosis router
- downgrade openslide-python 4.0.0 → 1.4.6 (4.0.0 not on PyPI)
- exclude openslide packages from pip-audit (not on public PyPI)
- upgrade pypdf 6.12.0 → 6.13.3 to patch 6 CVEs
- update dompurify and undici to patch security vulnerabilities

## [1.0.0] — 2026-06-29

Initial public release.

[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
[2.0.0]: https://github.com/korawit-t/Pathology-LIS/releases/tag/v2.0.0
[3.0.0]: https://github.com/korawit-t/Pathology-LIS/releases/tag/v3.0.0
[3.1.0]: https://github.com/korawit-t/Pathology-LIS/releases/tag/v3.1.0
[3.1.1]: https://github.com/korawit-t/Pathology-LIS/releases/tag/v3.1.1
[3.2.0]: https://github.com/korawit-t/Pathology-LIS/releases/tag/v3.2.0
[3.3.0]: https://github.com/korawit-t/Pathology-LIS/releases/tag/v3.3.0

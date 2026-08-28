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

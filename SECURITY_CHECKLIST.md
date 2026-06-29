# Security Checklist — Anatomical Pathology LIS

Stack: React (frontend) · FastAPI (backend) · PostgreSQL (database) · HOSxP (HIS integration) · Native + Docker deployment.

This checklist is opinionated for a system handling **PHI (Protected Health Information)** — pathology reports, patient demographics, specimen data, diagnoses. Treat every item as "must have" unless explicitly marked "nice to have." Re-run the whole list before each release and on a quarterly cadence.

---

## 0. Foundations (do these first)

- [ ] Define a **data classification policy**: what is PHI, what is internal, what is public. Tag every database column and API field accordingly.
- [ ] Decide on a regulatory baseline (HIPAA, Thailand PDPA, GDPR — whichever applies to your deployment region) and document scope.
- [ ] Maintain a **threat model** (STRIDE or similar) — at minimum: external attacker, malicious insider, compromised lab tech account, compromised HIS link, supply-chain attack on a dependency.
- [ ] Keep a **risk register** with owner, severity, mitigation, and review date.
- [ ] Establish a **security contact / responsible disclosure** policy in `SECURITY.md` for the open-source repo (e.g., `security@yourdomain` and a PGP key).
- [ ] Decide what is open source vs. private. Keep deployment configs, secrets, customer-specific HOSxP mappings, and signed builds out of the public repo.

---

## 1. Authentication

- [ ] Use a vetted auth library — do not roll your own password hashing or JWT verification.
  - FastAPI: `fastapi-users`, `Authlib`, or integrate with an external IdP (Keycloak, Authentik, Azure AD).
- [ ] Password hashing with **Argon2id** (preferred) or bcrypt cost ≥ 12. Never MD5/SHA1/SHA256-only.
- [ ] Enforce password policy: min length 12, deny common-password list (e.g., HaveIBeenPwned k-anonymity API).
- [ ] **MFA mandatory** for any account that can view or sign out reports (TOTP minimum; WebAuthn preferred for pathologists).
- [ ] Account lockout / exponential backoff on failed logins. Alert on 10+ failures from one IP.
- [ ] Session/token expiry: short-lived access tokens (≤15 min), refresh tokens with rotation and reuse detection.
- [ ] Logout invalidates the refresh token server-side (maintain a revocation list or use opaque sessions with Redis).
- [ ] Re-authenticate (step-up) before high-risk actions: report sign-out, amendment, user privilege change, data export.
- [ ] No default/seed credentials in production; first-boot wizard forces admin password change.

---

## 2. Authorization & RBAC

- [ ] Define explicit roles: e.g., `lab_tech`, `histotechnologist`, `pathologist`, `resident`, `transcriptionist`, `admin`, `auditor`, `it_support`. Document each role's permissions.
- [ ] **Enforce authorization on the backend, always.** Never trust the frontend to hide a button as a security control.
- [ ] Use FastAPI dependencies (`Depends(require_role(...))`) consistently — write a single permission decorator and use it on every protected route.
- [ ] **Object-level authorization**: a pathologist can only see cases assigned to them (or to their group). Add tests that prove it.
- [ ] Principle of least privilege for service accounts (HOSxP integration user, backup user, monitoring user — each with minimal grants).
- [ ] Separate "view PHI" from "modify PHI" from "sign out report" — these are different permissions.
- [ ] Periodic access review (quarterly): list all users and roles, have an admin re-attest.

---

## 3. FastAPI / Backend

- [ ] Run with `--proxy-headers` only behind a trusted reverse proxy; otherwise disable to prevent IP spoofing.
- [ ] Strict **CORS**: explicit allow-list of frontend origins, no `*` in production, `allow_credentials=True` only with specific origins.
- [ ] Use **Pydantic** models for every request and response. Treat unvalidated input as a bug.
- [ ] Disable `/docs` and `/redoc` in production, or gate them behind admin auth.
- [ ] Add **rate limiting** (`slowapi`, or at the reverse-proxy layer with NGINX/Traefik) on auth endpoints, search, and exports.
- [ ] Set request size limits — block oversized JSON / file uploads at the proxy.
- [ ] **Security headers** (via middleware or proxy): `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Content-Security-Policy`, `X-Frame-Options: DENY`.
- [ ] Disable verbose error responses in production. Return generic messages; log details server-side with a correlation ID.
- [ ] Set a global exception handler so stack traces never leak to clients.
- [ ] Use **async** routes carefully — never call blocking DB/IO inside an async route without `run_in_threadpool` or async drivers.
- [ ] Pin Python version; use `pip-audit` or `uv pip audit` in CI.

---

## 4. React / Frontend

- [ ] Never store tokens in `localStorage` if you can avoid it — use **HttpOnly, Secure, SameSite=Lax/Strict cookies** for session tokens.
- [ ] If you must use bearer tokens in JS, keep them in memory only and rely on refresh-token cookies.
- [ ] **CSRF protection**: if using cookie auth, implement double-submit cookie or `SameSite=Strict` plus origin checks on the server.
- [ ] Avoid `dangerouslySetInnerHTML`. If unavoidable, sanitize with **DOMPurify**.
- [ ] Strict **Content Security Policy** — no `unsafe-inline`, no `unsafe-eval`. Use nonces or hashes for inline scripts.
- [ ] Subresource Integrity (SRI) on any third-party scripts loaded from a CDN (or self-host them).
- [ ] Lock dependencies (`package-lock.json` / `pnpm-lock.yaml`); run `npm audit` / `pnpm audit` in CI; consider Socket.dev or Snyk.
- [ ] Don't render PHI in URL paths or query strings (they end up in browser history, proxy logs, analytics).
- [ ] Disable React DevTools / source maps in production builds, or restrict source maps to authenticated internal users.
- [ ] Auto-logout on idle (e.g., 15 minutes); warn user 1 minute before.
- [ ] Display a **break-the-glass / patient-on-screen indicator** so a pathologist always knows whose record is open.

---

## 5. PostgreSQL / Database

- [ ] Use a **parameterized ORM** (SQLAlchemy, SQLModel) — never string-concatenate SQL. Audit every `text()` usage.
- [ ] Separate DB users per role: `app_rw`, `app_ro` (for reports), `migrator` (only used during deploys), `backup`. App should not connect as `postgres`.
- [ ] **TLS-only** connections (`sslmode=verify-full`), with the server cert pinned.
- [ ] Enable `pgaudit` or row-level audit triggers for reads and writes to PHI tables.
- [ ] Enable **Row-Level Security (RLS)** for tenant or department isolation if you support multiple labs.
- [ ] Encrypted backups (e.g., `pgBackRest` with `repo-cipher-type=aes-256-cbc` or filesystem-level), stored off-host, retention documented.
- [ ] Backup **restore drill** at least quarterly — an untested backup is not a backup.
- [ ] At-rest encryption: full-disk (LUKS) or filesystem (e.g., ZFS native encryption). PostgreSQL itself does not encrypt at rest.
- [ ] Field-level encryption for the most sensitive fields (e.g., national ID, HN if exposed externally) using `pgcrypto` or app-side AES-GCM with keys in a KMS/Vault.
- [ ] Never put PHI into log statements (`SELECT ... WHERE name = ?` is fine; logging the parameter values is not).
- [ ] `pg_hba.conf`: only allow connections from the app subnet; reject `trust` mode entirely.
- [ ] Track schema changes with **Alembic** migrations; review them in PRs.

---

## 6. HOSxP / HIS Integration

- [ ] Treat the HOSxP link as an **untrusted external system** even if it's on the same LAN.
- [ ] Use a dedicated, least-privilege HOSxP user; rotate its credentials.
- [ ] All inbound HOSxP messages (HL7, web service, MySQL/MSSQL bridge — whatever you use) go through a **validation layer** before touching the LIS DB.
- [ ] Log every inbound and outbound HOSxP message with a correlation ID, but redact PHI in lower log levels.
- [ ] If you're polling the HOSxP MySQL/MSSQL DB directly: **read-only connection**, separate network interface, statement timeout, query allow-list. Do not embed business logic in raw cross-DB joins.
- [ ] Idempotency: every inbound order/result must have a unique external ID; replays must not create duplicates.
- [ ] Reconciliation job (daily) that checks LIS vs. HOSxP for missing or mismatched records and alerts on drift.
- [ ] Network: HIS-LIS traffic over a VLAN or VPN, mTLS if the HOSxP version supports it, otherwise IPsec or Wireguard between hosts.
- [ ] Document the message contract (HL7 segments, web-service schemas) and version it.
- [ ] Have a **manual fallback** procedure (paper or CSV import) for when HOSxP is down — and a security review of that procedure.

---

## 7. Docker Deployment

- [ ] Base images: official slim or distroless; rebuild weekly to pick up patches; pin by digest, not just tag.
- [ ] Multi-stage builds; final image contains only runtime deps (no compilers, no `pip`, no `npm`).
- [ ] Run as **non-root user** (`USER appuser`); `readOnlyRootFilesystem: true` where possible.
- [ ] Drop all Linux capabilities, add back only what's needed (`cap_drop: [ALL]`).
- [ ] No secrets in `Dockerfile`, `docker-compose.yml`, or image layers. Use Docker secrets, environment files mounted from host (not committed), or a secrets manager.
- [ ] Scan images in CI: **Trivy**, Grype, or Snyk Container. Fail the build on High/Critical.
- [ ] Sign images (cosign) and verify signatures at deploy time.
- [ ] Set resource limits (`mem_limit`, `cpus`) to limit blast radius of a compromised container.
- [ ] Don't expose Postgres or Redis ports to `0.0.0.0` — bind to `127.0.0.1` or an internal Docker network.
- [ ] Use a non-default Docker network; don't share the default bridge.
- [ ] Healthchecks on every container so the orchestrator can restart unhealthy ones.
- [ ] Log driver shipped to a central syslog/Loki/ELK; do not rely on `docker logs` alone.
- [ ] Keep a `docker-compose.prod.yml` separate from `docker-compose.dev.yml`. Production never uses `:latest`.

---

## 8. Native Deployment

- [ ] Reproducible install: a single `install.sh` or Ansible playbook; document every package and config file.
- [ ] Run app under a dedicated systemd unit as a **non-login service user** (`User=lis`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`).
- [ ] Firewall (`ufw` / `firewalld` / `nftables`): default deny inbound, allow only 443 from public, 5432 only from app host.
- [ ] SELinux or AppArmor in enforcing mode if your distro supports it.
- [ ] Automatic security updates (`unattended-upgrades` on Debian/Ubuntu, `dnf-automatic` on RHEL).
- [ ] SSH: key-only auth, no root login, fail2ban, port-knocking or VPN for admin access.
- [ ] Time sync (chrony/ntpd) — audit logs are useless with skewed clocks.
- [ ] File integrity monitoring on `/etc`, app binaries, and the FastAPI venv (AIDE or Tripwire).

---

## 9. Network & TLS

- [ ] **TLS 1.2+ only**, modern cipher suites (Mozilla "intermediate" profile). Test with `testssl.sh` and SSL Labs.
- [ ] HSTS with `max-age >= 31536000; includeSubDomains; preload` (only when you're sure you'll stay on HTTPS).
- [ ] Auto-renewing certs (Let's Encrypt via certbot/Caddy) or internal CA with monitored expiry.
- [ ] Reverse proxy (NGINX, Caddy, Traefik) terminates TLS; backend listens only on localhost or the internal network.
- [ ] Block all egress from the LIS host except known destinations (HOSxP, mail relay, NTP, package mirrors).
- [ ] Internal network segmentation: LIS, HIS, PACS, lab instruments on separate VLANs with firewall rules between them.

---

## 10. Secrets Management

- [ ] No secrets in Git — ever. Add `git-secrets` or `gitleaks` as a pre-commit hook and CI gate.
- [ ] Use **HashiCorp Vault**, AWS/GCP Secrets Manager, or `sops + age` for an open-source-friendly setup.
- [ ] Rotate DB passwords, JWT signing keys, HOSxP credentials at least annually and after any suspected exposure.
- [ ] JWT keys: use asymmetric (RS256/EdDSA) so the verifier doesn't hold the signing key.
- [ ] `.env` files have mode `0600`, owned by the service user, and are not in the Docker build context.

---

## 11. Logging, Auditing & Monitoring

- [ ] **Audit log** is append-only and tamper-evident (separate DB, write-only DB user, hash-chain or external WORM storage).
- [ ] Audit every: login (success/failure), permission change, PHI access, report sign-out, amendment, export, admin action.
- [ ] Audit record includes: timestamp (UTC + TZ), user, source IP, action, resource ID, outcome, correlation ID — but **never the PHI payload itself**.
- [ ] Centralized logs (Loki, ELK, Graylog) with retention matching your regulatory requirement (HIPAA: 6 years).
- [ ] Alert on: brute-force auth, privilege escalation, mass-export of cases, after-hours access by non-on-call users, HOSxP reconciliation drift.
- [ ] Health & uptime monitoring (Prometheus + Alertmanager, Uptime Kuma, etc.).
- [ ] Document an **incident response runbook**: who is on call, how to isolate the host, how to preserve evidence, how to notify affected patients per local breach-notification law.

---

## 12. PHI Handling & Privacy

- [ ] Data minimization: every API response returns only the fields the caller needs.
- [ ] **De-identification** pipeline for any export used in research, training, or shared with vendors (HIPAA Safe Harbor or expert determination).
- [ ] Patient-matching logic (MRN + name + DOB) is centralized and tested — wrong-patient errors are the worst kind of bug in a LIS.
- [ ] Print/PDF reports include a "confidential — PHI" footer and a recipient name.
- [ ] Image/whole-slide files: same access controls as the case record; signed, expiring URLs for any direct download.
- [ ] Implement **break-the-glass** access (emergency override) with mandatory reason and immediate audit alert to the privacy officer.
- [ ] Data retention and deletion policy is implemented in code, not just documented (scheduled job to purge per policy).

---

## 13. File Uploads (slide images, attachments, scanned forms)

- [ ] Accept-list of MIME types and extensions; verify with magic bytes, not just the filename.
- [ ] Cap file size at the proxy.
- [ ] Store uploads outside the web root, served only via authenticated endpoints with object-level checks.
- [ ] Virus scan (ClamAV) before the file becomes accessible.
- [ ] Re-encode images server-side to strip EXIF / hidden payloads.
- [ ] Use random UUIDs for stored filenames; never trust user-supplied names.

---

## 14. Supply Chain & Open Source Hygiene

- [ ] **SBOM** generated per build (Syft or `cyclonedx-py`/`cyclonedx-npm`); store with the release artifacts.
- [ ] Dependabot or Renovate enabled; weekly review.
- [ ] CI runs: `pip-audit`, `npm audit`, `trivy fs`, `gitleaks`, `bandit` (Python SAST), `semgrep`, `eslint-plugin-security`.
- [ ] **Branch protection** on `main`: required reviews, required status checks, signed commits or signed tags.
- [ ] CODEOWNERS for security-sensitive paths (`auth/`, `audit/`, `migrations/`, deployment).
- [ ] Reproducible builds where feasible; record image digests with each release.
- [ ] Public repo: enable GitHub/GitLab secret scanning and push protection.
- [ ] Pin third-party GitHub Actions by SHA, not by tag.

---

## 15. Backup, DR & Business Continuity

- [ ] 3-2-1 backups: 3 copies, 2 media types, 1 off-site.
- [ ] Encrypt backups; manage backup encryption keys separately from production secrets.
- [ ] **Restore drills** quarterly with documented RTO/RPO.
- [ ] Backup of audit logs is treated with the same rigor as the primary DB backup (and is itself audited).
- [ ] Disaster recovery plan covers HOSxP outage, ransomware, hardware failure, and key personnel unavailability.

---

## 16. Testing & CI

- [ ] Unit tests for every authorization rule; a regression test for every security bug.
- [ ] Integration tests that hit the API as a real user with each role.
- [ ] **Negative tests**: explicit tests that prove role X cannot do action Y.
- [ ] DAST (OWASP ZAP baseline) against a staging environment in CI.
- [ ] Annual third-party penetration test; remediate High/Critical before next release.
- [ ] Load test auth, search, and export endpoints to confirm rate limits hold under stress.

---

## 17. Open-Source Project Hygiene

- [ ] `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` present.
- [ ] Clear statement that the project is **not certified medical software** and that deployers are responsible for local regulatory compliance — get this reviewed by counsel.
- [ ] Disclaimer in the README that PHI handling requires the deployer to complete this checklist; do not ship a "demo data" mode that could be confused with production.
- [ ] CVE disclosure process and a public security advisory channel (GitHub Security Advisories).
- [ ] Signed releases (cosign or GPG) and a documented verification procedure.

---

## 18. Pre-release gate (run before every deploy)

- [ ] All CI security checks green.
- [ ] No High/Critical CVEs in dependencies or images (or each one has a documented exception with expiry).
- [ ] Migrations reviewed; backup taken immediately before deploy.
- [ ] Smoke test with a non-admin account; confirm audit events appear.
- [ ] Rollback plan written and tested.
- [ ] Changelog entry for any security-relevant change.

---

### Quick wins if you only have one afternoon

1. Turn on MFA for all admin and pathologist accounts.
2. Add Pydantic models and a single `require_role` dependency on every route.
3. Add a reverse proxy with HSTS, strict CSP, and rate limiting on `/auth/*`.
4. Move secrets out of `.env` files in the repo into Vault or sops.
5. Wire up `gitleaks`, `pip-audit`, `npm audit`, and `trivy` in CI.
6. Stand up an append-only audit log for logins and PHI access.

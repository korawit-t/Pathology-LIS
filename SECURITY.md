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

### 2026-06-10

Fixed four vulnerabilities identified during pre-release security review:

| Severity | Category | Component | Fix |
|----------|----------|-----------|-----|
| High | Path Traversal | `backend/app/routers/system_setting.py` | Added `.resolve().is_relative_to()` check on template preview endpoint to prevent directory escape |
| High | Authorization Bypass | `backend/app/routers/surgical_specimen.py` | Added `CAN_GROSS` role guard to `POST /surgical-specimens/` |
| High | Stored XSS | `frontend/src/pages/NongyneCytoDiagnosis/NongyneDiagnosisEntryPage.tsx` | Wrapped all `dangerouslySetInnerHTML` usages with `sanitizeHtml()` |
| Medium | Audit Falsification | `backend/app/routers/surgical_block_stain.py`, `backend/app/crud/stain_run.py` | `POST /batch-run` now derives `operator_id` from the authenticated JWT instead of the client-supplied payload |

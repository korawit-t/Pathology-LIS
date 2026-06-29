# Contributing to Pathology LIS

Thank you for your interest in contributing. This is a PHI-handling medical information system — contributions that touch patient data, authentication, authorization, or report generation require extra care.

**Read first:**
- [TERMS_OF_USE.md](./TERMS_OF_USE.md) — this is not certified medical software; understand the liability model.
- [SECURITY.md](./SECURITY.md) — how to report vulnerabilities privately.
- [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) — security requirements for production deployments.

---

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- (Optional) Docker & Docker Compose

### Backend (FastAPI + PostgreSQL)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # fill in your values
alembic upgrade head
python seed_data.py        # creates default admin user (temporary password, forced change on login)
uvicorn main:app --reload
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
cp .env.example .env       # set VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

### Running Tests

```bash
# Backend — requires a separate test DB (pathology_lis_test)
cd backend && source venv/bin/activate && python -m pytest

# Frontend
cd frontend && npm run test

# TypeScript check
cd frontend && npx tsc --noEmit
```

---

## How to Contribute

1. **Fork** the repo and create a branch from `main`:
   - Features: `feat/short-description`
   - Bug fixes: `fix/short-description`
   - Security fixes: coordinate privately via [SECURITY.md](./SECURITY.md) first

2. **Make your changes.** Follow existing code style (see below).

3. **Add or update tests** for any change that affects business logic, auth, or data integrity.

4. **Run the full test suite** and TypeScript check before opening a PR.

5. **Open a Pull Request** against `main`. Describe what changed and why — not just what the code does.

---

## Security-Sensitive Paths

Changes to these areas require especially careful review. If your PR touches them, explain the security rationale in the PR description.

| Path | Reason |
|------|--------|
| `backend/app/core/` | Auth primitives, roles, JWT |
| `backend/app/dependencies/auth.py` | Route-level auth gates |
| `backend/alembic/versions/` | Schema migrations — irreversible on production |
| `backend/app/crud/*_report.py` | PHI in generated PDFs |
| `backend/app/routers/storage.py` | File access authorization |
| `frontend/src/utils/auth.ts` | Token storage and refresh |

---

## Code Style

**Python:**
- PEP 8; type hints on all function signatures
- Use `logging` (never `print()`) — get a logger with `logging.getLogger(__name__)`
- No bare `except: pass` — always log or re-raise

**TypeScript / React:**
- Strict mode; no `any` except for pdfmake `docDefinition` and AntD `onFinish` callbacks
- No `@ts-ignore`; fix the type instead
- Use the `logger` utility (`src/utils/logger.ts`) instead of `console.log/warn/error`
- No inline `style={{}}` for layout — use Ant Design spacing props

**Comments:**
- Only when the *why* is non-obvious (a hidden constraint, a workaround, a regulatory reason)
- No docstrings that restate the function name

---

## Commit Messages

Short imperative subject line (≤ 72 chars), present tense:

```
feat: add slide dispatch guard for non-gyne stain status
fix: prevent duplicate stain run on rapid double-submit
security: gate nongyne image routes behind CAN_ACCESS role
```

---

## Questions

Open a [Discussion](../../discussions) for questions about architecture or usage.
Use [Issues](../../issues) only for confirmed bugs with reproduction steps.
For vulnerabilities, see [SECURITY.md](./SECURITY.md).

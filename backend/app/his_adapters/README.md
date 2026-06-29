# HIS (Hospital Information System) Integration

Connect to external HIS databases to pull patient data into the Pathology LIS system.

## Architecture

Uses the **Adapter Pattern** + **gitignored SQL files** to support multiple hospitals
and HIS types without modifying any tracked Python code.

```
Frontend (HIS Button)
    ↓
API: GET /his/patients?case_type=surgical
    ↓
Adapter Factory (selected by HIS_TYPE in .env)
    ↓
┌──────────────┬──────────────────────────────────────────┐
│ HOSxP        │ Custom SQL                               │
│ (hosxp.py)   │ (custom.py → reads data/his_{type}.sql) │
└──────┬───────┴──────────────────────┬───────────────────┘
       ↓                              ↓
    MySQL DB                   Any SQL database
```

---

## Configuration (.env)

```env
# Select HIS type: hosxp, custom
HIS_TYPE=hosxp

# Connection URL to the HIS database
HIS_DATABASE_URL=mysql+pymysql://user:password@host:3306/dbname?charset=utf8
```

> **Note:** If the password contains special characters (e.g. `@`), use URL encoding:
> `@` → `%40`, `#` → `%23`, `:` → `%3A`

---

## Supported Adapters

### 1. HOSxP (`HIS_TYPE=hosxp`)
- File: `app/his_adapters/hosxp.py`
- Database: MySQL (HOSxP)
- Configure form names via env vars (no code change needed):
  ```env
  HOSXP_FORM_SURGICAL=Surgical Pathology|Pathology
  HOSXP_FORM_GYNE=Gyne Cytology|Pap Smear
  HOSXP_FORM_NONGYNE=Non-Gyne Cytology|Cytology
  ```

### 2. Custom SQL (`HIS_TYPE=custom`)
- File: `app/his_adapters/custom.py`
- Reads SQL from `backend/data/` (gitignored — safe from `git pull`)
- Supports **per-case-type SQL files**:

| Case Type | SQL File | Fallback |
|---|---|---|
| surgical | `data/his_surgical.sql` | `data/his_custom_query.sql` |
| gyne | `data/his_gyne.sql` | `data/his_custom_query.sql` |
| nongyne | `data/his_nongyne.sql` | `data/his_custom_query.sql` |

Use the fallback (`his_custom_query.sql`) if your HIS query is identical for all case types.

---

## Deploying at Multiple Hospitals

Each hospital only needs:

1. **`.env`** (gitignored) — set `HIS_TYPE`, `HIS_DATABASE_URL`, and any credentials
2. **`backend/data/*.sql`** (gitignored via `backend/data/*.sql`) — hospital-specific SQL

```
Hospital A (HOSxP)           Hospital B (custom HIS)
.env:                        .env:
  HIS_TYPE=hosxp               HIS_TYPE=custom
  HIS_DATABASE_URL=...         HIS_DATABASE_URL=...
  HOSXP_FORM_SURGICAL=...
                               data/his_surgical.sql   ← never committed
                               data/his_gyne.sql
                               data/his_nongyne.sql
```

`git pull` can run freely on both — no tracked file is hospital-specific.

---

## Adding Custom SQL for a New Hospital

1. Copy the example templates:
   ```bash
   cd backend
   cp data/his_surgical.sql.example  data/his_surgical.sql
   cp data/his_gyne.sql.example      data/his_gyne.sql
   cp data/his_nongyne.sql.example   data/his_nongyne.sql
   ```

2. Edit each `.sql` file to match your HIS database schema.
   The examples use a HOSxP-like schema — adjust table and column names.

3. Set in `.env`:
   ```env
   HIS_TYPE=custom
   HIS_DATABASE_URL=mysql+pymysql://user:pass@host:3306/dbname?charset=utf8
   ```

4. **Required SQL bind parameters:**
   - `:hn` — Hospital Number filter (empty string = no filter)
   - `:date_start` — `"YYYY-MM-DD 00:00:00"`
   - `:date_end` — `"YYYY-MM-DD 23:59:59"`

5. **Required return columns:**
   `an`, `vn`, `hn`, `gender`, `gender_code`, `nationality`, `pname`, `fname`,
   `lname`, `birthday`, `cid`, `lab_order_number`, `doctor`, `order_date`,
   `department`, `form_name`, `ward`, `pttype`, `age`

---

## Adding a New Python Adapter (Advanced)

Only needed if the adapter logic cannot be expressed in SQL alone
(e.g. calls an HTTP API, or requires complex Python transformations).

1. Create `app/his_adapters/your_his.py` extending `HisAdapterBase`
2. Register it in `app/his_adapters/__init__.py`
3. Set `HIS_TYPE=your_his` in `.env`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/his/patients` | Search patients from HIS database |
| GET | `/his/info` | Show current HIS configuration status |

**Parameters for `/his/patients`:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `hn` | string | No | Patient Hospital Number |
| `date_start` | string | Yes | Start date (yyyy-mm-dd) |
| `date_end` | string | Yes | End date (yyyy-mm-dd) |
| `case_type` | string | No | `surgical` / `gyne` / `nongyne` (default: surgical) |

---

## File Structure

```
app/
├── his_adapters/
│   ├── __init__.py       # Base class + Factory
│   ├── hosxp.py          # HOSxP adapter (config via env vars)
│   ├── custom.py         # Custom SQL adapter (reads from data/*.sql)
│   ├── ssb.py            # Deprecated — use HIS_TYPE=custom instead
│   └── README.md         # This file
├── db/
│   └── his_database.py   # HIS MySQL connection engine
├── routers/
│   └── his.py            # API endpoints
└── schemas/
    └── his.py            # Pydantic response schemas

backend/
└── data/                 # *.sql files are gitignored
    ├── .gitkeep
    ├── his_surgical.sql.example   # Template — copy and rename
    ├── his_gyne.sql.example
    ├── his_nongyne.sql.example
    ├── his_surgical.sql           # Hospital-specific (gitignored)
    ├── his_gyne.sql               # Hospital-specific (gitignored)
    └── his_nongyne.sql            # Hospital-specific (gitignored)
```

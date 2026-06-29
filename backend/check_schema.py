"""
ตรวจสอบว่า column ใน models ตรงกับ DB จริงหรือไม่
รัน: python check_schema.py
หรือกำหนด DB เอง: DATABASE_URL=postgresql://... python check_schema.py
"""
import os
import sys
from sqlalchemy import create_engine, inspect, text

# โหลด models ทั้งหมด
from app.db.database import Base
import app.models  # noqa: registers all models

def check_schema(database_url: str):
    engine = create_engine(database_url)
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())

    missing_tables = []
    missing_columns = []
    ok_tables = []

    for table_name, table in Base.metadata.tables.items():
        if table_name not in db_tables:
            missing_tables.append(table_name)
            continue

        db_cols = {col["name"]: col for col in inspector.get_columns(table_name)}
        model_cols = {col.name: col for col in table.columns}

        table_missing = []
        for col_name in model_cols:
            if col_name not in db_cols:
                table_missing.append(col_name)

        if table_missing:
            missing_columns.append((table_name, table_missing))
        else:
            ok_tables.append(table_name)

    # รายงานผล
    print(f"\n{'='*60}")
    print(f"  Schema Check: {database_url.split('@')[-1]}")
    print(f"{'='*60}")

    if missing_tables:
        print(f"\n❌ MISSING TABLES ({len(missing_tables)}):")
        for t in sorted(missing_tables):
            print(f"   - {t}")
    else:
        print(f"\n✅ All tables exist ({len(ok_tables)} tables)")

    if missing_columns:
        print(f"\n❌ MISSING COLUMNS:")
        for table_name, cols in sorted(missing_columns):
            print(f"\n   Table: {table_name}")
            for col in cols:
                print(f"      - {col}")
        print(f"\n{'='*60}")
        print("SQL to fix:")
        for table_name, cols in sorted(missing_columns):
            model_table = Base.metadata.tables[table_name]
            for col_name in cols:
                col = model_table.columns[col_name]
                col_type = col.type.compile(engine.dialect)
                nullable = "" if col.nullable else " NOT NULL"
                default = f" DEFAULT {col.server_default.arg}" if col.server_default else ""
                print(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {col_name} {col_type}{nullable}{default};")
    else:
        print(f"✅ All columns exist")

    print(f"{'='*60}\n")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    check_schema(db_url)

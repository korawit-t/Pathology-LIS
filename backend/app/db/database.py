import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# 1. โหลดค่าจาก .env
load_dotenv()

# 2. อ่านค่า DATABASE_URL
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# (Optional) ดัก Error ถ้าลืมใส่ใน .env
if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("Missing DATABASE_URL in .env file")

# 3. สร้าง Engine
# หมายเหตุ: SQLAlchemy รุ่นใหม่ๆ รองรับ postgresql:// ปกติ
# แต่ถ้าใช้ driver เฉพาะ อาจต้องใช้ postgresql+psycopg2:// ตามใน .env ของคุณ
engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
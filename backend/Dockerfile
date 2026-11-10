# ใช้ Python Image ที่เบาและเสถียร
# Pinned to the Debian release (trixie) as well as the Python minor: plain
# `3.14-slim` moves to the next Debian when it ships, where the apt package
# names below are not guaranteed to exist, and the build would then break on
# the first fresh install after that rather than on a change made here.
FROM python:3.14-slim-trixie

# ตั้งค่า Working Directory
WORKDIR /app

# ป้องกันการสร้างไฟล์ .pyc และให้ Log แสดงผลทันที
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# The app keeps naive Asia/Bangkok wall-clock times (app/utils/time.py), and a
# container's clock is UTC unless told otherwise: date.today() in an age
# calculation would otherwise roll over at 07:00 local time.
ENV TZ=Asia/Bangkok

# 🌟 ติดตั้ง Dependencies สำหรับ:
# 1. PostgreSQL (gcc, libpq-dev)
# 2. WeasyPrint (libpango, libcairo, libgdk-pixbuf, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    libffi-dev \
    # WeasyPrint Stack
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libgdk-pixbuf2.0-bin \
    # Image support (แนะนำให้เพิ่ม)
    libjpeg-dev \
    libopenjp2-7-dev \
    # Font & Mime
    fontconfig \
    shared-mime-info \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# คัดลอก requirements และติดตั้ง
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# คัดลอกโค้ดทั้งหมด
COPY . .

RUN mkdir -p /usr/share/fonts/truetype/custom
COPY assets/fonts /usr/share/fonts/truetype/custom/
RUN fc-cache -fv

# ตรวจสอบว่า Container เห็นฟอนต์จริงไหมตอน Build (ช่วย Debug ได้ดีมาก)
RUN fc-list | grep "Sarabun"

# 🔒 SECURITY: run as non-root to limit blast radius if the process is compromised.
#    uploads/ is created here so the uploads_data volume that docker-compose.yml
#    mounts over it is initialised owned by appuser, not root.
RUN groupadd --gid 1001 appgroup \
    && useradd --uid 1001 --gid appgroup --shell /bin/sh --no-create-home appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appgroup /app
USER appuser

# 🔒 SECURITY: production CMD does NOT run seed_data.py.
#   - `alembic upgrade head` is a no-op at head, so it's safe on restart; under
#     docker compose the `migrate` service has already run it as the owner.
#   - seed_data.py inserts a default admin (admin/admin1234, marked as
#     a temporary password). Running it on every container start would
#     re-attempt to seed on every restart and ship a known credential
#     into prod. The dev compose override re-adds the seed for local use.
#   - First-time prod seed is run explicitly:
#       docker compose -f docker-compose.yml run --rm backend python seed_data.py
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
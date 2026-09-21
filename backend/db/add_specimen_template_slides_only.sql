-- Adds the "slides only" flag to specimen types. A non-gyne case whose
-- specimen type has it set has no leftover specimen in the fridge, so it is
-- left out of Specimen Storage and Specimen Disposal altogether.
--
-- Defaults to false, so nothing changes until an admin ticks the type in
-- Master Data > Cytology Specimen Types.
--
-- Alembic revision 8f4f801b4e2c
-- ถ้าแปะ SQL นี้ตรงเข้า production ต้อง `alembic stamp head` ตามหลัง
-- ไม่งั้นรอบ deploy ถัดไปจะพยายามรัน migration ซ้ำแล้ว crash

ALTER TABLE specimen_templates
  ADD COLUMN IF NOT EXISTS slides_only BOOLEAN NOT NULL DEFAULT false;

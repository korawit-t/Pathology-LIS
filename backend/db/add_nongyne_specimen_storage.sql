-- Adds the non-gyne specimen storage step: where each leftover specimen is
-- kept, who put it there, and when.
--
-- Disposal now depends on it — app/crud/nongyne_specimen_disposal_batch.create_batch
-- refuses a case with no recorded location, the same way the surgical flow does.
--
-- Alembic revision 3ebce957f931
-- ถ้าแปะ SQL นี้ตรงเข้า production ต้อง `alembic stamp head` ตามหลัง
-- ไม่งั้นรอบ deploy ถัดไปจะพยายามรัน migration ซ้ำแล้ว crash

ALTER TABLE nongyne_cytology_cases
  ADD COLUMN IF NOT EXISTS specimen_storage_status VARCHAR,
  ADD COLUMN IF NOT EXISTS specimen_storage_container VARCHAR,
  ADD COLUMN IF NOT EXISTS specimen_storage_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS specimen_storage_by_id INTEGER;

ALTER TABLE nongyne_cytology_cases
  DROP CONSTRAINT IF EXISTS fk_nongyne_cytology_cases_specimen_storage_by_id_users;
ALTER TABLE nongyne_cytology_cases
  ADD CONSTRAINT fk_nongyne_cytology_cases_specimen_storage_by_id_users
  FOREIGN KEY (specimen_storage_by_id) REFERENCES users(id);

ALTER TABLE nongyne_specimen_disposal_batch_items
  ADD COLUMN IF NOT EXISTS container_snapshot VARCHAR;

-- การทิ้งบังคับว่าต้องจัดเก็บก่อน เคสที่ออกผลแล้วและยังไม่ถูกทำลายนั้นของจริง
-- อยู่ในตู้เย็นมาตลอด เพียงแต่ระบบไม่เคยมีที่ให้บันทึก — ถ้าไม่รันบรรทัดนี้
-- ทุกเคสที่ค้างอยู่ในคิวทิ้งจะกลายเป็นทิ้งไม่ได้ทันทีที่ deploy
UPDATE nongyne_cytology_cases
   SET specimen_storage_status = 'Stored'
 WHERE specimen_storage_status IS NULL
   AND status = 'published'
   AND discard_status = false
   AND is_cancelled = false;

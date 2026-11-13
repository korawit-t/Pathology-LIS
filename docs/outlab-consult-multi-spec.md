# Spec: Outlab Consult หลายครั้งต่อเคส

> เขียนเมื่อ 2026-11-11 · **เฟส 1 implement แล้ว** บน branch `feat/outlab-consult-multi`
> (migration `8f3638ca7ca8`) · เฟส 2–3 ยังไม่ได้ทำ

---

## สรุป

- **ไม่ออก accession ใหม่** ผล consult ยังออกเป็นรายงานรอบใหม่บนเลขเดิม (แนวทาง addendum
  ที่ LIS ส่วนใหญ่ใช้กับการส่งปรึกษาออก)
- สถานะ consult ย้ายจากคอลัมน์บนเคสไปเป็นตาราง `outlab_consult_requests` โดย 1 เคสมีได้หลายรอบ
- consult แต่ละรอบมีเลข `{accession_no}-C{seq}` เช่น `S26-01234-C1`, `S26-01234-C2`
- ทั้ง surgical, gyne และ non-gyne ใช้ตารางเดียวกันและกติกาเดียวกัน

## สิ่งที่ตัดสินใจแล้ว (2026-11-11)

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | รูปแบบเลข consult | `S26-01234-C1` |
| 2 | ส่งพร้อมกันหลายที่ | ไม่ได้ — มี consult ที่ยังไม่จบได้ทีละ 1 รอบต่อเคส |
| 3 | บังคับ approve ก่อนปล่อยรายงาน | บังคับ (ทั้ง 3 case type) |
| 4 | หน้าปกบนรายงานรอบล่าสุด | แสดงทุกรอบที่ approve แล้ว เรียงตาม seq |
| 5 | เก็บ concordance | เก็บ (คอลัมน์ nullable ยังไม่มีช่องกรอกใน UI) |
| 6 | `consult_report_out_at` | ไม่ได้แตะ ยังอยู่บนเคสเหมือนเดิม |
| 7 | consult ของ gyne/non-gyne ขึ้นบนรายงาน | ขึ้น (ผลจากข้อ 4 ที่ใช้กับทุก case type) |

ข้อ 5–7 ไม่ได้ถามตรงๆ ใช้ค่าตามข้อเสนอเดิม

---

## ปัญหาของดีไซน์เดิม และสถานะ

| # | ปัญหา | สถานะ |
|---|---|---|
| 1 | consult ได้ครั้งเดียวตลอดอายุเคส | แก้แล้ว (backend) — ปุ่ม "ขอ consult อีกครั้ง" อยู่ในเฟส 2 |
| 2 | อัปโหลด PDF ใหม่ลบไฟล์เก่า ไม่มีประวัติ | แก้แล้ว — แต่ละรอบเก็บไฟล์ของตัวเอง (ในรอบเดียวกันยังแทนที่ได้จนกว่าจะปล่อย) |
| 3 | gyne/non-gyne ไม่มี approve และไม่พิมพ์หน้าปก | แก้แล้ว — ปุ่ม Approve อยู่ใน `ConsultPdfPanel` |
| 4 | clinician/hospital อัปโหลดหรือลบ consult PDF ได้ | แก้แล้ว — `CAN_UPLOAD_OUTLAB_RESULT` บน endpoint เดิมทั้ง 3 type |
| 5 | dispatch ตั้งทุก block ของเคสเป็น `consult` และไม่คืนสถานะตอนคืน block | ยังไม่แก้ (นอกขอบเขต) |
| 6 | รายงานทุกรอบเก็บ base64 ของ consult PDF ซ้ำ และ rasterize ทุกครั้งที่ preview | แก้แล้ว — rasterize ครั้งเดียวตอน approve เก็บที่แถว consult |
| 7 | `consult_report_out_at` ไม่มีช่องกรอกใน UI | ยังเหมือนเดิม |

---

## Data model (ตามที่ implement)

### `outlab_consult_requests` — `app/models/outlab_consult_request.py`

Polymorphic (`case_type` + `case_id` เป็น int ธรรมดา) แบบเดียวกับ `InternalConsult`

คอลัมน์หลัก: `seq`, `consult_no`, `status`, `reason`, `destination_lab`, `requested_by_id/at`,
`result_pdf_path`, `result_received_at`, `result_uploaded_by_id`, `external_ref`,
`external_pathologist`, `concordance`, `approved_by_id/at`, `pdf_thumbnails` (JSON ของ data URI
ทุกหน้า), `reported_in_report_id`, `reported_at`, `cancelled_*`

- unique `(case_type, case_id, seq)`
- `consult_no` เป็น index แบบ**ไม่ unique** เพราะ prefix ของ accession ตั้งได้ต่อ site
  ถ้าสอง case type ใช้ prefix เดียวกัน unique index จะทำให้ publish ล้ม

### ตารางที่แก้

- `outlab_consult_run_details.consult_id` → FK `ON DELETE SET NULL`
  (1 consult อยู่ได้หลาย run กรณีส่งชิ้นเนื้อเพิ่มภายหลัง)
- `surgical_reports` / `gyne_cyto_reports` / `nongyne_cyto_reports` `.consult_ids_snapshot` (JSON)
  - NULL = รายงานที่ออกก่อนมีตาราง → surgical ใช้ `consult_pdf_*_snapshot` เดิม
  - รายงานใหม่เขียน `consult_pdf_*_snapshot` เป็น NULL

### คอลัมน์ consult บนเคส = cache ของรอบล่าสุด

เขียนผ่าน `crud.outlab_consult_request.sync_case_summary` เท่านั้น ส่วน case PATCH
จะถูกดึงฟิลด์ consult ออก (`apply_case_patch`) และเขียน `consult_status` ตรงๆ ไม่ได้แล้ว

| รอบล่าสุด (ไม่นับ cancelled) | `consult_status` |
|---|---|
| ไม่มี | `None` และ `is_out_lab_consult = False` |
| `requested` | `pending` |
| `sent` / `result_received` / `approved` | `processing` |
| `reported` | `received` |

---

## State machine

```
requested ──run──▶ sent ──PDF──▶ result_received ──approve──▶ approved ──publish──▶ reported
    │               │                  ▲      │                   │
  cancel        ลบ run              เปลี่ยน/ลบ PDF ได้ (ล้าง approval) จนกว่าจะ reported
    ▼               ▼
 cancelled      requested
```

- **cancel** ได้เฉพาะ `requested`
- **ลบ run** คืน consult เป็น `requested` แต่จะ**ปฏิเสธ (409)** ถ้ารอบนั้นมีผลแล้ว
  และถ้ายังมี run อื่นถือ consult นี้อยู่ จะคงเป็น `sent`
- **ส่ง run ซ้ำ**ขณะ `sent` = ส่งชิ้นเนื้อเพิ่มให้รอบเดิม ส่วนตอนที่ผลกลับมาแล้วจะได้ 409 (ต้องขอรอบใหม่)
- **อัปโหลดผลตอน `requested`** ทำได้ เผื่อกรณีส่งนอกระบบโดยไม่มี run
- **เปลี่ยนหรือลบ PDF ล้าง approval** เพราะผู้ approve เซ็นไฟล์ที่ตัวเองเห็น ไม่ได้มี endpoint unapprove แยก
- **`reported` แล้วแก้ไม่ได้** ยกเว้น `concordance` ซึ่งบันทึกย้อนหลังได้
- flag `is_out_lab_consult=true` แบบเดิม (bulk-save / publish / PATCH) **เปิดรอบใหม่เฉพาะเมื่อเคสยังไม่เคยมี consult**
  เพราะ toggle ยังค้างเป็น true หลังรอบแรกจบและถูกส่งซ้ำทุกครั้งที่บันทึก รอบถัดไปต้องขอผ่าน
  `POST /outlab-consults` หรือ `POST /surgical-cases/{id}/outlab-consult`

---

## การออกรายงาน

- `assert_releasable` ถูกเรียกก่อน finalize/publish ทั้ง 3 type
  - consult `sent` (ผลยังไม่มา) → **423**
  - `result_received` (ยังไม่ approve) → **409**
- ตอนออกรายงาน: consult ที่ `approved` ทั้งหมด → `reported` (`mark_released`) ณ จุดเดิมที่ตั้ง `received`
  - surgical: ตอน `should_move_to_approval` · gyne/non-gyne: ใน `publish_*_report`
  - gyne `complete_gyne_review` **ไม่**ปล่อย consult เพราะรายงานที่ publish ตรงนั้น snapshot ไว้ก่อนแล้ว
- snapshot `consult_ids_snapshot` = ทุกรอบที่ `approved` / `reported` เรียงตาม seq
- PDF: `services/consult_cover.prepend_consult_covers` ทำหน้าปก 1 ชุดต่อรอบ
  (หัวข้อแสดง `consult_no`, lab ปลายทาง, ref, ผู้อ่าน, วันรับผล)
  ใช้ทั้งใน download, preview และ HIS export ของทั้ง 3 type

---

## API

Router ใหม่ `/outlab-consults` (`app/routers/outlab_consult_request.py`, mount `_INTERNAL_ONLY`, ตรวจ hospital scope ของเคส)

| Method | Path | Gate |
|---|---|---|
| GET | `/outlab-consults?case_type=&case_id=` | internal staff |
| POST | `/outlab-consults` | `CAN_REQUEST_CONSULT` |
| POST | `/outlab-consults/{id}/cancel` | `CAN_REQUEST_CONSULT` |
| PATCH | `/outlab-consults/{id}` | `CAN_APPROVE_OUTLAB_RESULT` |
| POST / DELETE | `/outlab-consults/{id}/result-pdf` | `CAN_UPLOAD_OUTLAB_RESULT` |
| GET | `/outlab-consults/{id}/result-pdf` | internal staff |
| POST | `/outlab-consults/{id}/approve` | `CAN_APPROVE_OUTLAB_RESULT` |

Response ไม่ส่ง `result_pdf_path` และ thumbnail ออกไป ส่งแค่ `has_result_pdf`

Endpoint เดิมต่อเคส (`/{case_id}/consult-pdf*`, `/{case_id}/outlab-consult`) ยังใช้ได้ และทำงานกับรอบที่ยังไม่จบ
(ถ้าไม่มีก็ใช้รอบล่าสุด) ส่วน run detail response มี `consult_id` / `consult_no` เพิ่ม

---

## Migration

- `alembic/versions/8f3638ca7ca8_…py` — autogenerate + backfill (ทดสอบ upgrade → downgrade → upgrade และ `alembic check` แล้ว)
- `alembic/versions/8f3638ca7ca8_manual.sql` — raw SQL แบบรันซ้ำได้ สำหรับ patch prod ด้วยมือ
  (หลังรันต้อง `alembic stamp 8f3638ca7ca8`)
- backfill: ทุกเคสที่ flag หรือเคย dispatch → รอบ 1 โดย map สถานะดังนี้

| คอลัมน์บนเคส | รอบ 1 |
|---|---|
| `received` | `reported` |
| `processing` + PDF + ผู้ approve | `approved` |
| `processing` + PDF | `result_received` |
| `processing` | `sent` |
| อื่นๆ | `requested` |

  - เคสที่เคย dispatch โดยไม่ได้ flag จะถูกตั้ง `is_out_lab_consult = TRUE`
  - run lines ถูกผูกกับรอบ 1
- **ผลกระทบตอน deploy:** เคส gyne/non-gyne และ surgical ที่ PDF กลับมาแล้วแต่ยังไม่ approve
  จะ publish ไม่ได้จนกว่าจะกด Approve
- **ผลกระทบตอนออกรายงาน:** consult เก่าของ gyne/non-gyne (`reported`, ไม่มีผู้ approve)
  จะเริ่มขึ้นเป็นหน้าปกบนรายงาน revise รอบถัดไป แต่ไม่มีบรรทัด "Digitally Signed by"

นับขนาดข้อมูลบน prod ก่อน deploy:

```sql
SELECT 'surgical' t, consult_status, (consult_pdf_path IS NOT NULL) has_pdf, count(*)
  FROM surgical_cases WHERE is_out_lab_consult OR consult_status IS NOT NULL GROUP BY 2,3
UNION ALL
SELECT 'gyne', consult_status, (consult_pdf_path IS NOT NULL), count(*)
  FROM gyne_cytology_cases WHERE is_out_lab_consult OR consult_status IS NOT NULL GROUP BY 2,3
UNION ALL
SELECT 'nongyne', consult_status, (consult_pdf_path IS NOT NULL), count(*)
  FROM nongyne_cytology_cases WHERE is_out_lab_consult OR consult_status IS NOT NULL GROUP BY 2,3;
```

---

## เฟสงาน

**เฟส 1 — เสร็จ** backend ทั้งหมดด้านบน และ frontend เท่าที่จำเป็น: `ConsultPdfPanel` แสดงเลขรอบ,
สถานะ approve และปุ่ม Approve บนหน้า diagnosis ของ gyne/non-gyne ทั้ง 4 หน้า
(`consultCaseType` prop) เพราะ approve กลายเป็นเงื่อนไขบังคับ ส่วน surgical มีปุ่ม Sign Off
ใน `ConsultPdfModal` ที่ approve ก่อน finalize อยู่แล้ว

**เฟส 2 — UI (เสร็จ)**
- ✅ เคสมีคอลัมน์ cache `consult_no` (รอบล่าสุด, migration `318aaf388aec`) และแท็บ External Consult
  ของ My Worklist แสดงรอบเป็น tag `C2` ในช่อง Consult — ช่อง Accession No. คงเป็นเลขเคสเหมือนเดิม (#375)
- ✅ ขอ consult รอบใหม่เมื่อรอบล่าสุดเป็น `reported`:
  surgical ใช้ปุ่ม **Send again** ใน Case Actions (`CaseFlagManager`, เหตุผลเริ่มว่าง),
  gyne/non-gyne ใช้ปุ่ม **Request another consult** ใน panel รอบ
- ✅ `OutlabConsultRounds` — ตารางทุกรอบบนหน้า diagnosis ทั้ง 3 type (รอบ, สถานะ, lab ปลายทาง + ref,
  ผู้ขอ/เหตุผล, วันรับผล/ผู้ approve, ผู้อ่าน + concordance, เปิด PDF ของแต่ละรอบ)
  และ modal แก้ ref / ผู้อ่าน / concordance — รอบที่ปล่อยแล้วแก้ได้แค่ concordance
- ✅ tag รอบ (`ConsultRoundTag`) ในคิว Send to Consult, ตาราง run, Block tracking, Case tracker
  และ consult run ในหน้า Unified Accession
- ✅ จำนวนรอบ (`liveRoundCount` — ไม่นับรอบที่ยกเลิก เพราะยกเลิกได้แค่ก่อน dispatch แต่ยังกินเลข
  จึง `C3` อาจเท่ากับ 2 รอบ): Badge บนหัว panel รอบ + "N cancelled", และลิงก์ "N rounds"
  ใน Case Actions ของ surgical ที่เลื่อนไปที่ panel — หน้า Sign-out ไม่แสดงประวัติรอบ

**เฟส 3 — เก็บกวาด**
- ย้าย frontend ไปอ่านจาก consult rows แล้ว drop คอลัมน์ consult บนเคส
- ลบ endpoint ต่อเคสแบบเดิม

---

## นอกขอบเขต

- รับปรึกษาจาก รพ.อื่น (incoming) — ควรออก accession ใหม่
- Molecular (`M` accession ถูกต้องแล้ว)
- `is_out_lab` ของ gyne/non-gyne (ส่งทั้งเคสไปอ่านข้างนอก)
- คิดค่าส่งปรึกษาเข้า HIS
- block status ข้อ 5

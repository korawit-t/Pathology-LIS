# Spec: Colorectal Cancer Case Trigger (Phase 0 — detection only)

> เอกสารนี้เป็น **prompt/spec สำหรับงานในอนาคต** ยังไม่ได้ implement
> เขียนไว้เพื่อให้ session ถัดไปไม่ต้องสำรวจ DB ซ้ำ
> เขียนเมื่อ 2026-08-13 · ข้อมูลอ้างอิงจาก production DB ช่วง 2026-06-15 → 2026-08-13 (615 เคส)

---

## สิ่งที่ต้องทำ (สั้น)

สร้าง **ตัวจับสัญญาณ** ว่าเคส surgical เป็นมะเร็งลำไส้ใหญ่/ทวารหนัก และเป็น "ชิ้นวินิจฉัย"
(เปิดนาฬิกา) หรือ "ชิ้นผ่าตัด" (ปิดนาฬิกา) โดยใช้สัญญาณ 3 ตัวที่มีอยู่แล้วในระบบ:

1. `surgical_cases.has_malignancy`
2. `surgical_specimens.specimen_name`
3. `procedure_intent` — ฟิลด์ใหม่ที่ต้องเพิ่ม (ดูด้านล่าง)

**ขอบเขตของงานนี้คือการจับสัญญาณและเก็บผลไว้เท่านั้น** ระบบ tracking / worklist /
การแจ้งเตือน / การนับ waiting time เป็นงานคนละชิ้น จะทำก่อนหรือหลังก็ได้
งานชิ้นนี้ต้องไม่ไปแตะส่วนนั้น

---

## เจตนาของ Phase 0: manual-first

**ห้ามให้ระบบตัดสินใจแทนคนในเฟสนี้** ผลของตัวจับสัญญาณคือ "ข้อเสนอ" ที่รอคนยืนยัน
เท่านั้น เหตุผล: ระบบก่อนหน้านี้ (`tumor_registries`) ล้มเหลวเพราะไปเพิ่มงานให้
pathologist โดยที่คนกรอกไม่ได้ประโยชน์กลับ — ปัจจุบันมี **0 แถว** ในฐานข้อมูล production

หลักที่ต้องยึด:

- **pathologist ต้องไม่มีงานเพิ่มแม้แต่คลิกเดียว** ใช้เฉพาะข้อมูลที่กรอกอยู่แล้ววันนี้
- ผลการจับสัญญาณเข้าสถานะ `pending_review` เสมอ ไม่มี auto-confirm
- ยอม over-trigger ดีกว่า miss เพราะมีคนคัดออกที่ปลายทาง
- ต้องมีทางกด "ไม่ใช่" และทางกดเพิ่มเคสที่ระบบจับไม่ได้ด้วยมือ

---

## ผลสำรวจ production DB (ใช้เป็นฐานการออกแบบ — ไม่ต้องรันซ้ำ)

### ปริมาณงาน

| รายการ | ค่า |
|---|---|
| surgical cases ทั้งหมด (2 เดือน) | 615 |
| `has_malignancy = true` | 79 |
| `has_malignancy = false` | 453 |
| `has_malignancy = null` (ยังไม่รายงาน) | 83 |
| เคส colorectal — biopsy/polypectomy | 74 (มะเร็ง 16) |
| เคส colorectal — resection | 18 (มะเร็ง 11) |

colorectal = **27 เคส** จาก 79 เคสมะเร็ง (**34%** — กลุ่มใหญ่ที่สุด)
รองลงมา HPB 18, breast 10, GU 6, lymph node 5, upper GI 4

ประมาณการ: **มะเร็งลำไส้ใหญ่ใหม่ ~8 เคส/เดือน (~96/ปี)**

### คุณภาพของ `has_malignancy`

| has_malignancy | ข้อความ dx ปฏิเสธมะเร็ง | n |
|---|---|---|
| true | ไม่ | 76 ✅ |
| false | **ใช่** | 41 ✅ ถูกต้อง |
| false | ไม่ | **11** ← พลาดจริง ~12% |
| true | ใช่ | 3 (เคสหลายชิ้น) |

**ข้อสำคัญ: การพลาดกระจุกอยู่ที่ชิ้น resection** ตัวอย่างที่ยืนยันแล้ว —
`S26-01867` (Adenocarcinoma, Tumor Site: Rectum, APR) และ `S26-01781`
(Adenocarcioma [สะกดผิดในระบบจริง], Tumor Site: Sigmoid, LAR) ทั้งคู่
`has_malignancy = false`

→ **ขา "ปิดนาฬิกา" ห้ามพึ่ง `has_malignancy`** ให้ดูแค่ว่ามีชิ้น colorectal resection
ของ HN นั้นเข้ามาก็พอ

### ความสม่ำเสมอของ `specimen_name`

- specimen ทั้งหมด 818 ชิ้น / ชื่อไม่ซ้ำ 245 แบบ / ตรง template **80.9%**
- เฉพาะ colorectal: 121 ชิ้น / ตรง template **73.6%** (89/121)
- `specimen_templates` มี 172 แถว (category `surgical`) — colorectal 16 แถว

รูปแบบชื่อคือ `{เนื้อเยื่อ}, {ตำแหน่ง}, {หัตถการ}` โดย**หัตถการอยู่ field สุดท้ายเสมอ**

variant ที่พบจริงและต้องรองรับ:
- `Colonic mucosa, ...` (ตรง template) vs `Colon mucosa, ...` (พิมพ์เอง) — ความหมายเดียวกัน
- `colonoscopy biopsy` vs `colonoscopy with biopsy` vs `colonoscopic with biopsy`
- `colonoscope  with polypectomy` (มีเว้นวรรคสองครั้ง)

### field สุดท้ายของ specimen colorectal — พบทั้งหมด 16 แบบ

```
diagnostic (102 ชิ้น):
  colonoscopy biopsy                 92
  colonoscopy with biopsy             5
  colonoscopic with biopsy            2
  polypectomy                         2
  colonoscope  with polypectomy       1

resection (17 ชิ้น):
  hemicolectomy                       5
  colectomy                           4
  laparoscopic abdominoperineal resection (APR)   2
  abdominoperineal resection          2
  right hemicolectomy                 1
  low anterior resection (LAR)        1
  Low anterior resection              1
  laparoscopic anterior resection (LAR)  1
  rectal resection                    1

กำกวม — ต้องให้คนตัดสิน:
  laparoscopic ultrasound augmented reality (LUS-AR)   1   ← น่าจะคีย์ผิด
  wedge resection of liver tissue and duodenum         1   ← เป็นชิ้นพ่วงของ hemicolectomy
```

### waiting time ปัจจุบัน (ข้อมูลที่เป็นเหตุผลของทั้งโปรเจกต์)

จับคู่ biopsy(มะเร็ง) → resection ด้วย HN เดียวกัน จาก 16 เคส **จับคู่ได้ 4**:

| HN | biopsy | resection | วัน |
|---|---|---|---|
| 0377750 | S26-01859 | S26-01929 | 8 |
| 0038058 | S26-01607 | S26-01781 | 15 |
| 0032202 | S26-01501 | S26-01883 | **34** เกิน |
| 0266121 | S26-01520 | S26-02020 | **46** เกิน |

อีก 12 เคสไม่มี resection ในระบบ ในจำนวนนี้ 6 เคสเกิน 28 วันแล้ว ณ 13 ส.ค. 2026
(S26-01749, S26-01620, S26-01583, S26-01576, S26-01560, S26-01461)

⚠️ **"ไม่มี resection ใน LIS" ไม่เท่ากับ "ไม่ได้ผ่าตัด"** อาจไปผ่าที่อื่น, เป็น rectal
ที่ให้ CCRT ก่อน (ซึ่งเป็น standard of care ไม่ใช่ความล่าช้า), หรือ stage 4 ที่ไม่ผ่า
ระบบต้องมีช่องให้ระบุเหตุผลการตัดออก ห้ามนับรวมเป็น "ผ่าตัดล่าช้า" ทั้งหมด

---

## สิ่งที่ต้อง implement

### 1. เพิ่ม 2 คอลัมน์ใน `specimen_templates`

```python
# app/models/specimen_template.py
organ_group = Column(String, nullable=True, index=True,
                     comment="colorectal | breast | hpb | ... — ใช้จับกลุ่มมะเร็ง")
procedure_intent = Column(String, nullable=True,
                          comment="diagnostic | resection — biopsy เปิดนาฬิกา, resection ปิด")
```

Raw SQL สำหรับ apply กับ production โดยตรง:

```sql
ALTER TABLE specimen_templates ADD COLUMN IF NOT EXISTS organ_group VARCHAR;
ALTER TABLE specimen_templates ADD COLUMN IF NOT EXISTS procedure_intent VARCHAR;
CREATE INDEX IF NOT EXISTS ix_specimen_templates_organ_group
  ON specimen_templates (organ_group);
```

ทำ Alembic revision ด้วย `--autogenerate` และรัน `alembic heads` ก่อน (ต้องมี head เดียว)

### 2. เปิดให้ admin ติดธงใน UI ที่มีอยู่แล้ว

`frontend/src/components/SpecimenTypeManager.tsx` — เพิ่ม 2 คอลัมน์ให้แก้ได้
งานติดธงเป็น one-time task กับ 172 แถว ไม่ใช่งานรายเคส

### 3. Resolver — ตัดสินจาก specimen ชิ้นเดียว

สร้าง `app/services/` หรือ `app/cancer_pathway/` (แล้วแต่ว่าตอนนั้นตัดสินใจยังไง)
ฟังก์ชันรับ `specimen_name` คืน `(organ_group, procedure_intent, source)`

ลำดับการตัดสิน:

1. **ชั้นหลัก — match template แบบเป๊ะ** `lower(btrim(name))` เทียบกับ
   `specimen_templates` category `surgical` → เอา `organ_group`/`procedure_intent`
   ของแถวนั้น (ครอบคลุม ~74% ของ colorectal) `source = "template"`

2. **ชั้นสำรอง — regex** ใช้เมื่อไม่ตรง template ใด ๆ `source = "regex"`

   organ (ต้องมี word boundary `\y` และใช้เฉพาะคำที่เป็นอวัยวะ ห้ามใส่ชื่อหัตถการ):
   ```
   \y(colon|colonic|caecum|cecum|sigmoid|rectum|rectal|rectosigmoid|
      ileocecal|ileocaecal|hemicolectomy|colectomy|sigmoidectomy|proctectomy)\y
   ```

   procedure_intent — ดูเฉพาะ field สุดท้าย (`split_part(name, ',', -1)`):
   ```
   resection  : hemicolectomy | colectomy | abdominoperineal | anterior resection
                | APR | LAR | proctectomy | rectal resection | sigmoidectomy
   diagnostic : biopsy | polypectomy | colonoscop
   ```
   ไม่เข้าทั้งสอง → `None` แล้วให้คนตัดสิน

   **⚠️ กับดักที่พิสูจน์แล้วว่าเกิดจริง — ต้องมี test คุม:**
   - `(colon|rect|...)` ไม่มี `\y` จะจับ `Uterus, total hysterectomy` (`rect` ⊂ hyste**rect**omy)
   - ใส่ `polypectomy` ในชุดคำ organ จะจับ `Nasal polyp, polypectomy`
   - บนรายการ template ที่สะอาดแล้ว regex หยาบให้ false positive **33%**

### 4. จุดที่เรียก

`bulk_save_draft_orchestrator()` ใน `app/crud/surgical_diagnosis.py` (~บรรทัด 239)
คือจุดที่ `has_malignancy` ถูก set — เรียกตัวจับสัญญาณต่อจากตรงนั้นใน transaction เดียวกัน
(มี 2 จุดที่ set `has_malignancy` ในฟังก์ชันนี้ ทั้ง out-lab consult path และ path ปกติ)

**ห้ามยิง HTTP ใน transaction** ทำแบบเดียวกับ `app/his_export/` คือ insert แถวลง
ตารางของตัวเองแบบ synchronous แล้วให้ตัวอื่นมาอ่านทีหลัง

### 5. เงื่อนไขการจับสัญญาณ

```
เปิดนาฬิกา (candidate):
    has_malignancy = true
    AND มี specimen ที่ organ_group = 'colorectal'
    AND specimen นั้น procedure_intent = 'diagnostic'
    → status = pending_review

ปิดนาฬิกา:
    มี specimen ที่ organ_group = 'colorectal'
    AND procedure_intent = 'resection'
    → ส่งสัญญาณว่า HN นี้มี resection แล้ว (ไม่ต้องดู has_malignancy)
```

การจับคู่ระหว่างสองฝั่งใช้ **HN** ไม่ใช่ `surgical_cases.id`

### 6. เก็บผลไว้ที่ไหน

ตารางใหม่ของตัวเอง **ห้ามเพิ่มคอลัมน์ลง `surgical_cases`** (เพื่อให้แยกออกไปเป็น
โปรแกรมต่างหากได้ทีหลังโดยไม่ต้องรื้อ) อย่างน้อยต้องมี:

`case_id`, `case_type`, `accession_no`, `hn`, `organ_group`, `procedure_intent`,
`detected_at`, `detection_source` (`template`/`regex`/`manual`),
`status` (`pending_review`/`confirmed`/`rejected`),
`reviewed_by_id`, `reviewed_at`, `reject_reason`

`case_type` ใส่ไว้ตั้งแต่แรกเพื่อขยายไป gyne/nongyne ได้ (ดู pattern ใน
`app/models/critical_notification_log.py`)

---

## นอกขอบเขต (อย่าทำในงานนี้)

- การนับ waiting time / due date / KPI
- worklist UI, การแจ้งเตือน, `scheduled_notification_rules`
- การปิดเคสอัตโนมัติ (งานนี้แค่ "ส่งสัญญาณ" ว่ามี resection — ไม่ปิดเอง)
- LLM classifier — ทำได้ทีหลัง ท่อมีอยู่แล้วที่ `app/services/llm_service.py`
- มะเร็งอวัยวะอื่น — โครงต้องรองรับ แต่ยังไม่ต้องติดธง
- `tumor_registries` / ICD-O-3 — **ห้ามพึ่ง** มี 0 แถวใน production

---

## เกณฑ์ว่าเสร็จ

- [ ] Alembic revision (`--autogenerate`) + raw SQL ข้างบน
- [ ] admin ติดธง `organ_group`/`procedure_intent` ได้จาก SpecimenTypeManager
- [ ] resolver มี test ครอบ 16 สตริงหัตถการจริงในเอกสารนี้
- [ ] resolver มี test ยืนยันว่า **ไม่** จับ `Uterus, total hysterectomy` และ
      `Nasal polyp, polypectomy`
- [ ] resolver มี test ครอบ variant `Colon mucosa` vs `Colonic mucosa`
- [ ] backfill: รันกับ 615 เคสที่มีอยู่ ต้องได้ ~16 candidate และ ~18 resection
      แล้วเทียบตาราง waiting time ข้างบนด้วยมือ
- [ ] `pytest`, `ruff check .`, `tsc --noEmit`, `eslint` ผ่าน
- [ ] pathologist ไม่มีขั้นตอนเพิ่มแม้แต่คลิกเดียว

---

## คำสั่ง SQL สำหรับสำรวจซ้ำ (ถ้าต้องการ)

สคริปต์สำรวจอยู่ที่ scratchpad ของ session 2026-08-13 — ถ้าหาย เขียนใหม่ได้จาก
สาระในเอกสารนี้ ใช้ `DATABASE_URL` จาก `backend/.env` (dev มี 4 เคส seed เท่านั้น
production อยู่คนละเครื่อง)

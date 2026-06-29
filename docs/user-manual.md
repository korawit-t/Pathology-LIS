# คู่มือการใช้งาน Pathology LIS

**ระบบสารสนเทศห้องปฏิบัติการพยาธิวิทยา**

> เวอร์ชัน 2026 | พัฒนาโดย Korawit Tawinkan

---

## สารบัญ

1. [การเข้าสู่ระบบ (Login)](#1-การเข้าสู่ระบบ-login)
2. [ภาพรวมของระบบ](#2-ภาพรวมของระบบ)
3. [บทบาทผู้ใช้งาน (Roles)](#3-บทบาทผู้ใช้งาน-roles)
4. [เมนูหลักตามบทบาท](#4-เมนูหลักตามบทบาท)
5. [Front Desk — Accession (รับตัวอย่าง)](#5-front-desk--accession-รับตัวอย่าง)
6. [Surgical Pathology Workflow](#6-surgical-pathology-workflow)
7. [Histology Workflow](#7-histology-workflow)
8. [Gyne Cytology Workflow](#8-gyne-cytology-workflow)
9. [Non-Gyne Cytology Workflow](#9-non-gyne-cytology-workflow)
10. [Diagnosis — Pathologist Worklist](#10-diagnosis--pathologist-worklist)
11. [Approval — การอนุมัติรายงาน](#11-approval--การอนุมัติรายงาน)
12. [Report Archive — คลังรายงาน](#12-report-archive--คลังรายงาน)
13. [Administration](#13-administration)
14. [IT Administration](#14-it-administration)
15. [คำถามที่พบบ่อย (FAQ)](#15-คำถามที่พบบ่อย-faq)

---

## 1. การเข้าสู่ระบบ (Login)

### 1.1 เปิดระบบ

เปิดเว็บเบราว์เซอร์แล้วเข้าไปที่ URL ของระบบ เช่น:

```
http://<ชื่อเซิร์ฟเวอร์>/<hospital-slug>/login
```

> เบราว์เซอร์ที่แนะนำ: Google Chrome หรือ Microsoft Edge เวอร์ชันล่าสุด

### 1.2 หน้า Login

เมื่อเปิดหน้า Login จะพบ:

| ส่วนประกอบ | รายละเอียด |
|---|---|
| โลโก้โรงพยาบาล | แสดงตามการตั้งค่าของระบบ |
| ชื่อห้องปฏิบัติการ | แสดงทั้งภาษาไทยและภาษาอังกฤษ |
| ช่อง Username | กรอกชื่อผู้ใช้งานที่ได้รับจากผู้ดูแลระบบ |
| ช่อง Password | กรอกรหัสผ่าน (ตัวอักษรถูกซ่อน) |
| ปุ่ม Login | กดเพื่อเข้าสู่ระบบ |

### 1.3 ขั้นตอนการ Login

1. กรอก **Username** ในช่องแรก
2. กรอก **Password** ในช่องที่สอง
3. กดปุ่ม **Login** หรือกด **Enter**
4. ระบบจะตรวจสอบสิทธิ์และนำท่านไปยังหน้าหลักตามบทบาท

### 1.4 กรณีพิเศษ

#### รหัสผ่านชั่วคราว (Force Change Password)

หากผู้ดูแลระบบสร้างบัญชีใหม่ให้ท่านและกำหนดรหัสผ่านชั่วคราว ระบบจะแสดงข้อความ:

> **"กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนเข้าใช้งานระบบ"**

ท่านจะถูกนำไปยังหน้าเปลี่ยนรหัสผ่านอัตโนมัติ กรอกรหัสผ่านใหม่ที่ต้องการ แล้วกด Save จึงจะใช้งานระบบได้

#### ข้อความแสดงข้อผิดพลาด

| ข้อความ | สาเหตุ | วิธีแก้ไข |
|---|---|---|
| "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" | Username หรือ Password ผิด | ตรวจสอบตัวพิมพ์ใหญ่-เล็ก แล้วลองใหม่ |
| "เกิดข้อผิดพลาดในการประมวลผลสิทธิ์การใช้งาน" | ระบบมีปัญหาชั่วคราว | รอสักครู่แล้วลองใหม่ หรือแจ้งผู้ดูแลระบบ |

### 1.5 การออกจากระบบ (Logout)

คลิกที่ไอคอนผู้ใช้งานมุมขวาบน แล้วเลือก **Logout** ระบบจะล้าง session และกลับไปยังหน้า Login

---

## 2. ภาพรวมของระบบ

Pathology LIS เป็นระบบจัดการงานห้องปฏิบัติการพยาธิวิทยาครบวงจร ครอบคลุม:

```
รับตัวอย่าง → Grossing → Processing → Sectioning → Staining → Slide Dispatch
     ↓                                                               ↓
  Cytology                                                     Diagnosis
     ↓                                                               ↓
  Diagnosis                                                     Approval
                                                                    ↓
                                                              Report Released
```

### ประเภทตัวอย่าง (Case Types)

| สี | ประเภท | Prefix | ตัวอย่าง |
|---|---|---|---|
| **น้ำเงิน** | Surgical Pathology | S | S26-00001 |
| **เขียว** | Gyne Cytology (Pap smear) | C | C26-00001 |
| **ส้ม** | Non-Gyne Cytology | N | N26-00001 |

---

## 3. บทบาทผู้ใช้งาน (Roles)

ระบบแบ่งผู้ใช้งานออกเป็น 11 บทบาท:

| Role | ชื่อ | หน้าที่หลัก |
|---|---|---|
| `admin` | ผู้ดูแลระบบ | เข้าถึงได้ทุกส่วน |
| `lab_manager` | หัวหน้าห้องปฏิบัติการ | บริหารจัดการและตรวจสอบทุกขั้นตอน |
| `pathologist` | นักพยาธิวิทยา | วินิจฉัยและออกรายงาน |
| `senior_pathologist` | นักพยาธิวิทยาอาวุโส | วินิจฉัย + อนุมัติรายงาน |
| `gross` | นักเทคนิคการแพทย์ (Grossing) | รับตัวอย่าง + ตัดชิ้นเนื้อ |
| `histo` | นักเทคนิคการแพทย์ (Histology) | Embedding, Sectioning, Staining |
| `cytotechnologist` | นักเทคนิคการแพทย์ (Cytology) | ตรวจและวินิจฉัย Cytology |
| `immuno` | นักเทคนิคการแพทย์ (Immunohistochemistry) | งาน IHC |
| `register` | เจ้าหน้าที่ลงทะเบียน | ค้นหาและดูรายงาน |
| `financial` | เจ้าหน้าที่การเงิน | ข้อมูลการเงิน |
| `hospital` | เจ้าหน้าที่โรงพยาบาลต้นสังกัด | ดูผลรายงาน |

---

## 4. เมนูหลักตามบทบาท

เมนูที่เห็นในแถบด้านซ้ายขึ้นอยู่กับบทบาทของผู้ใช้งาน:

### Gross / Register / Admin
- **Front Desk** → Accession, Report Archive, Print Queue, Slide/Block Release

### Histo
- **Front Desk** → Print Queue, Slide/Block Release
- **Surgical** → Grossing, Decal Queue, Tissue Processing, Specimen Storage
- **Histology** → Process Out, Embedding, Sectioning, H&E Staining, H&E Sticker, Slide Dispatch
- **Out Lab / Referral** → Outlab Tracking, Outlab Runs, Consult Cases

### Cytotechnologist
- **Front Desk** → Accession, Report Archive, Print Queue, Slide/Block Release
- **Gyne Cytology** → Staining, Slide Sticker, Diagnosis, Slide Dispatch
- **Non-Gyne Cytology** → Staining Batch, Slide Sticker, Diagnosis, Slide Dispatch

### Pathologist / Senior Pathologist
- **Diagnosis** → My Worklist, Report Archive, Approval
- **Gyne Cytology** → Diagnosis
- **Non-Gyne Cytology** → Diagnosis
- **Out Lab / Referral** → Consult Cases, Consult Runs

### Lab Manager / Admin
- เข้าถึงได้ทุกเมนูข้างต้น
- **Administration** → Patient Management, Master Data, Billing & Cost, User Management
- **IT Administration** → System Settings, Audit Log

---

## 5. Front Desk — Accession (รับตัวอย่าง)

> บทบาทที่ใช้: `admin`, `lab_manager`, `gross`, `cytotechnologist`

### 5.1 เปิดหน้า Accession

คลิก **Front Desk → Accession** ในเมนูด้านซ้าย

หน้านี้รวมการรับตัวอย่างทั้ง 3 ประเภทไว้ในที่เดียว มี 4 แท็บ:

| แท็บ | Badge count | เนื้อหา |
|---|---|---|
| **All** | รวมทุกประเภท | แสดงทุก case เรียงตามวันที่ล่าสุด |
| **Surgical** | จำนวน Surgical | เฉพาะ case (Accession ขึ้นต้นด้วย **S**) |
| **Gyne Cytology** | จำนวน Gyne | เฉพาะ case (ขึ้นต้นด้วย **C**) |
| **Non-Gyne Cytology** | จำนวน Non-Gyne | เฉพาะ case (ขึ้นต้นด้วย **N**) |

---

### 5.2 ปุ่มรับตัวอย่างใหม่

มีปุ่ม 3 ปุ่มมุมขวาบน:

| ปุ่ม | ใช้สำหรับ | Accession prefix |
|---|---|---|
| **New Surgical** | เปิดฟอร์มรับตัวอย่าง Surgical | S |
| **New Gyne** | เปิดฟอร์มรับตัวอย่าง Gyne Cytology | C |
| **New Non-Gyne** | เปิดฟอร์มรับตัวอย่าง Non-Gyne Cytology | N |

---

### 5.3 รับตัวอย่าง Surgical (New Surgical)

#### ขั้นตอน

1. กดปุ่ม **New Surgical** — หน้าต่างฟอร์มจะปรากฏ
2. **ค้นหาผู้ป่วยจาก HIS** (ถ้าเชื่อมต่อระบบ HIS):
   - กรอก HN ในช่อง Search แล้วกด Search
   - ระบบดึงชื่อ, เพศ, วันเกิด, และคำนำหน้าชื่อจาก HIS มาอัตโนมัติ
   - หาก HIS ไม่เชื่อมต่อ ให้กรอกข้อมูลผู้ป่วยเอง
3. **กรอกข้อมูล Case**:

| ฟิลด์ | คำอธิบาย | จำเป็น |
|---|---|---|
| วันที่รับตัวอย่าง | วันที่ได้รับชิ้นเนื้อจากห้องผ่าตัด | ใช่ |
| โรงพยาบาล / แผนก | แผนกที่ส่งตรวจ | แนะนำ |
| แพทย์ผู้ส่ง (Clinician) | ชื่อแพทย์ผู้รักษา | แนะนำ |
| สิทธิการรักษา (Medical Scheme) | ประกัน / สิทธิ์ผู้ป่วย | ไม่บังคับ |
| Clinical History | ประวัติทางคลินิกและการวินิจฉัยเบื้องต้น | แนะนำ |
| Specimen(s) | ประเภทตัวอย่างและตำแหน่ง (เพิ่มได้หลายรายการ) | ใช่ |
| Express | ติ๊กหากต้องการผลเร่งด่วน | ไม่บังคับ |
| Out-lab Consult | ติ๊กหากส่งปรึกษาห้องปฏิบัติการภายนอก | ไม่บังคับ |

4. กด **Save** — ระบบกำหนดเลข Accession No. อัตโนมัติ เช่น **S26-00001**
5. Case ใหม่ปรากฏในตารางพร้อมสถานะ `Registered`

#### สัญลักษณ์พิเศษในตาราง

| สัญลักษณ์ | ความหมาย |
|---|---|
| 🔥 (ไอคอนไฟ) | Express case — รอผลเร่งด่วน |
| **IHC** badge สีเหลือง | มี IHC order ที่ยังไม่เสร็จ |
| **Consult** badge สีม่วง | ส่งปรึกษาห้องปฏิบัติการนอก |

---

### 5.4 รับตัวอย่าง Gyne Cytology (New Gyne)

1. กดปุ่ม **New Gyne**
2. ค้นหาผู้ป่วยจาก HIS หรือกรอกข้อมูลเอง
3. กรอกข้อมูล:
   - วันที่รับตัวอย่าง
   - ประเภทการตรวจ (เช่น Conventional Pap, LBC)
   - แพทย์ผู้ส่ง / แผนก
   - วัน Last Menstrual Period (LMP) ถ้าทราบ
4. กด **Save** — ได้ Accession No. ขึ้นต้น **C** เช่น C26-00001

---

### 5.5 รับตัวอย่าง Non-Gyne Cytology (New Non-Gyne)

1. กดปุ่ม **New Non-Gyne**
2. ค้นหาผู้ป่วยหรือกรอกข้อมูล
3. กรอก:
   - Specimen type (เช่น FNAB, Sputum, Pleural fluid, Urine)
   - Collection site (ตำแหน่งเก็บตัวอย่าง)
   - แพทย์ผู้ส่ง / แผนก
4. กด **Save** — ได้ Accession No. ขึ้นต้น **N** เช่น N26-00001

---

### 5.6 ตาราง All Tab — คอลัมน์และข้อมูล

ตาราง **All** รวม case ทุกประเภท เรียงตามวันที่ล่าสุดก่อน

| คอลัมน์ | รายละเอียด |
|---|---|
| **Accession No.** | แสดงด้วยสีตามประเภท: น้ำเงิน=Surgical, เขียว=Gyne, ส้ม=Non-Gyne |
| **Type** | แท็กประเภท: Surgical / Gyne / Non-Gyne |
| **Patient** | ชื่อผู้ป่วย (รวมคำนำหน้า), HN, ชั้นผู้ป่วย |
| **Origin** | โรงพยาบาล / แผนก / Clinician |
| **Specimen** | ประเภทตัวอย่างแรก |
| **Workflow** | Progress badge แสดงขั้นตอนที่ผ่านแล้ว (Surgical) หรือ Screened/Reported (Cyto) |
| **Status** | สถานะปัจจุบันของ case |
| **Registered** | วันและเวลาที่ลงทะเบียน |
| **TAT** | Turnaround Time — แถบแสดงเวลาที่ใช้เทียบกับเป้าหมาย |
| **Action** | ปุ่ม Edit, Sticker, PDF |

#### Workflow Badges (เฉพาะ Surgical)

Badge แต่ละอันแสดงสถานะขั้นตอน — สีแสดงว่าผ่านแล้ว, สีเทาแสดงยังไม่ถึง:

| Badge | ขั้นตอน |
|---|---|
| **GRS** | Grossed (ตัดชิ้นเนื้อแล้ว) |
| **PRC** | Processed (ผ่าน Tissue Processor แล้ว) |
| **SLD** | Slide Prepared (สไลด์พร้อมแล้ว) |
| **RPT** | Reported (มีรายงานแล้ว) |

---

### 5.7 สถานะ Case (Status)

#### Surgical

| สถานะ | สี | ความหมาย |
|---|---|---|
| `Registered` | เทา | ลงทะเบียนแล้ว รอ Grossing |
| `Formalin Fixing` | เขียว | กำลัง Fix ใน Formalin |
| `In Progress` | ม่วง | กำลังดำเนินการ |
| `Grossed` | น้ำเงิน | ตัดชิ้นเนื้อแล้ว |
| `Processed` | ฟ้าคราม | ผ่าน Tissue Processor |
| `Embedded` | น้ำเงินเข้ม | ฝัง Paraffin แล้ว |
| `Sectioned` | ส้ม | ตัดสไลด์แล้ว |
| `Stained` | ม่วง | ย้อมสีแล้ว |
| `Slide Sent` | น้ำเงิน | ส่งสไลด์ไปยัง Pathologist แล้ว |
| `Published` | เขียวสด | รายงานผลสุดท้าย Released แล้ว |
| `Pending Approval` | ทอง | รอการอนุมัติรายงาน |
| `Cancelled` | แดง | ยกเลิก |

#### Cytology (Gyne / Non-Gyne)

| สถานะ | สี | ความหมาย |
|---|---|---|
| `Registered` | เทา | ลงทะเบียนแล้ว |
| `Stained` | ม่วง | ย้อมสไลด์แล้ว |
| `Screening` | น้ำเงินเข้ม | กำลัง Screen |
| `Screened` | น้ำเงินเข้ม | ผ่าน Screen แล้ว |
| `Reported` | เขียว | มีรายงานแล้ว |
| `Pending Approval` | ทอง | รอ Approve |
| `Final Report` | เขียวสด | Released แล้ว |
| `Revised` | ส้มแดง | ถูก Revise |
| `Cancelled` | แดง | ยกเลิก |

---

### 5.8 การค้นหาและกรอง

แต่ละแท็บมีช่องค้นหาและตัวกรอง:

| ตัวกรอง | ใช้สำหรับ |
|---|---|
| **Search** | ค้นหา HN, ชื่อผู้ป่วย, Accession No. |
| **Status** | กรองตามสถานะ case |
| **Hospital** | กรองตามโรงพยาบาลต้นสังกัด |
| **Date From / Date To** | กรองตามช่วงวันที่รับตัวอย่าง |
| **Medical Scheme** | กรองตามสิทธิการรักษา (Surgical / Non-Gyne) |

---

### 5.9 Sticker (สติ๊กเกอร์ตัวอย่าง)

ในแต่ละแถว มีปุ่ม **Sticker** (ไอคอน Printer):
- กดเพื่อเปิด PDF Preview สติ๊กเกอร์
- พิมพ์ติดขวด/ท่อตัวอย่างและ Cassette
- ข้อมูลบนสติ๊กเกอร์: Accession No., HN, ชื่อผู้ป่วย, วันที่

---

### 5.10 ดู PDF รายงาน (Published Cases)

Case ที่สถานะ **Published** จะมีปุ่ม **PDF** ในคอลัมน์ Action:
- กดเพื่อดู PDF รายงานฉบับสุดท้ายใน Modal
- กด "Open in New Tab" เพื่อเปิดใน Tab ใหม่ของ Browser
- กด Download เพื่อบันทึกไฟล์ PDF

---

### 5.11 แก้ไขข้อมูล Case

คลิกปุ่ม **Edit** (ไอคอนดินสอ) ในแถว case ที่ต้องการ → แก้ไขข้อมูล → กด Save

> **หมายเหตุ:** case ที่ Published แล้วอาจถูกจำกัดการแก้ไข ขึ้นอยู่กับสิทธิ์บทบาท

---

### 5.12 Report Archive (คลังรายงาน)

คลิก **Front Desk → Report Archive** เพื่อค้นหาและดูรายงานที่ออกแล้ว สามารถค้นหาด้วย HN, ชื่อผู้ป่วย, หรือ Accession No.

---

## 6. Surgical Pathology Workflow

### 6.1 Grossing (การตัดชิ้นเนื้อ)

> บทบาทที่ใช้: `gross`, `pathologist`, `lab_manager`, `admin`

**เมนู: Surgical → Grossing**

1. เลือก case ที่ต้องการตัดชิ้นเนื้อจากรายการ
2. กรอก **Gross Description** (ลักษณะตัวอย่างทางมหภาค)
3. กำหนด **Cassette** — ระบุจำนวนและตำแหน่งการตัดแต่ละ Cassette
4. หากตัวอย่างต้องการ **Decalcification** ให้ติ๊ก Decal flag
5. กด **Save Grossing** — สถานะ case จะเปลี่ยนเป็น `grossed`

### 6.2 Decal Queue

> บทบาทที่ใช้: `gross`, `histo`, `lab_manager`, `admin`

**เมนู: Surgical → Decal Queue**

แสดงรายการ case ที่รอการ Decalcification บันทึกวันที่เริ่มและสิ้นสุดกระบวนการ

### 6.3 Tissue Processing

> บทบาทที่ใช้: `gross`, `histo`, `lab_manager`, `admin`

**เมนู: Surgical → Tissue Processing**

1. เลือก Cassette ที่จะส่งเข้าเครื่อง Tissue Processor
2. สแกนหรือเลือก batch
3. บันทึกเวลาเข้า-ออก Processor
4. สถานะเปลี่ยนเป็น `processed`

### 6.4 Specimen Storage

**เมนู: Surgical → Specimen Storage**

บันทึกตำแหน่งจัดเก็บตัวอย่างต้นฉบับ (ขวดน้ำยา Formalin) หลัง Grossing

---

## 7. Histology Workflow

### 7.1 Embedding

> บทบาทที่ใช้: `histo`, `lab_manager`, `admin`

**เมนู: Histology → Embedding**

หลัง Tissue Processing เสร็จ:
1. เลือก Cassette ที่พร้อม Embed
2. บันทึกการฝัง Paraffin Block
3. สถานะเปลี่ยนเป็น `embedded`

### 7.2 Sectioning

**เมนู: Histology → Sectioning**

1. เลือก Block ที่จะตัดสไลด์
2. บันทึกจำนวน Section ต่อ Block
3. สถานะเปลี่ยนเป็น `sectioned`

### 7.3 H&E Staining

**เมนู: Histology → H&E Staining**

1. เลือกสไลด์ที่จะ Stain
2. สร้าง Staining Batch
3. บันทึกผล Staining
4. สถานะเปลี่ยนเป็น `stained`

### 7.4 H&E Sticker

**เมนู: Histology → H&E Sticker**

พิมพ์สติ๊กเกอร์ติดสไลด์ — ข้อมูลแสดง: Accession No., ชื่อผู้ป่วย, หมายเลข Block/Section

### 7.5 Slide Dispatch

**เมนู: Histology → Slide Dispatch**

บันทึกการส่งสไลด์ไปยัง Pathologist เพื่อตรวจ
สถานะเปลี่ยนเป็น `slide_sent`

---

## 8. Gyne Cytology Workflow

### 8.1 Staining

**เมนู: Gyne Cytology → Staining**

1. สร้าง Staining Run สำหรับกลุ่ม Pap smear / LBC
2. บันทึก Staining batch
3. พิมพ์ Sticker สำหรับสไลด์

### 8.2 Diagnosis (Cytotechnologist)

**เมนู: Gyne Cytology → Diagnosis**

1. ค้นหา case ที่ตรวจแล้ว
2. กรอกผลการตรวจ Pap smear (Bethesda System)
3. ระบุ: Specimen adequacy, General categorization, Epithelial cell abnormality
4. กด **Save** — ส่งไปยัง Pathologist หรืออนุมัติตามสิทธิ์

### 8.3 Slide Dispatch (Gyne)

บันทึกการส่งสไลด์กลับ หรือจัดเก็บตามระเบียบ

---

## 9. Non-Gyne Cytology Workflow

คล้ายกับ Gyne Cytology แต่ใช้สำหรับตัวอย่าง เช่น FNAB, Sputum, Pleural fluid, Urine

### 9.1 Staining Batch

**เมนู: Non-Gyne Cytology → Staining Batch**

สร้าง Batch การย้อมสีสำหรับ Non-Gyne Cytology

### 9.2 Diagnosis

**เมนู: Non-Gyne Cytology → Diagnosis**

1. เลือก case จาก Worklist
2. กรอก Microscopic description
3. ระบุ Diagnosis และ Malignancy flag
4. กด **Save**

---

## 10. Diagnosis — Pathologist Worklist

> บทบาทที่ใช้: `pathologist`, `senior_pathologist`, `lab_manager`, `admin`

**เมนู: Diagnosis → My Worklist**

### 10.1 ภาพรวม Worklist

Worklist แสดง case ที่รอการวินิจฉัย แบ่งเป็นแท็บ:
- **Surgical** — case ที่สไลด์ส่งมาแล้ว
- **Gyne Cytology** — case Pap smear
- **Non-Gyne Cytology** — case อื่นๆ

ข้อมูลแต่ละแถว: Accession No., ชื่อผู้ป่วย, HN, สถานะ, วันที่

### 10.2 เปิด Diagnosis Form (Surgical)

1. คลิกปุ่ม **Open** หรือกดที่ Accession No.
2. หน้า Surgical Diagnosis Form จะเปิดขึ้น แสดง:
   - ข้อมูลผู้ป่วยและ Clinical history
   - Gross description (บันทึกแล้ว)
   - ช่อง Microscopic description (กรอก)
   - ช่อง Diagnosis (กรอก — รองรับ Rich text / HTML)
   - Special stain / IHC ที่สั่งไว้

3. กรอก **Microscopic description** และ **Diagnosis**
4. กด **Save Draft** เพื่อบันทึกร่าง (ยังไม่ส่ง Approve)
5. กด **Submit for Approval** เมื่อพร้อมส่งให้อนุมัติ

### 10.3 Report Version

ทุกครั้งที่ Submit ระบบจะสร้าง Report version ใหม่ ประวัติ version ทั้งหมดจะถูกเก็บไว้

---

### 10.4 Signatories (ผู้เซ็นรายงาน)

ส่วน **Signatories** อยู่ในหน้า Surgical Diagnosis Form ใต้ส่วน Diagnosis ใช้กำหนดว่าใครต้องเซ็นรับรองรายงานฉบับนี้ก่อนส่ง Approve

#### โครงสร้างแต่ละแถว

| ช่อง | คำอธิบาย |
|---|---|
| **ชื่อ** | เลือกพยาธิแพทย์จากรายการ (ค้นหาได้) |
| **บทบาท** | Primary / Co-Signer / Resident / Consultant |
| **สถานะ** | ✓ สีเขียว = เซ็นแล้ว (hover เพื่อดูวันเวลา) / ⏱ สีเทา = ยังไม่เซ็น |

#### นโยบายการเซ็น

ขึ้นอยู่กับการตั้งค่าระบบ (ดูหัวข้อ [14.1 Workflow Settings](#141-system-settings)):

| แสดงในหัวการ์ด | ความหมาย |
|---|---|
| **REQUIRE ALL** | ทุกคนในรายการต้องเซ็นก่อน case จึงจะเปลี่ยนสถานะเป็น `Pending Approval` |
| **PRIMARY ONLY** | เฉพาะ Primary Pathologist เซ็นก็เพียงพอ |

#### การเพิ่มและลบ Signatory

- กดปุ่ม **Add Pathologist** (เส้นประ) เพื่อเพิ่ม Co-Signer / Resident / Consultant
- กดไอคอน **×** สีแดงเพื่อลบออก
- **ไม่สามารถลบ Primary** (เจ้าของ case) ได้
- **ไม่สามารถแก้ไขหรือลบ** Signatory ที่เซ็นไปแล้ว

#### ขั้นตอนการเซ็น (Sign Off)

1. เปิด case → ตรวจสอบ Diagnosis ให้ถูกต้อง
2. กดปุ่ม **Sign Off** ที่ Toolbar ด้านบน
3. ระบบบันทึก timestamp — แถวของตัวเองในรายการเปลี่ยนเป็น ✓ สีเขียว
4. เมื่อครบตามนโยบาย → สถานะ case เปลี่ยนเป็น `Pending Approval` อัตโนมัติ

> **หมายเหตุ:** หากนโยบายเป็น REQUIRE ALL และยังมีคนที่ยังไม่เซ็น (⏱ สีเทา) case จะยังไม่ถูกส่ง Approve แม้ว่า Primary จะเซ็นแล้ว

---

## 11. Approval — การอนุมัติรายงาน

> บทบาทที่ใช้: `senior_pathologist`, `lab_manager`, `admin`

**เมนู: Diagnosis → Approval**

### 11.1 รายการรอ Approve (Pending Approval List)

แสดง report ทุกฉบับที่อยู่ในสถานะ **Pending Approval** แบ่งตามประเภท:
- Surgical / Gyne / Non-Gyne

### 11.2 ตรวจสอบรายงาน

1. คลิกปุ่ม **Review** ที่แถวที่ต้องการ
2. หน้า Approval Detail จะเปิดขึ้น แสดง:
   - **PDF Preview** ของรายงาน (ซ้าย) — สามารถกด "Open in New Tab" เพื่อดูแบบเต็มจอ
   - **ข้อมูลสรุป** ผู้ป่วย, Diagnosis, Gross/Microscopic (ซ้ายล่าง)
   - **Approval Decision Panel** (ขวา)

### 11.3 การตัดสินใจ

ใน **Approval Decision Panel** (ขวามือ):

| ปุ่ม | ผล |
|---|---|
| **Release Report** (เขียว) | รายงานถูก Approve — สถานะเปลี่ยนเป็น `published` — ผู้ป่วยรับรายงานได้ |
| **Request Changes** | ส่งกลับให้ Pathologist แก้ไข |
| **Reject** | ปฏิเสธรายงาน |

ก่อนกดสามารถพิมพ์ **Comment** ไว้ในช่องด้านบนปุ่ม

### 11.4 Solo Pathologist Workflow

หากห้องปฏิบัติการมี Pathologist คนเดียว (solo) แนะนำ:
1. Pathologist Submit report
2. Pathologist ตรวจสอบ PDF อีกครั้งในหน้า Approval
3. กด **Release Report** ด้วยตนเอง (ไม่ต้องรอผู้อื่น)

---

## 12. Report Archive — คลังรายงาน

### 12.1 Diagnosis → Report Archive

> บทบาทที่ใช้: `admin`, `lab_manager`, `senior_pathologist`

แสดง report ที่ Published ทั้งหมด สามารถ:
- ค้นหาด้วย HN, ชื่อ, Accession No.
- ดู PDF
- ดูประวัติ version

### 12.2 Front Desk → Report Archive

> บทบาทที่ใช้: `admin`, `lab_manager`, `histo`, `gross`, `cytotechnologist`, `register`

ใช้สำหรับค้นหาและดึง PDF รายงาน เพื่อพิมพ์หรือส่งให้ผู้ป่วย

---

## 13. Administration

> บทบาทที่ใช้: `admin`, `lab_manager`

**เมนู: Administration**

### 13.1 Patient Management

**Administration → Patient Management**

- ค้นหาผู้ป่วยในระบบ
- แก้ไขข้อมูลผู้ป่วย (ชื่อ, เพศ, วันเกิด, HN)
- ดู case history ของผู้ป่วย

### 13.2 Master Data (Settings)

**Administration → Master Data**

> บทบาทที่ใช้: `admin` เท่านั้น

จัดการข้อมูล Master:
- **ประเภทตัวอย่าง** (Specimen types)
- **แผนก / โรงพยาบาล** ที่ส่งตรวจ
- **Stain types** (H&E, PAS, Masson, ฯลฯ)
- **คำนำหน้าชื่อ** (นาย, นาง, น.ส. ฯลฯ)
- **IHC markers**

### 13.3 Billing & Cost

**Administration → Billing & Cost**

- ดูรายการค่าตรวจตาม case
- ออก Invoice
- ดูสถิติรายได้

### 13.4 User Management

**Administration → User Management**

- สร้างบัญชีผู้ใช้งานใหม่
- แก้ไขบทบาท (Role) ของผู้ใช้งาน
- Reset รหัสผ่าน
- Deactivate บัญชีที่ไม่ใช้งาน

---

## 14. IT Administration

> บทบาทที่ใช้: `admin` เท่านั้น

### 14.1 System Settings

**IT Administration → System Settings**

ตั้งค่าระบบหลัก:

| หมวด | รายการ |
|---|---|
| **Branding** | โลโก้, ชื่อห้องปฏิบัติการ (ไทย/อังกฤษ), ลายเซ็นต์บน PDF |
| **HIS Integration** | ตั้งค่าการเชื่อมต่อ HIS (HOSxP) |
| **Workflow** | เปิด/ปิด Approval workflow, กำหนด Auto-approve |
| **Report** | Header/Footer ของรายงาน PDF |
| **Printer** | เครื่องพิมพ์สติ๊กเกอร์ default |

> **หมายเหตุ:** หลังแก้ไขการตั้งค่า ต้องกดปุ่ม **Save Settings** (ปุ่มสีน้ำเงิน ด้านล่างขวา) ทุกครั้ง มิฉะนั้นการเปลี่ยนแปลงจะหาย

### 14.2 Audit Log

**IT Administration → Audit Log**

บันทึกการกระทำสำคัญในระบบ เช่น:
- การ Login/Logout
- การสร้าง/แก้ไข case
- การ Approve/Reject report
- การเปลี่ยนแปลงการตั้งค่า

---

## 15. คำถามที่พบบ่อย (FAQ)

**Q: ลืมรหัสผ่านทำอย่างไร?**
A: ติดต่อ Admin หรือ Lab Manager เพื่อ Reset รหัสผ่านในหน้า User Management

**Q: เพิ่ม case ไปแล้ว Accession No. ไม่ขึ้น?**
A: Refresh หน้าเว็บ หรือกดปุ่ม Reload ในตาราง

**Q: PDF รายงานแสดงชื่อผู้ป่วยไม่ถูกต้อง?**
A: ตรวจสอบว่าบันทึก prefix (นาย/นาง) ของผู้ป่วยถูกต้องใน Patient Management แล้วสร้าง report ใหม่

**Q: ข้อมูลผู้ป่วยจาก HIS ไม่ขึ้น?**
A: ตรวจสอบว่า HN ถูกต้อง และระบบ HIS ออนไลน์อยู่ หากยังไม่ขึ้นให้กรอกข้อมูลเอง

**Q: สถานะ case ไม่เปลี่ยนหลัง Save?**
A: ตรวจสอบว่ากด Save สำเร็จ (มีข้อความ "บันทึกสำเร็จ") Refresh หน้าหากสถานะยังเดิม

**Q: ไม่เห็นเมนูบางรายการ?**
A: เมนูแสดงตามสิทธิ์บทบาทของท่าน หากต้องการเข้าถึงเพิ่มเติม ติดต่อ Admin เพื่อปรับ Role

**Q: PDF ไม่โหลดในหน้า Approval?**
A: กด Refresh หน้า หรือกดปุ่ม "Open in New Tab" เพื่อเปิดใน Browser tab ใหม่

---

*เอกสารนี้จัดทำสำหรับ Pathology LIS v2026*
*อัปเดตล่าสุด: พฤษภาคม 2569*

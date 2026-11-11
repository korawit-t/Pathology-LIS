// Release notes shown under System Settings → About (ReleaseNotes.tsx).
//
// Bundled with the build rather than fetched from GitHub: a hospital LAN often
// has no internet access, and the notes that matter are the ones for the
// version actually installed. CHANGELOG.md stays the full record; this is the
// admin's summary of it, newest first.
//
// Cutting a release: add its entry at the top in the same PR as the version
// bump. ReleaseNotes.test.tsx fails while the newest entry here is not the
// version in package.json.

export interface ReleaseNote {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  summary: string;
  /** What an admin has to do or check when upgrading to this version. */
  upgrade?: string[];
  added?: string[];
  fixed?: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "3.2.0",
    date: "2026-11-11",
    summary:
      "ระบบบันทึกได้ว่าผล IHC ออกเมื่อไหร่ และใช้เวลานานเท่าไหร่ (หน้า IHC TAT ใน Report Analytics ทั้ง surgical และ non-gyne) ส่งแจ้งเตือนเข้ากลุ่ม LINE ผ่านหมอพร้อมได้ และนำเข้ารายงานจากระบบเดิมได้",
    upgrade: [
      "backup ฐานข้อมูลก่อนอัปเกรด: migration ชุดนี้เติมเวลาย้อนหลังให้สไลด์ย้อมเพิ่มที่มีอยู่ (เวลาพร้อมอ่าน, เวลา sign, เวลา publish) และเปลี่ยนสไลด์ IHC ที่ค้างสถานะ stained หลัง sign-off แล้ว (พิมพ์ผลในช่อง diagnosis เอง) เป็น completed รายการ \"awaiting review\" จึงจะสั้นลง",
      "แจ้งพยาธิแพทย์: ตอน sign-off ถ้าเลือก \"Yes, Signed Off\" ระบบจะนับ IHC / special stain ที่พร้อมอ่านทุกตัวของเคสว่าผลออกแล้ว ถ้าเลือก \"No, Pending\" จะนับเฉพาะตัวที่ review แล้ว หน้า sign-off แสดงรายการทั้งสองแบบ และรายการที่ยังไม่กลับ ถ้าผู้อนุมัติตีกลับรายงาน รายการเหล่านั้นจะรอนับใหม่ตอน sign ครั้งถัดไป",
      "ตั้งเป้าหมาย TAT ของ IHC ได้ที่ System Settings → Workflow → Turnaround Time (ค่าเริ่มต้น 10 วันทำการ นับจากสั่ง IHC ถึงผลออก)",
      "ถ้าจะส่งแจ้งเตือนผ่านหมอพร้อม (MOPH Notify): เพิ่ม notification channel แล้วใส่ client-key และ secret-key จากเมนูหน่วยบริการใน MOPH Notify CMS",
    ],
    added: [
      "หน้า IHC TAT ใน Report Analytics (Surgical และ Non-Gyne Cyto): เวลาตั้งแต่สั่งถึงผลออก, % ที่อยู่ในเป้า, เวลาที่ outlab, เวลาอ่านและรออนุมัติ, และรายการ IHC ที่ยังไม่ออก",
      "บันทึกเวลาที่ผล IHC / special stain ออก ตอนพยาธิแพทย์ sign-off โดยไม่ต้องกรอก IHC panel และเวลาที่ถึงมือแพทย์ผู้ส่ง (ตอน publish หรือตอนอนุมัติ)",
      "หน้า sign-off ของ surgical และ non-gyne แสดง IHC / special stain ที่รอ review และที่ยังไม่กลับ",
      "ตั้งเป้าหมาย TAT ของ IHC ในหน้า Workflow",
      "ส่งแจ้งเตือนเข้ากลุ่ม LINE ผ่านหมอพร้อม (MOPH Notify) และตัวแปร {name_short} / {clinician_short} สำหรับข้อความที่ไม่ต้องการชื่อเต็ม",
      "นำเข้ารายงานจากระบบเดิม (.xlsx / .csv) ที่เมนู IT Administration → Legacy Report Import ย้อนกลับ (rollback) เป็นรอบได้",
      "ใบส่งสไลด์แสดงจำนวนสไลด์ของแต่ละเคสและยอดรวม",
    ],
    fixed: [
      "กล่อง \"stains awaiting review\" ในหน้า sign-off แสดง IHC / special stain จริงแล้ว (เดิมดึงมาแต่ H&E จึงไม่เคยแสดง)",
      "รายงาน non-gyne ที่มีหลายรอบมีหัวข้อพร้อมวันเวลาแบบเดียวกับ surgical และแสดงเวลาของ Collected / Received",
      "รายการค่าตรวจ Surgical ในหน้า gross เรียงตามรหัส CGD",
      "ค้นหารายงานเก่า (legacy) ได้เร็วขึ้นเมื่อมีข้อมูลนำเข้าจำนวนมาก",
    ],
  },
  {
    version: "3.1.1",
    date: "2026-11-10",
    summary:
      "แก้ปัญหาที่พบจากการติดตั้งด้วย Docker แบบเดียวกับที่โรงพยาบาลอื่นจะทำ และผู้ใช้ที่เข้ามาจาก IP เดียวกันไม่ทำให้กันหลุดออกจากระบบแล้ว",
    upgrade: [
      "ห้ามใช้ docker compose down -v บนเครื่อง production: หน้านี้ในเวอร์ชัน 3.1.0 แนะนำคำสั่งนี้ไว้ใช้ reset ฐานข้อมูล dev แต่คำสั่งนี้ลบฐานข้อมูลและไฟล์อัปโหลดทั้งหมดถาวร",
      "Docker: ถ้าค่าใน backend/.env มีเครื่องหมาย $ (เช่นรหัสผ่าน HIS) ให้เขียนเป็น $$ ไม่อย่างนั้นค่าส่วนหลัง $ จะหายไป เครื่องที่ไม่ได้ใช้ Docker ไม่ต้องแก้",
      "Docker: มีค่าใหม่ที่ตั้งใน .env ที่ root ได้ (ไม่บังคับ) ได้แก่ COMPOSE_PROJECT_NAME, FRONTEND_PORT, BACKEND_PORT, WSI_HOST_PATH ถ้าเครื่องที่ใช้งานอยู่แล้วจะตั้ง COMPOSE_PROJECT_NAME ต้องใช้ชื่อเดิมของ volume (ดูจาก docker volume ls) ไม่อย่างนั้นจะเปิดขึ้นมาเป็นฐานข้อมูลว่าง",
    ],
    fixed: [
      "ผู้ใช้หลายคนที่เข้ามาจาก IP เดียวกัน (Docker Desktop, NAT) ไม่ทำให้กันหลุดออกจากระบบแล้ว: การต่ออายุ session, การเปลี่ยนรหัสผ่าน และ MFA จำกัดจำนวนครั้งต่อผู้ใช้",
      "หลังฐานข้อมูล restart การใช้งานครั้งแรกไม่ขึ้น error 500 แล้ว",
      "Docker: log ของ container ถูกหมุนเวียน ไม่โตจนเต็มดิสก์",
      "Docker: ตั้ง port, ชื่อ project และโฟลเดอร์ WSI ใน .env ได้ ไม่ต้องแก้ docker-compose.yml",
      "Docker: เปิดดูภาพ WSI ได้ โดย mount โฟลเดอร์ของ scanner แบบอ่านอย่างเดียว",
      "Docker: clone บน Windows แล้วสคริปต์ .sh ทำงานได้ (role lis_app_rw ถูกสร้าง)",
      "Docker: ตัวอย่าง ALLOWED_ORIGINS ใส่ port 3000 ของ frontend แล้ว จึง login จากเครื่องอื่นได้",
      "README: เพิ่มขั้นตอนอัปเกรด, restore, ตรวจ backup และการแก้ปัญหาสำหรับ Docker",
    ],
  },
  {
    version: "3.1.0",
    date: "2026-11-10",
    summary:
      "การติดตั้งด้วย Docker ใช้งานได้ตามขั้นตอนใน README แล้ว, admin เห็นการแจ้งเตือนเวอร์ชันใหม่ และอ่าน release notes ได้ในหน้านี้",
    upgrade: [
      "เวลาในฐานข้อมูลตรงกับแอปแล้ว: ทุก session ของฐานข้อมูลตั้งเป็น Asia/Bangkok ถ้า PostgreSQL ตั้งเป็น UTC อยู่ (เช่นใน Docker) เวลาที่ฐานข้อมูลบันทึกเอง เช่น เวลาลงทะเบียนเคส จะถูกต้องตั้งแต่เวอร์ชันนี้ ส่วนข้อมูลเก่าจะช้าไป 7 ชั่วโมงเหมือนเดิม ตรวจได้ด้วย SHOW timezone; (เครื่อง Windows ทั่วไปเป็น Asia/Bangkok อยู่แล้ว ไม่มีอะไรเปลี่ยน)",
      "Docker production: ต้องมีไฟล์ .env ที่ root ของ repo (POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB) ดูตัวอย่างใน .env.example และใช้รหัสผ่านที่มีแต่ตัวอักษรกับตัวเลข",
      "Docker: ENVIRONMENT อ่านจาก backend/.env แล้ว ถ้าเปิดระบบผ่าน HTTPS ให้ตั้ง ENVIRONMENT=production",
      "Docker dev เท่านั้น: ฐานข้อมูล dev ที่สร้างจากเวอร์ชันก่อนต้องล้างหนึ่งครั้งตาม README หัวข้อ 4A ส่วนเครื่อง production ไม่ต้องทำอะไร",
    ],
    added: [
      "แสดง release notes ในหน้า About อ่านได้แม้เครื่องไม่มีอินเทอร์เน็ต",
      "แสดงชื่อ HIS ที่เชื่อมต่ออยู่ (ตั้งชื่อได้ด้วย HIS_DISPLAY_NAME) และซ่อนเมนูที่ HIS นั้นทำไม่ได้",
      "แจ้ง admin เมื่อมี release ใหม่บน GitHub และแจ้งผู้ใช้ให้บันทึกงานแล้วรีเฟรชหลัง deploy เวอร์ชันใหม่",
      "สวิตช์เปิด/ปิดการแจ้งเตือนทั้งสองแบบในหน้า About",
    ],
    fixed: [
      "Docker: frontend เรียก API ผิดที่จน login ไม่ได้",
      "Docker: backend ไม่ยอม start บน LAN ที่ใช้ http เพราะถูกบังคับเป็น production",
      "Docker: migration รันด้วยบัญชีเจ้าของฐานข้อมูลใน service แยก (migrate) ทำให้ backend ใช้ role lis_app_rw ได้",
      "Docker: รอให้ PostgreSQL พร้อมก่อนรัน migration และ dev ใช้ Alembic แทน create_tables.py",
      "Docker: ไม่ใส่ .env, virtualenv และ node_modules ลงใน image และ dev บน Linux อัปโหลดไฟล์ได้",
      "backup.sh กลับมาทำงาน (เดิมหยุดเงียบตอนอ่าน backend/.env โดยไม่บันทึก log และไม่แจ้ง Slack) และ start.sh ไม่หยุดก่อน start server",
      "หน้าลงทะเบียน: ประวัติทางคลินิกที่เป็น HTML แสดงเป็นข้อความ และไม่หายตอนบันทึก",
      "Pathologist: ช่องเหตุผล provisional เปิดใต้สวิตช์ของมัน",
    ],
  },
  {
    version: "3.0.0",
    date: "2026-11-05",
    summary: "รวมงานราว 10 สัปดาห์หลัง 2.0.0 — 17 features และ 36 fixes (รายการเต็มอยู่ใน CHANGELOG.md)",
    upgrade: [
      "Docker: คัดลอกไฟล์อัปโหลดออกจาก container ก่อนอัปเดต เพราะเปลี่ยนไปเก็บใน volume uploads_data",
      "SECRET_KEY ที่ยังเป็นค่าตัวอย่าง (change_me) ทำให้ backend ไม่ยอม start",
      "ทุกคนต้อง login ใหม่หนึ่งครั้ง และรหัสผ่านชั่วคราวหรือหมดอายุจะใช้งานอะไรไม่ได้จนกว่าจะเปลี่ยน",
      "Gyne QC review ทำได้เฉพาะ pathologist และไม่ใช่เคสที่ตัวเอง screen",
    ],
    added: [
      "Molecular tab ใน My Worklist ของ pathologist และ Molecular ใน print queue",
      "ย้ายที่เก็บไฟล์อัปโหลดไปดิสก์อื่นหรือ file share ได้ด้วย UPLOAD_ROOT",
      "ค้นหาเคสจากข้อความ specimen และ diagnosis",
      "QC เทียบผล screening ของ cytotech กับผล sign-out",
      "ขั้นตอนเก็บและทำลาย specimen ของ non-gyne พร้อม retention gate ฝั่ง server",
    ],
    fixed: [
      "รายงานที่ sign แล้วพิมพ์ซ้ำด้วยหัวกระดาษและรูปชุดเดิมที่ออกไป",
      "Docker เก็บไฟล์อัปโหลดใน named volume และ backup ได้",
      "ปิดช่องโหว่การอ่านไฟล์, การเข้าถึงข้ามโรงพยาบาล และบัญชีภายนอก",
      "API docs แยกเป็น EXPOSE_DOCS ปิดได้บน LAN",
    ],
  },
];

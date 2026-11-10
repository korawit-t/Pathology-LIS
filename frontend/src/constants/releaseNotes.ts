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
    version: "3.1.0",
    date: "2026-11-10",
    summary:
      "การติดตั้งด้วย Docker ใช้งานได้ตามขั้นตอนใน README แล้ว, admin เห็นการแจ้งเตือนเวอร์ชันใหม่ และอ่าน release notes ได้ในหน้านี้",
    upgrade: [
      "เวลาในฐานข้อมูลตรงกับแอปแล้ว: ทุก session ของฐานข้อมูลตั้งเป็น Asia/Bangkok ถ้า PostgreSQL ตั้งเป็น UTC อยู่ (เช่นใน Docker) เวลาที่ฐานข้อมูลบันทึกเอง เช่น เวลาลงทะเบียนเคส จะถูกต้องตั้งแต่เวอร์ชันนี้ ส่วนข้อมูลเก่าจะช้าไป 7 ชั่วโมงเหมือนเดิม ตรวจได้ด้วย SHOW timezone; (เครื่อง Windows ทั่วไปเป็น Asia/Bangkok อยู่แล้ว ไม่มีอะไรเปลี่ยน)",
      "Docker production: ต้องมีไฟล์ .env ที่ root ของ repo (POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB) ดูตัวอย่างใน .env.example และใช้รหัสผ่านที่มีแต่ตัวอักษรกับตัวเลข",
      "Docker: ENVIRONMENT อ่านจาก backend/.env แล้ว ถ้าเปิดระบบผ่าน HTTPS ให้ตั้ง ENVIRONMENT=production",
      "Docker dev: ฐานข้อมูล dev ที่สร้างจากเวอร์ชันก่อนต้อง reset หนึ่งครั้งด้วย docker compose down -v",
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

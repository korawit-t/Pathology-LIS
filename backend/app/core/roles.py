from app.dependencies.auth import RoleChecker

# --- กลุ่มสิทธิ์สำหรับการเข้าถึงข้อมูล (Access) ---
CAN_ACCESS_PATIENT = RoleChecker(
    ["admin", "lab_manager", "register", "pathologist", "senior_pathologist", "gross", "cytotechnologist"]
)
CAN_ACCESS_SURGICAL_SPECIMEN = RoleChecker(
    ["admin", "lab_manager", "register", "gross", "pathologist", "senior_pathologist"]
)
CAN_ACCESS_GROSS_IMAGE = RoleChecker(["admin", "lab_manager", "gross", "pathologist", "senior_pathologist"])
CAN_ACCESS_MICROSCOPIC_IMAGE = RoleChecker(["admin", "pathologist", "senior_pathologist"])
# Cytotechnologists are explicitly included for gyne/non-gyne image uploads
# because they are the role that actually screens cytology cases.
# lab_manager mirrors CAN_WRITE_{GYNE,NONGYNE}_CYTO_REPORT.
CAN_ACCESS_GYNE_CYTO_IMAGE = RoleChecker(
    ["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager"]
)
CAN_ACCESS_NONGYNE_CYTO_IMAGE = RoleChecker(
    ["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager"]
)
CAN_ACCESS_SURGICAL_BLOCK = RoleChecker(
    ["admin", "lab_manager", "gross", "pathologist", "senior_pathologist"]
)
CAN_ACCESS_GROSSING_ASSIST = RoleChecker(["admin", "lab_manager", "gross", "pathologist"])

# --- กลุ่มสิทธิ์สำหรับการจัดการรายงาน (Reporting) ---
CAN_WRITE_REPORT = RoleChecker(["admin", "pathologist", "senior_pathologist"])
CAN_READ_REPORT = RoleChecker(["admin", "lab_manager", "pathologist", "senior_pathologist", "register", "hospital", "clinician"])

# Attaching the PDF an external lab sent back is clerical work — whoever opens
# the envelope does it. Kept separate from CAN_WRITE_REPORT because that gate
# also governs finalizing, and putting a result on file is not the same act as
# signing it out. Everyone in the lab, but nobody outside it: "hospital" and
# "clinician" are accounts for the referring side, which has no business
# altering what a case holds.
CAN_UPLOAD_OUTLAB_RESULT = RoleChecker(
    ["admin", "lab_manager", "register", "gross", "cytotechnologist", "pathologist", "senior_pathologist"]
)

CAN_APPROVE = RoleChecker(["senior_pathologist", "admin"])

# --- สิทธิ์สำหรับ Gyne Cytology ---
CAN_WRITE_GYNE_CYTO_REPORT = RoleChecker(["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager"])
CAN_READ_GYNE_CYTO_REPORT = RoleChecker(["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager", "register", "hospital", "clinician"])
CAN_APPROVE_GYNE_CYTO = RoleChecker(["admin", "senior_pathologist", "cytotechnologist"])
CAN_APPROVE_OUTLAB_RESULT = RoleChecker(["pathologist", "senior_pathologist", "admin"])

# --- สิทธิ์สำหรับ NonGyne Cytology ---
CAN_WRITE_NONGYNE_CYTO_REPORT = RoleChecker(["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager"])
CAN_READ_NONGYNE_CYTO_REPORT = RoleChecker(["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager", "register", "hospital", "clinician"])
# Cytotechnologists screen non-gyne specimens and can approve, same as gyne.
# Defined separately so it can be tightened independently if lab policy changes.
CAN_APPROVE_NONGYNE_CYTO = RoleChecker(["admin", "senior_pathologist", "cytotechnologist"])

# --- สิทธิ์สำหรับ Internal Consult ---
CAN_REQUEST_CONSULT = RoleChecker(["admin", "pathologist", "senior_pathologist", "cytotechnologist"])

# --- กลุ่มสิทธิ์สำหรับการตั้งค่า (Settings) ---
CAN_MANAGE_SETTINGS = RoleChecker(["admin", "lab_manager", "pathologist", "senior_pathologist"])

CAN_MANAGE_USERS = RoleChecker(["admin", "lab_manager"])

# 1b. Clearing someone else's second factor, for the lost-phone case. Kept as
# its own gate rather than folded into CAN_MANAGE_USERS: this is the one
# routine action that lowers another account's protection, so who holds it
# should be a decision someone made on purpose.
CAN_RESET_USER_MFA = RoleChecker(["admin", "lab_manager"])

# 2. การตั้งค่าระบบหลัก (Branding, Logo, Global Config)
CAN_MANAGE_SYSTEM_SETTINGS = RoleChecker(["admin"])

# 2b. Outbound HIS export log (view + manual retry)
CAN_VIEW_HIS_EXPORT_LOG = RoleChecker(["admin"])

# 3. WSI Viewer
CAN_VIEW_WSI = RoleChecker(["admin", "lab_manager", "pathologist", "senior_pathologist", "histo"])

# --- กลุ่มสิทธิ์สำหรับการจัดเก็บและทำลายชิ้นเนื้อ (Specimen Storage) ---
# ตรงกับ pagePermissions["specimen-storage"] ฝั่ง frontend — คนที่ยกกล่องจริง
# คือ gross/histo ส่วน lab_manager/admin ดูแลภาพรวม
CAN_MANAGE_SPECIMEN_STORAGE = RoleChecker(["admin", "lab_manager", "gross", "histo"])

# การยืนยันว่าทำลายไปแล้ว (และการยกเลิกใบ) เป็นการปิดรายการถาวร จึงแยกกว้างกว่า
# การหยิบของ: ต้องเป็นระดับที่รับผิดชอบได้ ไม่ใช่ใครก็ได้ที่เข้าห้องเก็บ
CAN_APPROVE_SPECIMEN_DISPOSAL = RoleChecker(["admin", "lab_manager", "senior_pathologist"])

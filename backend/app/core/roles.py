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

CAN_APPROVE = RoleChecker(["senior_pathologist", "admin"])

# --- สิทธิ์สำหรับ Gyne Cytology ---
CAN_WRITE_GYNE_CYTO_REPORT = RoleChecker(["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager"])
CAN_READ_GYNE_CYTO_REPORT = RoleChecker(["admin", "pathologist", "senior_pathologist", "cytotechnologist", "lab_manager", "register", "hospital", "clinician"])
CAN_APPROVE_GYNE_CYTO = RoleChecker(["admin", "senior_pathologist", "cytotechnologist"])

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

# 2. การตั้งค่าระบบหลัก (Branding, Logo, Global Config)
CAN_MANAGE_SYSTEM_SETTINGS = RoleChecker(["admin"])

# 3. WSI Viewer
CAN_VIEW_WSI = RoleChecker(["admin", "lab_manager", "pathologist", "senior_pathologist"])

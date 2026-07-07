# backend/seed_data.py
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.organization import Title, Position, Hospital
from app.models.user import User
from app.models.external_lab import (
    ExternalLab,
)  # must load before AnatomicalPathologyTest
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.ihc_marker_option import IHCMarkerOption
from app.models.gross_template import GrossTemplate
from app.models.diagnostic_template import DiagnosticTemplate
from app.models.specimen_template import SpecimenTemplate
from app.core.security import get_password_hash
from app.models.gyne_diagnosis import GyneDiagnosisCategory, GyneSpecimenAdequacy
from app.models.notification_channel import NotificationChannel
from app.models.system_setting import SystemSetting
from app.models.notification_rule import NotificationRule
from app.models.tissue_processing import ProcessorMachine, ProcessingProgram
from app.models.stain_panel import StainPanel, StainPanelItem


# 1. ฟังก์ชันสร้างคำนำหน้า
def seed_titles(db: Session):
    titles = [
        "นาย",
        "นาง",
        "นางสาว",
        "ด.ช.",
        "ด.ญ.",
        "Mr.",
        "Mrs.",
        "Ms.",
        "Miss",
        "Master",
        "ดร.",
        "นพ.",
        "พญ.",
        "ทพ.",
        "ทพญ.",
    ]

    print("🌱 Seeding Titles...")
    for t_name in titles:
        exists = db.query(Title).filter(Title.title == t_name).first()
        if not exists:
            db.add(Title(title=t_name))
            print(f"   - Added Title: {t_name}")
    db.commit()


# 2. ฟังก์ชันสร้างตำแหน่ง
def seed_positions(db: Session):
    positions = [
        {
            "name": "System Admin",
            "desc": "IT Admin - Manage Users, Systems, and Security",
        },
        {
            "name": "Lab Manager",
            "desc": "Lab Supervisor - Can delete/edit cases and manage lab workflow",
        },
        {"name": "Pathologist", "desc": "Medical Doctor (Pathology)"},
        {"name": "Cytotech", "desc": "Cytotechnologist"},
        {"name": "Histo", "desc": "Histotechnologist"},
        {"name": "Gross", "desc": "Gross Examination Staff"},
        {"name": "Immuno", "desc": "Immunohistochemistry Staff"},
        {"name": "Financial", "desc": "Financial Officer"},
        {"name": "Lab Technician", "desc": "General Lab Technician"},
        {"name": "Hospital Staff", "desc": "General Hospital Staff"},
        {"name": "Clinician", "desc": "Clinician / Doctor"},
    ]

    print("🌱 Seeding Positions...")
    for p in positions:
        exists = db.query(Position).filter(Position.name == p["name"]).first()
        if not exists:
            db.add(Position(name=p["name"], description=p["desc"]))
            print(f"   - Added Position: {p['name']}")
    db.commit()


# 3. ฟังก์ชันสร้างโรงพยาบาล
def seed_hospitals(db: Session):
    hospitals = [{"name": "โรงพยาบาลทดสอบ", "code": "00000", "address": "ประเทศไทย"}]
    print("🌱 Seeding Hospitals...")
    for h in hospitals:
        exists = db.query(Hospital).filter(Hospital.name == h["name"]).first()
        if not exists:
            db.add(Hospital(name=h["name"], code=h["code"], address=h["address"]))
            print(f"   - Added Hospital: {h['name']}")
    db.commit()


# 4. ฟังก์ชันสร้าง Admin User
def seed_admin(db: Session):
    print("🌱 Checking Admin User...")
    existing_user = db.query(User).filter(User.username == "admin").first()

    if existing_user:
        print("   ✅ Admin user already exists.")
        return

    admin_pos = db.query(Position).filter(Position.name == "System Admin").first()
    default_hos = db.query(Hospital).first()

    print("   Creating initial admin user...")

    admin_user = User(
        username="admin",
        email="admin@pathology.lis",
        hashed_password=get_password_hash("admin1234"),
        full_name="System Administrator",
        report_name="Admin",
        position_id=admin_pos.id if admin_pos else None,
        roles=["admin"],
        status=True,
        # 🔒 SECURITY: mark password as temporary so the user is forced to
        # change it on first login. Without this flag, the default
        # "admin1234" credential would remain valid indefinitely.
        is_temporary_password=True,
    )
    if default_hos:
        admin_user.hospitals = [default_hos]

    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)

    print(f"   🎉 Admin user created successfully!")
    print(f"   Username: admin")
    print(f"   Temporary password: admin1234")
    print(f"   ⚠️  You will be required to change this password on first login.")


def seed_surgical_pathology_from_official(db: Session):
    """
    รายการการตรวจทางพยาธิวิทยา Surgical Pathology / Cytology / Special stain
    จากบัญชีที่ 2 หมวดที่ 7 (อัปเดต 1 กันยายน 2561)
    ราคา = อัตรากรมบัญชีกลาง  |  is_external=False (ทำในแลบ)
    """
    # (code, name, category, price_baht)
    SP_OFFICIAL: list[tuple[str, str, str, int]] = [
        # ── Surgical Pathology ────────────────────────────────────────────────
        ("38001", "Biopsy ชิ้นเนื้อ ขนาดไม่เกิน 2 ซม.", "Surgical Pathology", 240),
        ("38002", "ชิ้นเนื้อ ขนาด 2-5 ซม.", "Surgical Pathology", 500),
        ("38003", "ชิ้นเนื้อ ขนาดใหญ่กว่า 5 ซม.", "Surgical Pathology", 1000),
        (
            "38004",
            "อวัยวะหรือส่วนของอวัยวะที่ไม่ต้องเลาะตรวจต่อมน้ำเหลือง",
            "Surgical Pathology",
            1200,
        ),
        (
            "38005",
            "อวัยวะหรือส่วนของอวัยวะที่ต้องเลาะตรวจต่อมน้ำเหลือง",
            "Surgical Pathology",
            2400,
        ),
        (
            "38006",
            "Excisional biopsy with margin examination",
            "Surgical Pathology",
            1000,
        ),
        ("38010", "Frozen section (การตรวจรายละ)", "Surgical Pathology", 1160),
        ("38020", "Nerve with resin study", "Surgical Pathology", 1350),
        (
            "38030",
            "Thyroidectomy (lobectomy or subtotal or total)",
            "Surgical Pathology",
            1200,
        ),
        ("38031", "Thyroidectomy with node dissection", "Surgical Pathology", 2400),
        ("38040", "Eye ball, enucleation", "Surgical Pathology", 500),
        ("38041", "Eye ball, exenteration", "Surgical Pathology", 1000),
        ("38060", "Tonsil, each specimen", "Surgical Pathology", 240),
        ("38070", "Lung, wedge biopsy", "Surgical Pathology", 1000),
        ("38071", "Lung, lobectomy", "Surgical Pathology", 1200),
        ("38072", "Lung, lobectomy with lymph node", "Surgical Pathology", 2400),
        ("38080", "Heart valve", "Surgical Pathology", 1000),
        ("38090", "Lymph node, radical dissection", "Surgical Pathology", 1200),
        ("38100", "Esophagus, esophagectomy", "Surgical Pathology", 1200),
        (
            "38101",
            "Esophagus, esophagectomy with node dissection",
            "Surgical Pathology",
            2400,
        ),
        ("38102", "Stomach, gastrectomy", "Surgical Pathology", 1200),
        (
            "38103",
            "Stomach, gastrectomy with node dissection",
            "Surgical Pathology",
            2400,
        ),
        ("38104", "Small bowel, resection", "Surgical Pathology", 1200),
        (
            "38105",
            "Small bowel, resection with node dissection",
            "Surgical Pathology",
            2400,
        ),
        ("38106", "Appendix", "Surgical Pathology", 240),
        ("38107", "Colon, colectomy", "Surgical Pathology", 1200),
        ("38108", "Colon, colectomy with node dissection", "Surgical Pathology", 2400),
        ("38109", "Rectum", "Surgical Pathology", 1200),
        ("38110", "Rectum with node dissection", "Surgical Pathology", 2400),
        ("38120", "Whipple's specimen", "Surgical Pathology", 2400),
        ("38121", "Liver needle biopsy", "Surgical Pathology", 500),
        ("38122", "Liver wedge biopsy", "Surgical Pathology", 500),
        ("38123", "Liver resection", "Surgical Pathology", 1200),
        ("38124", "Gall bladder", "Surgical Pathology", 500),
        ("38130", "Omentectomy", "Surgical Pathology", 500),
        ("38140", "Kidney needle biopsy", "Surgical Pathology", 750),
        (
            "38141",
            "Kidney needle biopsy (with immunohistochemical study)",
            "Surgical Pathology",
            2350,
        ),
        (
            "38142",
            "Kidney, nephrectomy and partial nephrectomy",
            "Surgical Pathology",
            1200,
        ),
        ("38143", "Kidney, wedge biopsy", "Surgical Pathology", 500),
        ("38144", "Urinary bladder, cystectomy", "Surgical Pathology", 1200),
        (
            "38145",
            "Urinary bladder, cystectomy with lymph node dissection",
            "Surgical Pathology",
            2400,
        ),
        ("38146", "Urinary bladder, cystoscopic biopsy", "Surgical Pathology", 240),
        ("38147", "Urinary bladder, TUR tumor", "Surgical Pathology", 500),
        ("38150", "Prostate, needle biopsy", "Surgical Pathology", 1000),
        ("38151", "Prostate gland, prostatic chips (TUR)", "Surgical Pathology", 1450),
        ("38152", "Prostate gland, prostatectomy for BPH", "Surgical Pathology", 1000),
        (
            "38153",
            "Prostate gland, prostatectomy with radical node dissection",
            "Surgical Pathology",
            2400,
        ),
        (
            "38160",
            "Testis, unilateral or bilateral orchidectomy",
            "Surgical Pathology",
            500,
        ),
        ("38161", "Vasectomy (unilateral or bilateral)", "Surgical Pathology", 240),
        (
            "38170",
            "Pelvic exenteration (uterus with urinary bladder or colon and lymph node)",
            "Surgical Pathology",
            3000,
        ),
        ("38171", "Wertheim's operation", "Surgical Pathology", 3000),
        ("38172", "Ovarian mass", "Surgical Pathology", 1200),
        ("38173", "Fallopian tube, tubal sterilization", "Surgical Pathology", 240),
        ("38174", "Fallopian tube, tubal pregnancy", "Surgical Pathology", 240),
        ("38176", "Uterus with cervical conization", "Surgical Pathology", 2400),
        (
            "38177",
            "Uterus with multiple groups of lymph nodes",
            "Surgical Pathology",
            2400,
        ),
        ("38178", "Uterus with ovarian tumor", "Surgical Pathology", 2400),
        ("38179", "Uterus, hysterectomy (TAH)", "Surgical Pathology", 1000),
        ("38180", "Uterus, hysterectomy with adnexa", "Surgical Pathology", 1200),
        ("38181", "Cervical conization, LEEP", "Surgical Pathology", 1200),
        (
            "38190",
            "Bone (tumor: en bloc resection, pelvectomy, sacrectomy)",
            "Surgical Pathology",
            2400,
        ),
        ("38191", "Bone marrow biopsy", "Surgical Pathology", 240),
        ("38200", "Muscle biopsy", "Surgical Pathology", 500),
        ("38201", "Muscle biopsy with special study", "Surgical Pathology", 2400),
        ("38210", "Extremities, amputation with tumor", "Surgical Pathology", 3000),
        ("38211", "Leg, amputation (AK, BK) for non-tumor", "Surgical Pathology", 2400),
        ("38220", "Breast, mass excision (2-5 cm)", "Surgical Pathology", 500),
        ("38221", "Breast, mass excision (>5 cm)", "Surgical Pathology", 1000),
        ("38222", "Breast, mass excision (<2 cm)", "Surgical Pathology", 240),
        (
            "38223",
            "Breast, core needle biopsy (multiple pieces)",
            "Surgical Pathology",
            1200,
        ),
        ("38224", "Breast, simple mastectomy", "Surgical Pathology", 1200),
        (
            "38225",
            "Breast, mastectomy with axillary content (simple/radical/modified radical)",
            "Surgical Pathology",
            2400,
        ),
        ("38230", "Skin biopsy (Dermatosis)", "Surgical Pathology", 500),
        # ── Cytology ─────────────────────────────────────────────────────────
        ("38301", "การตรวจเซลล์วิทยา — Non-Gynecological specimen", "Cytology", 500),
        (
            "38302",
            "การตรวจเซลล์วิทยา — Gynecological specimen (PAP smear)",
            "Cytology",
            100,
        ),
        # ── Histochem / Special stain ─────────────────────────────────────────
        ("38401", "ย้อมสีพิเศษ (Special stain)", "Histochem", 60),
    ]

    print(
        "🌱 Seeding Surgical Pathology / Cytology / Special stain (บัญชีที่ 2 หมวด 7)..."
    )
    added = skipped = 0
    for code, name, category, price in SP_OFFICIAL:
        exists = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.code == code)
            .first()
        )
        if exists:
            skipped += 1
            continue
        db.add(
            AnatomicalPathologyTest(
                code=code,
                name=name,
                category=category,
                price_tier_1=price,
                price_tier_2=price,
                price_tier_3=price,
                is_external=False,
                is_system_default=False,
            )
        )
        print(f"   + [{code}] {name} ({price} บาท)")
        added += 1
    db.commit()
    print(
        f"✅ Surgical Path Official: เพิ่ม {added} รายการ, ข้าม {skipped} (มีอยู่แล้ว)"
    )


def seed_ihc_ap_tests_official(db: Session):
    """
    รายการการตรวจด้วยวิธีอิมมูโนฮิสโตเคมี จากบัญชีที่ 2 หมวดที่ 7
    ค่าตรวจวินิจฉัยทางเทคนิคการแพทย์และพยาธิวิทยา (อัปเดต 1 กันยายน 2561)
    ราคา = อัตรากรมบัญชีกลาง (tier_1 และ tier_3) tier_2 ปรับได้ในหน้า Admin
    หมายเหตุ: 38641 Excel อ่านชื่อเป็น date — แก้ไขเป็น "Oct-1" ตาม context
    """
    # (code, name, price_baht)
    IHC_OFFICIAL: list[tuple[str, str, int]] = [
        ("38501", "ACT", 270),
        ("38502", "ACTH", 420),
        ("38503", "Alpha-Actinin", 1320),
        ("38504", "AE 1/AE3", 300),
        ("38505", "AFP", 290),
        ("38506", "ALK protein", 420),
        ("38507", "Alpha-inhibin", 390),
        ("38508", "Amyloid A", 540),
        ("38509", "Aromatase", 480),
        ("38510", "AT", 270),
        ("38511", "B-cell his X", 300),
        ("38512", "Bcl-2", 360),
        ("38513", "Bcl-6", 420),
        ("38514", "Bcl-10", 320),
        ("38515", "Ber-EP 4", 290),
        ("38516", "34-beta E12", 350),
        ("38517", "Beta2-Microglobulin", 280),
        ("38518", "Beta-hCG", 290),
        ("38519", "BLA-36", 310),
        ("38520", "BM-2", 380),
        ("38521", "BOB-1", 540),
        ("38522", "C1q", 280),
        ("38523", "C3c", 280),
        ("38524", "Calcitonin", 440),
        ("38525", "Caldesmon", 340),
        ("38526", "Calponin", 340),
        ("38527", "Calretinin", 390),
        ("38528", "CAM 5.2", 330),
        ("38529", "Cathepsin D", 330),
        ("38530", "CD1a", 720),
        ("38531", "CD3", 430),
        ("38532", "CD4", 420),
        ("38533", "CD5", 400),
        ("38534", "CD8", 480),
        ("38535", "CD10", 430),
        ("38536", "CD15", 300),
        ("38537", "CD20", 360),
        ("38538", "CD21", 300),
        ("38539", "CD23", 490),
        ("38540", "CD30", 330),
        ("38541", "CD31", 320),
        ("38542", "CD34", 390),
        ("38543", "CD35", 300),
        ("38544", "CD43", 340),
        ("38545", "CD45", 340),
        ("38546", "CD56", 350),
        ("38547", "CD57", 410),
        ("38548", "CD68", 320),
        ("38549", "CD74", 250),
        ("38550", "CD79a", 400),
        ("38551", "CD99", 360),
        ("38552", "CD117", 560),
        ("38553", "CD138", 310),
        ("38554", "CD141 (Thrombomodulin)", 350),
        ("38555", "CD146 MCAM", 350),
        ("38556", "CDW75", 250),
        ("38557", "CDX-2", 320),
        ("38558", "CEA", 320),
        ("38559", "Chlamydia", 340),
        ("38560", "Chromogranin A", 450),
        ("38561", "CK-5/6", 410),
        ("38562", "CK-7", 350),
        ("38563", "CK-8", 330),
        ("38564", "CK-19", 350),
        ("38565", "CK-20", 340),
        ("38566", "CMV", 320),
        ("38567", "c-myc", 400),
        ("38568", "Collagen IV", 340),
        ("38569", "Collagen VI", 1450),
        ("38570", "Cryptosporidium", 300),
        ("38571", "Cyclin D1", 430),
        ("38572", "Desmin", 340),
        ("38573", "Dysferlin", 1550),
        ("38574", "Dystrophin-1 (Rod domain)", 490),
        ("38575", "Dystrophin-2 (C-terminus)", 490),
        ("38576", "Dystrophin-3 (N-terminus)", 490),
        ("38577", "EBV", 250),
        ("38578", "E-cadherin", 360),
        ("38579", "EGFR", 460),
        ("38580", "EMA", 280),
        ("38581", "Emerin", 1450),
        ("38582", "ER (Estrogen Receptor)", 570),
        ("38583", "Factor VIII", 310),
        ("38584", "Fascin", 350),
        ("38585", "FDRC Predilute", 480),
        ("38586", "Fibrinogen", 250),
        ("38587", "FSH", 320),
        ("38588", "Gastrin", 400),
        ("38589", "GCDFP-15", 400),
        ("38590", "GFAP", 330),
        ("38591", "Glucagon", 340),
        ("38592", "Glycophorin A", 380),
        ("38593", "Glycophorin C", 320),
        ("38594", "Granzyme B", 430),
        ("38595", "Growth hormone", 350),
        ("38596", "H. pylori", 320),
        ("38597", "HBcAg", 300),
        ("38598", "HBsAg", 340),
        ("38599", "HCV", 450),
        ("38601", "Hemoglobin", 220),
        ("38602", "Hepatocyte", 370),
        ("38603", "HER-2", 740),
        ("38604", "HHF-35", 340),
        ("38605", "HLA class II", 290),
        ("38606", "HMB-45", 360),
        ("38607", "hPL (Placental Lactogen)", 260),
        ("38608", "HPV", 260),
        ("38609", "HSV (type II)", 270),
        ("38610", "IgA", 280),
        ("38611", "IgD", 280),
        ("38612", "IgG", 280),
        ("38613", "IgM", 250),
        ("38614", "Insulin", 370),
        ("38615", "Kappa", 280),
        ("38616", "Ker I (human)", 220),
        ("38617", "Ker II (Bovine)", 210),
        ("38618", "Ki-67 (MIB-1)", 390),
        ("38619", "Lambda", 300),
        ("38620", "LH", 320),
        ("38621", "Lysozyme", 260),
        ("38622", "Mac-387", 280),
        ("38623", "MAK-6", 250),
        ("38624", "Mast cell tryptase", 320),
        ("38625", "Melan A", 400),
        ("38626", "Merosin", 1440),
        ("38627", "MNF 116", 310),
        ("38628", "MOC-31", 380),
        ("38629", "MUC-2", 640),
        ("38630", "MUC-5AC", 640),
        ("38631", "MUM-1", 410),
        ("38632", "Myelin (MBP 88)", 340),
        ("38633", "Myeloperoxidase", 310),
        ("38634", "Myogenin", 380),
        ("38635", "Myoglobin", 260),
        ("38636", "Myosin", 340),
        ("38637", "Neuroblastoma", 300),
        ("38638", "Neurofilament", 330),
        ("38639", "Neutrophil elastase", 290),
        ("38640", "NSE", 460),
        ("38641", "Oct-1", 560),  # Excel แสดงผิดเป็น date — แก้ไขเป็น Oct-1
        ("38642", "OCT-3/4", 350),
        ("38643", "Osteocalcin", 1190),
        ("38644", "Osteonectin", 400),
        ("38645", "P504S (AMACR)", 570),
        ("38646", "p53", 390),
        ("38647", "p57", 450),
        ("38648", "p63", 450),
        ("38649", "Parathyroid hormone", 380),
        ("38650", "Perforin", 390),
        ("38651", "Peripherin", 390),
        ("38652", "PGP 9.5", 380),
        ("38653", "PIP", 390),
        ("38654", "PLAP", 320),
        ("38655", "Plasma cell", 290),
        ("38656", "Plt. (GP IIIa)", 310),
        ("38657", "Pneumocystis", 320),
        ("38658", "PR (Progesterone Receptor)", 570),
        ("38659", "Prolactin", 360),
        ("38660", "PSA", 290),
        ("38661", "PSAP", 270),
        ("38662", "PTEN", 360),
        ("38663", "Renal cell carcinoma Ag", 320),
        ("38664", "S-100", 310),
        ("38665", "Alpha-Sarcoglycan", 1260),
        ("38666", "Beta-Sarcoglycan", 1480),
        ("38667", "Delta-Sarcoglycan", 1480),
        ("38668", "Gamma-Sarcoglycan", 1490),
        ("38669", "Sarcomeric actin", 320),
        ("38670", "Serotonin", 280),
        ("38671", "Smooth muscle actin (SMA)", 310),
        ("38672", "Smooth muscle myosin heavy chain", 390),
        ("38673", "Somatostatin", 350),
        ("38674", "Spectrin", 320),
        ("38675", "Surfactant", 450),
        ("38676", "Synaptophysin", 360),
        ("38677", "T-cell (UCHL-1)", 280),
        ("38678", "TdT", 670),
        ("38679", "Testosterone", 270),
        ("38680", "Thyroglobulin (TG)", 270),
        ("38681", "TIA-1", 390),
        ("38682", "TTF-1", 400),
        ("38683", "Tyrosinase", 470),
        ("38684", "Ulex B279", 220),
        ("38685", "Ulex Z921", 210),
        ("38686", "VEGF", 540),
        ("38687", "Villin", 330),
        ("38688", "Vimentin", 360),
        ("38689", "Wilms' tumor (WT-1)", 370),
    ]

    print("🌱 Seeding IHC AP Tests (บัญชีที่ 2 หมวด 7 — อิมมูโนฮิสโตเคมี)...")
    added = skipped = 0
    for code, name, price in IHC_OFFICIAL:
        exists = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.code == code)
            .first()
        )
        if exists:
            skipped += 1
            continue
        db.add(
            AnatomicalPathologyTest(
                code=code,
                name=name,
                category="IHC",
                price_tier_1=price,
                price_tier_2=price,
                price_tier_3=price,
                is_external=True,
                is_system_default=False,
            )
        )
        print(f"   + [{code}] {name} ({price} บาท)")
        added += 1
    db.commit()
    print(f"✅ IHC Official: เพิ่ม {added} รายการ, ข้าม {skipped} (มีอยู่แล้ว)")


def seed_ap_tests(db: Session):
    ap_tests = [
        {
            "name": "H&E",
            "category": "Histochem",
            "price_tier_1": 0,
            "price_tier_2": 0,
            "price_tier_3": 0,
            "is_external": False,
            "system_code": "HE_ROUTINE",
            "is_system_default": True,
        },
        {
            "name": "Recut",
            "category": "Histochem",
            "price_tier_1": 0,
            "price_tier_2": 0,
            "price_tier_3": 0,
            "is_external": False,
            "system_code": "HE_RECUT",
            "is_system_default": True,
        },
        {
            "code": "38301",
            "name": "PAP (routine)",
            "category": "Cytology",
            "price_tier_1": 150,
            "price_tier_2": 250,
            "price_tier_3": 150,
            "is_external": False,
            "description": "Standard stain for cervical screening and non-gynecologic cytology",
            "system_code": "PAP_ROUTINE",
            "is_system_default": True,
        },
        {
            "code": "38001",
            "name": "Surgical biopsy (ขนาดเล็กกว่าหรือเท่ากับ 2 ซม.)",
            "category": "Surgical Pathology",
            "price_tier_1": 400,
            "price_tier_2": 600,
            "price_tier_3": 400,
            "is_external": False,
            "description": "Biopsy < 2 cm",
        },
        {
            "code": "38101",
            "name": "CK7 (Cytokeratin 7)",
            "category": "IHC",
            "price_tier_1": 400,
            "price_tier_2": 600,
            "price_tier_3": 400,
            "is_external": True,
        },
        {
            "code": "38102",
            "name": "CK20 (Cytokeratin 20)",
            "category": "IHC",
            "price_tier_1": 400,
            "price_tier_2": 600,
            "price_tier_3": 400,
            "is_external": True,
        },
        {
            "code": "38103",
            "name": "Pan-Cytokeratin (AE1/AE3)",
            "category": "IHC",
            "price_tier_1": 400,
            "price_tier_2": 600,
            "price_tier_3": 400,
            "is_external": True,
        },
        {
            "code": "38104",
            "name": "ER (Estrogen Receptor)",
            "category": "IHC",
            "price_tier_1": 500,
            "price_tier_2": 800,
            "price_tier_3": 500,
            "is_external": True,
        },
        {
            "code": "38105",
            "name": "PR (Progesterone Receptor)",
            "category": "IHC",
            "price_tier_1": 500,
            "price_tier_2": 800,
            "price_tier_3": 500,
            "is_external": True,
        },
        {
            "code": "38106",
            "name": "HER2 (c-erbB-2)",
            "category": "IHC",
            "price_tier_1": 600,
            "price_tier_2": 1000,
            "price_tier_3": 600,
            "is_external": True,
        },
        {
            "code": "38107",
            "name": "Ki-67",
            "category": "IHC",
            "price_tier_1": 400,
            "price_tier_2": 600,
            "price_tier_3": 400,
            "is_external": True,
        },
        {
            "code": "38201",
            "name": "AFB (Acid Fast Bacilli)",
            "category": "Histochem",
            "price_tier_1": 100,
            "price_tier_2": 200,
            "price_tier_3": 100,
            "is_external": False,
            "description": "Special stain for Mycobacteria",
        },
        {
            "code": "38202",
            "name": "GMS (Grocott's Methenamine Silver)",
            "category": "Histochem",
            "price_tier_1": 200,
            "price_tier_2": 300,
            "price_tier_3": 200,
            "is_external": False,
            "description": "Special stain for Fungi",
        },
        {
            "code": "38302",
            "name": "Cell Block Preparation (H&E)",
            "category": "Cytology",
            "price_tier_1": 300,
            "price_tier_2": 500,
            "price_tier_3": 300,
            "is_external": False,
            "description": "Cell block processing for histology examination",
        },
    ]

    print("🌱 Seeding Anatomical Pathology Tests...")
    for test in ap_tests:
        exists = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.name == test["name"])
            .first()
        )

        if not exists:
            db.add(AnatomicalPathologyTest(**test))
            print(f"   - Added Test: {test['name']}")

    db.commit()


def seed_specimen_templates(db: Session):
    specimen_names = [
        "Appendix, appendectomy",
        "Appendix, exploratory laparotomy",
        "Appendix, laparoscopic appendectomy",
        "Breast, Left, core needle biopsy",
        "Breast, Right, core needle biopsy",
        "Breast, Left, wide excision",
        "Breast, Right, wide excision",
        "Cervix, punch biopsy",
        "Colon, polyp, polypectomy",
        "Duodenum, biopsy",
        "Endometrium, fractional curettage",
        "Esophagus, biopsy",
        "Gallbladder, cholecystectomy",
        "Gallbladder, laparoscopic cholecystectomy",
        "Hemorrhoid, hemorrhoidectomy",
        "Lipoma, excision",
        "Liver, needle biopsy",
        "Lymph node, Left, excision biopsy",
        "Lymph node, Right, excision biopsy",
        "Lymph node, Neck, Left, excision biopsy",
        "Lymph node, Neck, Right, excision biopsy",
        "Lymph node, Axilla, Left, excision biopsy",
        "Lymph node, Axilla, Right, excision biopsy",
        "Lymph node, Groin, Left, excision biopsy",
        "Lymph node, Groin, Right, excision biopsy",
        "Nasal polyp, polypectomy",
        "Ovary, Left, cystectomy",
        "Ovary, Right, cystectomy",
        "Prostate, needle biopsy",
        "Prostate, TUR-P",
        "Rectum, biopsy",
        "Sebaceous cyst, excision",
        "Skin, Face, biopsy",
        "Skin, Forehead, biopsy",
        "Skin, Nose, biopsy",
        "Skin, Cheek, Left, biopsy",
        "Skin, Cheek, Right, biopsy",
        "Skin, Chin, biopsy",
        "Skin, Eyelid, Upper, Left, biopsy",
        "Skin, Eyelid, Lower, Left, biopsy",
        "Skin, Eyelid, Upper, Right, biopsy",
        "Skin, Eyelid, Lower, Right, biopsy",
        "Skin, Ear, Left, biopsy",
        "Skin, Ear, Right, biopsy",
        "Skin, Scalp, biopsy",
        "Skin, Neck, biopsy",
        "Skin, Chest, biopsy",
        "Skin, Abdomen, biopsy",
        "Skin, Back, Upper, biopsy",
        "Skin, Back, Lower, biopsy",
        "Skin, Shoulder, Left, biopsy",
        "Skin, Shoulder, Right, biopsy",
        "Skin, Axilla, Left, biopsy",
        "Skin, Axilla, Right, biopsy",
        "Skin, Groin, biopsy",
        "Skin, Perineum, biopsy",
        "Skin, Arm, Left, biopsy",
        "Skin, Arm, Right, biopsy",
        "Skin, Hand, Left, biopsy",
        "Skin, Hand, Right, biopsy",
        "Skin, Thigh, Left, biopsy",
        "Skin, Thigh, Right, biopsy",
        "Skin, Leg, Left, biopsy",
        "Skin, Leg, Right, biopsy",
        "Skin, Foot, Dorsum, Left, biopsy",
        "Skin, Foot, Dorsum, Right, biopsy",
        "Skin, Foot, Sole, Left, biopsy",
        "Skin, Foot, Sole, Right, biopsy",
        "Skin, Toe, Left, biopsy",
        "Skin, Toe, Right, biopsy",
        "Skin, punch biopsy",
        "Skin, shave biopsy",
        "Skin, wide excision (Elliptical)",
        "Stomach, biopsy",
        "Thyroid, Left, FNAB",
        "Thyroid, Right, FNAB",
        "Thyroid, total thyroidectomy",
        "Tonsil, Left, tonsillectomy",
        "Tonsil, Right, tonsillectomy",
        "Tonsils, bilateral tonsillectomy",
        "Urinary bladder, TUR-BT",
        "Uterus, total hysterectomy",
        "Fallopian tube, Left, salpingectomy",
        "Fallopian tube, Right, salpingectomy",
    ]

    print(f"🌱 Seeding {len(specimen_names)} Unique Specimen Templates...")

    for name in specimen_names:
        exists = (
            db.query(SpecimenTemplate).filter(SpecimenTemplate.name == name).first()
        )
        if not exists:
            db.add(SpecimenTemplate(name=name))
            print(f"   [+] Added: {name}")

    db.commit()
    print("✅ Specimen Templates Seeding Completed.")


def seed_cytology_specimen_templates(db: Session):
    """
    Default Specimen Types for Gyne + Non-Gyne Cytology registration.
    default_slide_count / requires_slide_count only matter for nongyne_cyto
    today (drives auto-created NongyneCytologyStain rows at registration —
    see create_nongyne_case). Adjust freely from Admin > Cytology Specimen
    Type Manager; this is just a sane starting point.
    """
    gyne_names = [
        "Conventional",
        "Liquid Based (LBC)",
    ]

    # Ordered (dict/list order = seed sort_order): Fluid + FNA are the most
    # commonly used Non-Gyne types, kept at the top.
    # name -> (default_slide_count, requires_slide_count, requires_volume)
    nongyne_specs = {
        "Fluid": (2, False, True),  # received volume matters for adequacy — warn staff to enter it
        "FNA": (2, True, False),  # slide count varies per case (number of passes) — warn staff to enter it
        "Urine": (2, False, False),
        "Sputum": (2, False, False),
        "CSF": (1, False, False),
        "Brushing": (2, False, False),
        "Washing": (2, False, False),
        "Other": (1, False, False),
    }

    print(f"🌱 Seeding {len(gyne_names)} Gyne Cytology Specimen Types...")
    for sort_order, name in enumerate(gyne_names):
        exists = (
            db.query(SpecimenTemplate)
            .filter(SpecimenTemplate.name == name, SpecimenTemplate.category == "gyne_cyto")
            .first()
        )
        if not exists:
            db.add(SpecimenTemplate(name=name, category="gyne_cyto", sort_order=sort_order))
            print(f"   [+] Added (Gyne): {name}")

    print(f"🌱 Seeding {len(nongyne_specs)} Non-Gyne Cytology Specimen Types...")
    for sort_order, (name, (default_slide_count, requires_slide_count, requires_volume)) in enumerate(
        nongyne_specs.items()
    ):
        exists = (
            db.query(SpecimenTemplate)
            .filter(SpecimenTemplate.name == name, SpecimenTemplate.category == "nongyne_cyto")
            .first()
        )
        if not exists:
            db.add(
                SpecimenTemplate(
                    name=name,
                    category="nongyne_cyto",
                    default_slide_count=default_slide_count,
                    requires_slide_count=requires_slide_count,
                    requires_volume=requires_volume,
                    sort_order=sort_order,
                )
            )
            print(f"   [+] Added (Non-Gyne): {name}")

    db.commit()
    print("✅ Cytology Specimen Templates Seeding Completed.")


def seed_gross_templates(db: Session):
    admin = db.query(User).filter(User.username == "admin").first()
    admin_id = admin.id if admin else None

    templates = [
        {
            "name": "Standard Appendix",
            "category": "GI",
            "raw_content": (
                "Received in formalin is appendix, measuring {{length}} cm x {{diameter}} cm. "
                "Serosal surface is {{serosa_appearance:smooth and glistening,dull and congested,covered with fibrin}} "
                "and covered with {{exudate_type:none,pus,fibrinopurulent exudate,blood}}. "
                "\n\nOn sectioning, the lumen is {{lumen_status:patent,obliterated,dilated}} "
                "and contains {{contents:fecalith,pus,mucus}}. The wall thickness measures {{wall_thickness}} mm."
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Standard Gallbladder",
            "category": "GI",
            "raw_content": (
                "Received in formalin is a gallbladder measuring {{length}} x {{width}} x {{thickness}} cm. "
                "Serosal surface is {{serosa:smooth,dull,rough}}. "
                "The wall thickness is {{wall_thickness}} mm. "
                "The lumen contains {{contents:greenish bile,gallstones,sludge}}. "
                "The mucosa is {{mucosa:velvety,flat,ulcerated}}."
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Skin Punch Biopsy",
            "category": "Skin",
            "raw_content": (
                "Received in formalin is a piece of skin punch biopsy measuring {{diameter}} cm in diameter "
                "and {{thickness}} cm in thickness. The skin surface is {{surface:unremarkable,ulcerated,pigmented,scaly}}. "
                "Sectioning shows {{internal_appearance:tan-white tissue,hemorrhage,cystic space}}. "
                "Representative sections are submitted in {{cassette_no}}."
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Skin Elliptical Excision",
            "category": "Skin",
            "raw_content": (
                "Received in formalin is an elliptical skin excision measuring {{length}} x {{width}} x {{depth}} cm. "
                "The skin surface shows {{lesion_type:a nodule,an ulcer,a plaque}} measuring {{lesion_size}} cm. "
                "The lesion is {{distance_to_margin}} cm from the closest surgical margin. "
                "On sectioning, the lesion is {{color:white,tan,brown,black}} and {{consistency:firm,soft,friable}}."
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Breast Core Biopsy",
            "category": "Breast",
            "raw_content": (
                "Received in formalin are {{number_of_cores:3,4,5,multiple}} tan-white core(s) of tissue, "
                "measuring from {{min_length}} to {{max_length}} cm in length. "
                "Specimen is submitted entirely in {{cassette_no}}."
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Small Endoscopic Biopsy (Generic)",
            "category": "General",
            "raw_content": (
                "Received in formalin are {{number_of_pieces:multiple,two,three}} small pieces of "
                "{{color:tan-pink,tan-white,reddish}} soft tissue, "
                "measuring {{aggregate_size}} cm in aggregate diameter. "
                "Entirely submitted in {{cassette_no}}."
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Colon Colectomy (Tumor Specimen)",
            "category": "GI",
            "raw_content": (
                "SPECIMEN: Received in formalin is a segment of {{part:right colon,transverse colon,left colon,sigmoid colon}} "
                "measuring {{length}} cm in length and {{diameter}} cm in diameter. "
                "Attached is the pericolic fat measuring up to {{fat_thickness}} cm in thickness. "
                "\n\nTUMOR: Located {{dist_to_distal_margin}} cm from the distal margin and {{dist_to_proximal_margin}} cm from the proximal margin "
                "is {{appearance:a fungating,an ulcerative,an annular-constricting}} mass, "
                "measuring {{tumor_size_l}} x {{tumor_size_w}} x {{tumor_size_d}} cm. "
                "The tumor {{invasion:is confined to the wall,grossly penetrates the serosa,involves the pericolic fat}}. "
                "\n\nOTHER FINDINGS: The remaining mucosa is {{mucosa:unremarkable,show multiple polyps,show diverticula}}. "
                "\n\nLYMPH NODES: A total of {{ln_count}} lymph nodes are identified in the pericolic fat. "
                "\n\nREPRESENTATIVE SECTIONS: "
                "\n- Tumor with deepest invasion: {{cassette_tumor}}"
                "\n- Proximal and distal margins: {{cassette_margins}}"
                "\n- Representative lymph nodes: {{cassette_ln}}"
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Breast: Lumpectomy / Wide Excision",
            "category": "Breast",
            "raw_content": (
                "SPECIMEN: Received {{status:fresh,in formalin}} is a {{side:left,right}} breast tissue "
                "designated as '{{specimen_label}}', measuring {{length}} x {{width}} x {{thickness}} cm. "
                "\n\nORIENTATIONS: The specimen is oriented with {{orientation:long silk-superior / short silk-lateral,orienting sutures}}. "
                "\n\nLESION: On sectioning, there is {{lesion_appearance:a firm tan-white mass,an ill-defined area of grittiness,a cystic lesion}} "
                "measuring {{size_l}} x {{size_w}} x {{size_d}} cm. "
                "The lesion is {{distance_to_closest}} cm from the {{closest_margin:superior,inferior,lateral,medial,anterior,posterior}} margin. "
                "\n\nREMAINING TISSUE: The remaining breast tissue is {{remaining:fibrofatty,dense and white,unremarkable}}."
            ),
            "created_by_id": admin_id,
        },
        {
            "name": "Breast: Total Mastectomy",
            "category": "Breast",
            "raw_content": (
                "SPECIMEN: Received {{status:fresh,in formalin}} is a {{side:left,right}} total mastectomy "
                "measuring {{length}} x {{width}} x {{thickness}} cm. "
                "The skin ellipse measures {{skin_l}} x {{skin_w}} cm and includes an {{nipple:intact,everted,inverted}} nipple. "
                "\n\nLESION: Sectioning reveals {{lesion_type:a dominant mass,multiple nodules,an area of calcification}} "
                "located in the {{quadrant:upper outer,upper inner,lower outer,lower inner,subareolar}} quadrant. "
                "The lesion measures {{size}} cm in greatest dimension and is {{dist_to_deep}} cm from the deep margin. "
                "\n\nLYMPH NODES: The axillary tail contains {{ln_count}} lymph nodes, the largest measuring {{ln_max_size}} cm. "
            ),
            "created_by_id": admin_id,
        },
    ]

    print("🌱 Seeding Gross Templates...")
    for t in templates:
        exists = db.query(GrossTemplate).filter(GrossTemplate.name == t["name"]).first()
        if not exists:
            db.add(GrossTemplate(**t))
            print(f"   - Added Template: {t['name']}")
    db.commit()


def seed_diagnostic_templates(db: Session):
    admin = db.query(User).filter(User.username == "admin").first()
    admin_id = admin.id if admin else None

    existing = (
        db.query(DiagnosticTemplate)
        .filter(DiagnosticTemplate.name == "Colorectal Carcinoma (AJCC 8th)")
        .first()
    )
    if existing:
        print("Diagnostic seed data already exists. Skipping...")
        return

    templates = [
        {
            "name": "Colorectal Carcinoma (AJCC 8th Edition)",
            "category": "GI",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Cecum|Ascending colon|Transverse colon|Descending colon|Sigmoid colon|Rectum}}, "
                "{{Procedure:Right hemicolectomy|Left hemicolectomy|Low anterior resection|Abdominoperineal resection}}: </strong></p>"
                "<ul>"
                "<li><p>{{Histologic_Type:Adenocarcinoma | Mucinous adenocarcinoma | Poorly cohesive carcinoma | Signet-ring cell carcinoma | "
                "Medullary carcinoma | Serrated adenocarcinoma | Micropapillary adenocarcinoma | Adenoma-like adenocarcinoma | "
                "Adenosquamous carcinoma | Undifferentiated carcinoma, NOS | Carcinoma with sarcomatoid component | "
                "Large cell neuroendocrine carcinoma | Small cell neuroendocrine carcinoma | Mixed neuroendocrine-non-neuroendocrine neoplasm (MiNEN)}} </p></li>"
                "<li><p>Histologic Grade: {{Grade:G1, well-differentiated|G2, moderately differentiated|G3, poorly differentiated|G4, undifferentiated}} </p></li>"
                "<li><p>Tumor Size: {{Size_cm}} cm </p></li>"
                "<li><p>Tumor Extent: {{Tumor_Extent:No invasion (high-grade dysplasia) | Invades lamina propria / muscularis mucosae (intramucosal carcinoma) | "
                "Invades submucosa | Invades into muscularis propria | Invades through muscularis propria into the pericolic or perirectal tissue | "
                "Invades visceral peritoneum | Directly invades or adheres to adjacent structure(s)}} </p></li>"
                "<li><p>Macroscopic Tumor Perforation: {{Tumor_Perforation:Not identified | Present}} </p></li>"
                "<li><p>Lymphatic and / or Vascular Invasion: {{LVI:Not identified | Small vessel | Large vessel (venous), intramural | "
                "Large vessel (venous), extramural | Small and Large vessel | Present, NOS}} </p></li>"
                "<li><p>Perineural Invasion: {{Perineural_Invasion:Not identified | Present}} </p></li>"
                "<li><p>Margin Status for Invasive Carcinoma: All margins negative for invasive carcinoma "
                "{{Margin:Closest Margin to Invasive Carcinoma|Margin Involved by Invasive Carcinoma}}: "
                "{{Margin_Location:Proximal | Distal | Radial (circumferential) | Mesenteric | Deep | Mucosal}} : {{Distance}} cm </p></li>"
                "<li><p>Regional Lymph Node Status: {{Lymph Node:All regional lymph nodes negative for tumor|Tumor present in regional lymph node(s)}} </p>"
                "<ul>"
                "<li><p>Number of Lymph Nodes with Tumor: {{Nodes_Positive}} </p></li>"
                "<li><p>Number of Lymph Nodes Examined: {{Nodes_Examined}} </p></li>"
                "</ul></li>"
                "<li><p>Tumor Deposits: {{Tumor Deposits:Not identified|Present}} </p>"
                "<ul>"
                "<li><p>Number of Tumor Deposits: {{TD_Count}} </p></li>"
                "</ul></li>"
                "<li><p>pTNM CLASSIFICATION (AJCC 8th Edition)</p></li>"
                "</ul>"
            ),
            "microscopic_content": "<p>The sections show...</p>",
            "is_active": True,
            "created_by_id": admin_id,
        }
    ]
    print("🌱 Seeding Diagnostic Templates...")
    for t_data in templates:
        template = DiagnosticTemplate(**t_data)
        db.add(template)

    try:
        db.commit()
        print("Diagnostic templates seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding diagnostic templates: {e}")


def seed_nongyne_diagnostic_templates(db: Session):
    admin = db.query(User).filter(User.username == "admin").first()
    admin_id = admin.id if admin else None

    existing = (
        db.query(DiagnosticTemplate)
        .filter(DiagnosticTemplate.category.like("Nongyne - %"))
        .first()
    )
    if existing:
        print("Non-Gyne diagnostic template seed data already exists. Skipping...")
        return

    templates = [
        # ─── URINE (Paris System) ─────────────────────────────────────────────
        {
            "name": "Urine: Negative for High-Grade Urothelial Carcinoma (NHGUC)",
            "category": "Nongyne - Urine",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Urine, voided|Urine, catheterized|Urine, ileal conduit|Bladder wash|Ureteral wash|Renal pelvic wash}}</strong></p>"
                "<p><strong>Adequacy:</strong> {{Adequacy:Satisfactory|Unsatisfactory}} for evaluation. {{Adequacy_Note}}</p>"
                "<p><strong>Diagnosis:</strong> Negative for High-Grade Urothelial Carcinoma (NHGUC)</p>"
            ),
            "microscopic_content": (
                "<p>The smear is {{Cellularity:adequate|scant}} in cellularity. "
                "Urothelial cells are present showing {{Description:no significant nuclear atypia|mild reactive changes}}. "
                "No high-grade urothelial carcinoma cells are identified. "
                "{{Additional:Background is clean.|Background shows red blood cells.|Inflammatory cells are present.}}</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Urine: Atypical Urothelial Cells (AUC)",
            "category": "Nongyne - Urine",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Urine, voided|Urine, catheterized|Bladder wash|Ureteral wash}}</strong></p>"
                "<p><strong>Adequacy:</strong> {{Adequacy:Satisfactory|Unsatisfactory}} for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Atypical Urothelial Cells (AUC)</p>"
                "<p><em>Note: These cells cannot be reliably classified as either benign reactive or high-grade urothelial carcinoma. "
                "Correlation with cystoscopy and clinical findings is recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows {{Cellularity:adequate|scant}} cellularity. "
                "Atypical urothelial cells are present with {{Feature:mild nuclear enlargement and irregular nuclear contours|"
                "mild hyperchromasia and irregular nuclear membranes}}. "
                "The nuclear-to-cytoplasmic ratio is {{NC_Ratio:mildly|moderately}} increased. "
                "Nucleoli are {{Nucleoli:inconspicuous|small}}. "
                "These features exceed reactive/degenerative changes but are insufficient for a diagnosis of high-grade urothelial carcinoma.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Urine: Suspicious for High-Grade Urothelial Carcinoma (SHGUC)",
            "category": "Nongyne - Urine",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Urine, voided|Urine, catheterized|Bladder wash}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Suspicious for High-Grade Urothelial Carcinoma (SHGUC)</p>"
                "<p><em>Note: Highly suspicious but quantitatively insufficient for definitive malignant diagnosis. "
                "Cystoscopy and biopsy are strongly recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows single and loosely clustered urothelial cells with marked nuclear atypia, "
                "including {{Feature:significantly increased N:C ratio, hyperchromasia, and irregular nuclear contours|"
                "coarse chromatin, prominent nucleoli, and irregular nuclear membranes}}. "
                "The number of atypical cells is {{Quantity:small|limited}} for a definitive diagnosis of high-grade urothelial carcinoma.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Urine: High-Grade Urothelial Carcinoma (HGUC)",
            "category": "Nongyne - Urine",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Urine, voided|Urine, catheterized|Bladder wash}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for High-Grade Urothelial Carcinoma (HGUC)</p>"
            ),
            "microscopic_content": (
                "<p>The smear is {{Cellularity:moderately|highly}} cellular. "
                "Malignant urothelial cells are present as {{Arrangement:single cells|clusters|both single cells and clusters}} "
                "with markedly increased nuclear-to-cytoplasmic ratio, "
                "{{Chromatin:coarse, irregular chromatin|hyperchromasia}}, "
                "{{Nucleoli:prominent nucleoli|inconspicuous nucleoli}}, "
                "and irregular nuclear membranes. "
                "{{Necrosis:Necrotic background is present.|No necrotic background.}} "
                "The findings are consistent with high-grade urothelial carcinoma.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Urine: Low-Grade Urothelial Neoplasm (LGUN)",
            "category": "Nongyne - Urine",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Urine, voided|Bladder wash}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Low-Grade Urothelial Neoplasm (LGUN)</p>"
                "<p><em>Note: Correlation with cystoscopy is recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows papillary clusters of urothelial cells with mild nuclear enlargement, "
                "{{Feature:slight nuclear membrane irregularity|mild variation in nuclear size}}. "
                "The cells show low nuclear-to-cytoplasmic ratio without prominent nucleoli or coarse chromatin. "
                "The findings are consistent with a low-grade urothelial neoplasm.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },

        # ─── SPUTUM / BAL / BRONCHIAL ─────────────────────────────────────────
        {
            "name": "Respiratory: Negative for Malignancy",
            "category": "Nongyne - Sputum",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Sputum|Bronchoalveolar lavage (BAL)|Bronchial wash|Bronchial brushing}}</strong></p>"
                "<p><strong>Adequacy:</strong> {{Adequacy:Satisfactory|Unsatisfactory — {{Reason:no alveolar macrophages|predominantly squamous cells|scant cellularity}}}} for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Negative for Malignancy</p>"
                "<p>{{Additional_Note}}</p>"
            ),
            "microscopic_content": (
                "<p>The preparation shows {{Cellularity:adequate|scant}} cellularity consisting predominantly of "
                "{{Cells:alveolar macrophages and inflammatory cells|bronchial epithelial cells and alveolar macrophages}}. "
                "{{Feature:No atypical cells are identified.|Reactive bronchial cells with ciliary tufts are present.}} "
                "{{Organisms:No organisms identified.|}} "
                "The findings are negative for malignancy.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Respiratory: Atypical Cells — Reactive/Inflammatory",
            "category": "Nongyne - Sputum",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Sputum|Bronchoalveolar lavage (BAL)|Bronchial wash|Bronchial brushing}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Atypical Cells Present, Favor Reactive/Inflammatory</p>"
                "<p><em>Note: Clinical and radiologic correlation is recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows {{Cells:bronchial epithelial cells|mixed inflammatory cells}} with "
                "{{Atypia:mild nuclear enlargement and prominent nucleoli consistent with reactive changes|"
                "cytoplasmic vacuolization and nuclear atypia}}. "
                "The atypia is considered reactive in the setting of {{Setting:infection|inflammation|prior therapy}}. "
                "No definitive malignant cells are identified.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Respiratory: Positive for Malignancy — Adenocarcinoma",
            "category": "Nongyne - Sputum",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Bronchoalveolar lavage (BAL)|Bronchial wash|Bronchial brushing|Sputum}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for Malignancy — Adenocarcinoma</p>"
                "<p>{{Comment}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear shows malignant cells arranged in {{Arrangement:acinar/glandular structures|papillary clusters|"
                "single cells and small clusters}} with {{Features:abundant vacuolated cytoplasm, eccentric nuclei, and prominent nucleoli|"
                "overlapping nuclei, irregular nuclear membranes, and prominent nucleoli}}. "
                "{{Mucin:Intracytoplasmic mucin is identified.|}} "
                "The morphologic features are consistent with adenocarcinoma, "
                "{{Origin:likely of pulmonary origin|possibly metastatic — clinical correlation recommended}}.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Respiratory: Positive for Malignancy — Squamous Cell Carcinoma",
            "category": "Nongyne - Sputum",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Sputum|Bronchial brushing|Bronchial wash|Bronchoalveolar lavage (BAL)}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for Malignancy — Squamous Cell Carcinoma</p>"
            ),
            "microscopic_content": (
                "<p>Malignant squamous cells are identified as {{Arrangement:single cells|sheets and single cells}} "
                "with {{Features:dense orangeophilic/eosinophilic cytoplasm, irregular hyperchromatic nuclei|"
                "keratinization and intercellular bridges|marked nuclear pleomorphism and coarse chromatin}}. "
                "{{Necrosis:Necrotic background is present (\"dirty\" necrosis).|}} "
                "The findings are consistent with squamous cell carcinoma.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Respiratory: Positive for Malignancy — Small Cell Carcinoma",
            "category": "Nongyne - Sputum",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Bronchial brushing|Bronchial wash|Bronchoalveolar lavage (BAL)|Sputum}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for Malignancy — Small Cell Carcinoma</p>"
                "<p><em>Note: Immunohistochemical confirmation on cell block or biopsy is recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows malignant small cells in {{Arrangement:loose clusters and single cells|sheets with nuclear molding}} "
                "with scant cytoplasm, hyperchromatic nuclei with salt-and-pepper chromatin, "
                "nuclear molding, and absent/inconspicuous nucleoli. "
                "{{Necrosis:Necrosis and apoptotic bodies are prominent.|}} "
                "The morphology is consistent with small cell carcinoma.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },

        # ─── BODY FLUID (Pleural / Peritoneal / Pericardial / CSF) ───────────
        {
            "name": "Fluid: Negative for Malignancy",
            "category": "Nongyne - Fluid",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Pleural fluid|Peritoneal fluid (Ascites)|Pericardial fluid|CSF}}</strong></p>"
                "<p><strong>Adequacy:</strong> {{Adequacy:Satisfactory|Unsatisfactory}} for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Negative for Malignancy</p>"
                "<p>{{Etiology:Consistent with reactive mesothelial cells and chronic inflammation.|"
                "Consistent with reactive/inflammatory process.|No specific etiology identified on cytology.}}</p>"
            ),
            "microscopic_content": (
                "<p>The preparation shows {{Cellularity:adequate|moderate|scant}} cellularity. "
                "{{Cells:Mesothelial cells and lymphocytes are the predominant cell population.|"
                "Reactive mesothelial cells, macrophages, and inflammatory cells are present.}} "
                "{{Atypia:No atypical or malignant cells are identified.|Reactive mesothelial cells with mild nuclear enlargement are present, consistent with reactive change.}} "
                "{{Organisms:No organisms identified.|}}</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Fluid: Atypical Mesothelial/Epithelial Cells Present",
            "category": "Nongyne - Fluid",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Pleural fluid|Peritoneal fluid|Pericardial fluid}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Atypical {{Cell_Type:Mesothelial|Epithelial}} Cells Present</p>"
                "<p><em>Note: The cells show atypical features that exceed reactive changes but are insufficient for a definitive diagnosis of malignancy. "
                "Correlation with clinical history, imaging, and ancillary studies (cell block, IHC) is recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows {{Cell_Type:mesothelial|epithelial}} cells with "
                "{{Feature:mild to moderate nuclear enlargement, prominent nucleoli, and irregular nuclear contours|"
                "mild nuclear atypia exceeding reactive changes}}. "
                "The atypia is insufficient for a definitive diagnosis of malignancy. "
                "{{Cell_Block:Cell block preparation is recommended for ancillary studies.|}} </p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Fluid: Positive for Malignancy — Adenocarcinoma (Metastatic)",
            "category": "Nongyne - Fluid",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Pleural fluid|Peritoneal fluid (Ascites)|Pericardial fluid}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for Malignancy — Metastatic Adenocarcinoma</p>"
                "<p>{{Primary:Primary site: {{Primary_Site:lung|breast|GI tract|ovary|pancreas|unknown — IHC workup recommended}}.|}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear shows malignant epithelial cells arranged in {{Arrangement:three-dimensional clusters and acini|"
                "papillary fronds|single cells and clusters}} with abundant {{Cytoplasm:vacuolated cytoplasm|pale cytoplasm}}, "
                "eccentric nuclei, prominent nucleoli, and irregular nuclear membranes. "
                "{{Mucin:Intracytoplasmic mucin is identified.|}} "
                "{{Background:The background shows necrosis.|}} "
                "{{IHC:Immunohistochemical stains on cell block: {{IHC_Results}}.|}}</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Fluid: Positive for Malignancy — Malignant Mesothelioma",
            "category": "Nongyne - Fluid",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Pleural fluid|Peritoneal fluid|Pericardial fluid}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for Malignancy — Malignant Mesothelioma</p>"
                "<p><em>Note: Correlation with clinical history, imaging, and immunohistochemical confirmation (BAP1, MTAP, etc.) is recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear is cellular and shows malignant mesothelial cells in {{Arrangement:large sheets and morula-like clusters|"
                "clusters and single cells}} with abundant dense cytoplasm, "
                "central nuclei, prominent nucleoli, and {{Feature:intercellular windows (\"knobby\" surface)|intercellular spaces}}. "
                "{{IHC:Immunohistochemical results: {{IHC_Results}}.|}}</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "Fluid: Positive for Malignancy — Lymphoma/Hematologic",
            "category": "Nongyne - Fluid",
            "diagnosis_content": (
                "<p><strong>{{Specimen:Pleural fluid|Peritoneal fluid|Pericardial fluid|CSF}}</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for Malignancy — {{Type:Lymphoma, type to be confirmed by flow cytometry/IHC|"
                "Large cell lymphoma|Acute leukemia}}</p>"
                "<p><em>Note: Flow cytometry and/or immunohistochemistry are recommended for further classification.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows a diffuse population of atypical lymphoid cells with "
                "{{Feature:large irregular nuclei, prominent nucleoli, and scant cytoplasm|"
                "medium to large lymphoid cells with irregular nuclear contours}}. "
                "{{Mitoses:Mitotic figures are frequent.|}} "
                "Correlation with flow cytometry immunophenotyping is recommended.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },

        # ─── FNA — THYROID (Bethesda System) ─────────────────────────────────
        {
            "name": "FNA Thyroid: Bethesda II — Benign",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, Thyroid, {{Location:Right lobe|Left lobe|Isthmus}}, "
                "{{Nodule:nodule|mass}}, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation. "
                "(≥6 groups of ≥10 well-preserved follicular cells)</p>"
                "<p><strong>Diagnosis (Bethesda Category II — Benign):</strong> "
                "{{Diagnosis:Benign follicular nodule|Consistent with a benign follicular nodule (includes adenomatoid nodule, colloid nodule, etc.)|"
                "Consistent with Hashimoto thyroiditis|Consistent with granulomatous (subacute) thyroiditis}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear is {{Cellularity:adequately|moderately}} cellular showing "
                "{{Cells:flat sheets and macrofollicles of follicular cells with abundant colloid|"
                "follicular cells arranged in flat sheets with minimal atypia}}. "
                "{{Colloid:Abundant watery colloid is present.|Colloid is present.}} "
                "{{Atypia:No significant nuclear atypia is identified.|}} "
                "{{Macrophages:Foamy macrophages are present.|}} "
                "The findings are consistent with a benign follicular nodule.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "FNA Thyroid: Bethesda III — AUS/FLUS",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, Thyroid, {{Location:Right lobe|Left lobe|Isthmus}}, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis (Bethesda Category III — Atypia of Undetermined Significance / "
                "Follicular Lesion of Undetermined Significance):</strong></p>"
                "<p>Atypical {{Cell_Type:follicular cells|cells}} of undetermined significance.</p>"
                "<p><em>Note: Repeat FNA or molecular testing is recommended. Risk of malignancy: ~10–30%.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows follicular cells with {{Feature:focal nuclear enlargement and irregular nuclear contours|"
                "a microfollicular pattern exceeding that expected for a benign nodule|"
                "mild nuclear atypia including nuclear groove formation}}. "
                "The atypia is focal and insufficient for a definitive diagnosis of malignancy or a specific follicular neoplasm.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "FNA Thyroid: Bethesda V/VI — Suspicious / Malignant",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, Thyroid, {{Location:Right lobe|Left lobe|Isthmus}}, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis (Bethesda Category {{Bethesda:V — Suspicious for Malignancy|VI — Malignant}}):</strong> "
                "{{Diagnosis:Suspicious for papillary thyroid carcinoma|Papillary thyroid carcinoma|"
                "Suspicious for medullary carcinoma|Medullary carcinoma|Poorly differentiated carcinoma|"
                "Anaplastic (undifferentiated) carcinoma}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear shows {{Arrangement:papillary clusters and single cells|crowded follicular cells}} with "
                "{{Feature:nuclear enlargement, nuclear grooves, intranuclear pseudoinclusions, and pale \"ground-glass\" chromatin|"
                "pleomorphic nuclei with coarse chromatin and prominent nucleoli}}. "
                "{{Psammoma:Psammoma bodies are identified.|}} "
                "{{Comment:The features are characteristic of papillary thyroid carcinoma.|"
                "The features are highly suspicious for but not diagnostic of malignancy.}}</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },

        # ─── FNA — LYMPH NODE ────────────────────────────────────────────────
        {
            "name": "FNA Lymph Node: Reactive Lymphoid Hyperplasia",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, {{Site:Cervical|Supraclavicular|Axillary|Inguinal|Mesenteric}} "
                "lymph node, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Reactive Lymphoid Hyperplasia</p>"
                "<p><em>Note: Clinical correlation is recommended. If symptoms persist, excisional biopsy may be considered.</em></p>"
            ),
            "microscopic_content": (
                "<p>The smear shows a polymorphous population of lymphoid cells including small mature lymphocytes, "
                "intermediate-sized lymphocytes, immunoblasts, and tingible body macrophages. "
                "{{Plasma:Plasma cells are present.|}} "
                "No atypical lymphoid cells, Reed-Sternberg cells, or metastatic carcinoma cells are identified. "
                "The findings are consistent with reactive lymphoid hyperplasia.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "FNA Lymph Node: Metastatic Carcinoma",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, {{Site:Cervical|Supraclavicular|Axillary|Inguinal}} "
                "lymph node, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Metastatic {{Type:Carcinoma|Adenocarcinoma|Squamous Cell Carcinoma|"
                "Undifferentiated Carcinoma}}</p>"
                "<p>{{Origin:Morphology consistent with metastasis from {{Primary_Site:lung|breast|thyroid|nasopharynx|unknown primary}}.|"
                "Primary site unknown — IHC workup on cell block is recommended.}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear shows malignant epithelial cells in {{Arrangement:clusters and sheets|single cells and clusters}} "
                "with {{Features:marked nuclear pleomorphism, prominent nucleoli, and irregular nuclear membranes|"
                "glandular formations and intracytoplasmic mucin|dense eosinophilic cytoplasm and intercellular bridges}}. "
                "{{IHC:IHC panel: {{IHC_Results}}.|}}</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "FNA Lymph Node: Granulomatous Inflammation",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, {{Site:Cervical|Hilar|Mediastinal|Other}} "
                "lymph node, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Granulomatous Inflammation</p>"
                "<p>{{Etiology:Differential diagnosis includes tuberculosis, sarcoidosis, and fungal infection. "
                "AFB stain, culture, and clinical correlation are recommended.|"
                "Consistent with sarcoidosis (non-necrotizing granulomas).|"
                "Necrotizing granulomas — tuberculosis should be excluded by AFB culture and PCR.}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear shows epithelioid histiocytes forming loosely cohesive granulomas, "
                "{{Necrosis:with associated caseous necrosis|without necrosis}}. "
                "{{Giant:Langhans-type giant cells are present.|}} "
                "{{AFB:AFB stain: negative for acid-fast organisms.|}} "
                "No malignant cells are identified.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },

        # ─── FNA — BREAST ────────────────────────────────────────────────────
        {
            "name": "FNA Breast: Benign — Fibrocystic Change / Fibroadenoma",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, {{Side:Right|Left}} breast, {{Location:upper outer quadrant|"
                "upper inner quadrant|lower outer quadrant|lower inner quadrant|subareolar}}, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> {{Diagnosis:Benign — Consistent with fibrocystic change|"
                "Benign — Consistent with fibroadenoma|"
                "Benign — Consistent with benign breast tissue}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear shows {{Cells:benign ductal epithelial cells in flat sheets and cohesive clusters|"
                "biphasic pattern of benign epithelial cells and stromal cells (antler-horn pattern)}}. "
                "{{Myoepithelial:Myoepithelial/stromal cells are present.|}} "
                "{{Foam:Foamy macrophages are identified.|}} "
                "{{Atypia:No nuclear atypia or malignant features are identified.|}} "
                "The findings are {{Diagnosis:consistent with fibrocystic change|consistent with fibroadenoma}}.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
        {
            "name": "FNA Breast: Positive for Malignancy — Carcinoma",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, {{Side:Right|Left}} breast, {{Location:upper outer quadrant|"
                "upper inner quadrant|subareolar}}, {{Size}} cm</strong></p>"
                "<p><strong>Adequacy:</strong> Satisfactory for evaluation.</p>"
                "<p><strong>Diagnosis:</strong> Positive for Malignancy — {{Type:Ductal carcinoma (NOS)|"
                "Lobular carcinoma|Mucinous carcinoma|Medullary carcinoma|Metaplastic carcinoma}}</p>"
            ),
            "microscopic_content": (
                "<p>The smear is cellular showing malignant epithelial cells arranged in "
                "{{Arrangement:discohesive single cells and small clusters|sheets and three-dimensional clusters}} "
                "with {{Features:marked nuclear pleomorphism, prominent nucleoli, irregular nuclear membranes, and loss of cohesion|"
                "enlarged nuclei with coarse chromatin and prominent nucleoli}}. "
                "{{Necrosis:Necrosis is present in the background.|}} "
                "{{Single:Single malignant cells with single-file pattern are present.|}} "
                "The morphologic features are consistent with carcinoma.</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },

        # ─── FNA — SOFT TISSUE / OTHER ────────────────────────────────────────
        {
            "name": "FNA: Insufficient / Non-Diagnostic",
            "category": "Nongyne - FNA",
            "diagnosis_content": (
                "<p><strong>Fine Needle Aspiration, {{Site}}</strong></p>"
                "<p><strong>Adequacy:</strong> Insufficient / Non-Diagnostic</p>"
                "<p><strong>Diagnosis:</strong> Non-diagnostic specimen</p>"
                "<p><em>Note: The specimen is insufficient for cytologic evaluation. "
                "{{Reason:The smear is predominantly blood with scant cellular material.|"
                "Only acellular material/stromal fragments are identified.|"
                "Degenerative changes preclude adequate evaluation.}} "
                "Repeat FNA or biopsy is recommended.</em></p>"
            ),
            "microscopic_content": (
                "<p>{{Content:The smear shows predominantly blood with scant cellular elements.|"
                "Only {{Material:cyst contents/colloid/mucoid material|necrotic debris|adipose tissue}} is present, "
                "without diagnostic cellular components.}}</p>"
            ),
            "is_active": True,
            "created_by_id": admin_id,
        },
    ]

    print("🌱 Seeding Non-Gyne Diagnostic Templates...")
    for t_data in templates:
        template = DiagnosticTemplate(**t_data)
        db.add(template)

    try:
        db.commit()
        print(f"   ✅ {len(templates)} Non-Gyne diagnostic templates seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"   ❌ Error seeding Non-Gyne diagnostic templates: {e}")


def seed_gyne_specimen_adequacy(db: Session):
    # 1. Endocervical / Transformation Zone
    zone_data = [
        {"code": "011", "text": "Endocervical/ transformation zone present."},
        {"code": "012", "text": "Endocervical/ transformation zone absent."},
        {
            "code": "016",
            "text": "Endocervical/ transformation zone absent, status post hysterectomy",
        },
    ]

    # 2. Adequacy (Satisfactory / Unsatisfactory)
    adequacy_data = [
        {"code": "001", "text": "Satisfactory for evaluation (PAP)"},
        {"code": "002", "text": "Satisfactory for evaluation, but limited by (PAP)"},
        {"code": "031", "text": "Unsatisfactory for evaluation (PAP)"},
    ]

    # 3. Quality Indicators / Limitation Reasons (also used as Unsatisfactory reasons)
    quality_data = [
        {"code": "013", "text": "Specimen rejected because of"},
        {"code": "014", "text": "Specimen rejected because slide received unlabeled."},
        {
            "code": "015",
            "text": "Specimen processed and examined but unsatisfactory for evaluation of epithelial abnormality because of",
        },
        {
            "code": "017",
            "text": "Specimen processed and examined but unsatisfactory for evaluation of epithelial abnormality because of insufficient squamous cell component",
        },
        {"code": "027,036", "text": "Air drying artifact."},
        {"code": "022", "text": "Partial obscuring inflammation."},
        {"code": "023", "text": "Partial obscuring blood."},
        {"code": "024,033", "text": "Partial excessive thickness."},
        {"code": "028,035", "text": "Scant cellularity on smear."},
        {"code": None, "text": "Inadequate material."},
        {"code": "025,034", "text": "Poor fixation."},
        {"code": "026", "text": "Poor preparation."},
        {
            "code": "021,031",
            "text": "Partial or complete obscuring by blood and inflammation.",
        },
        {"code": None, "text": "Excessive cytolysis."},
        {"code": "029", "text": "No pertinent clinical patient information."},
        {"code": None, "text": "-"},
        {"code": None, "text": "Borderline cellularity"},
    ]

    print("🌱 Seeding Gyne Specimen Adequacies...")

    def seed_group(group_name, items):
        for item in items:
            exists = (
                db.query(GyneSpecimenAdequacy)
                .filter(
                    GyneSpecimenAdequacy.group_type == group_name,
                    GyneSpecimenAdequacy.text == item["text"],
                )
                .first()
            )
            if not exists:
                db.add(
                    GyneSpecimenAdequacy(
                        group_type=group_name, text=item["text"], code=item.get("code")
                    )
                )

    seed_group("ZONE", zone_data)
    seed_group("ADEQUACY", adequacy_data)
    seed_group("QUALITY", quality_data)

    try:
        db.commit()
        print("✅ Gyne Specimen Adequacies seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding Gyne Specimen Adequacies: {e}")


def seed_gyne_diagnosis_categories(db: Session):
    print("🌱 Seeding Gyne Diagnosis Categories...")

    # 1. Main Categories (Parents)
    # 100, 200, 300, 400
    main_categories = [
        {"code": "100", "text": "Negative for intraepithelial lesion or malignancy"},
        {
            "code": "200",
            "text": "Negative For Intraepithelial lesion or Malignancy : see Interpretation / Result",
        },
        {"code": "300", "text": "Epithelial cell abnormality"},
        {"code": "400", "text": "Other : see Interpretation / Result"},
    ]

    for cat in main_categories:
        exists = (
            db.query(GyneDiagnosisCategory)
            .filter(GyneDiagnosisCategory.code == cat["code"])
            .first()
        )
        if not exists:
            db.add(
                GyneDiagnosisCategory(
                    code=cat["code"], text=cat["text"], parent_id=None
                )
            )
    db.commit()

    # Define sub-categories with their parent codes
    # 101-199 -> Parent 100 (Based on logic, but wait... 101 Atrophy usually goes with 100 NILM?)
    # Let's map based on user's groupings if possible, or assume 1xx->100, 2xx->200, 3xx->300.
    # The provided text had "1 Atrophy 101" then "2 Post partum 102".
    # And "3 Trichomonas 201" ... "17 Endometrial cells 218" -> 2xx
    # "18 ASC-US 301" ... "45 Malignant lymphoma 328" -> 3xx

    # So mapping rule:
    # 1xx -> Parent 100
    # 2xx -> Parent 200
    # 3xx -> Parent 300
    # 4xx -> Parent 400

    sub_categories = [
        # --- 1xx (Parent: 100) ---
        {"code": "101", "text": "Atrophy"},
        {"code": "102", "text": "Post partum"},
        # --- 2xx (Parent: 200) ---
        {"code": "201", "text": "Trichomonas vaginalis"},
        {
            "code": "202",
            "text": "Fungal organisms morphologically consistent with Candida spp.",
        },
        {"code": "203", "text": "Shift in flora suggestive of bacterial vaginosis"},
        {
            "code": "204",
            "text": "Bacteria morphologically consistent with Actinomyces spp.",
        },
        {
            "code": "205",
            "text": "Cellular changes consistent with Herpes simplex virus (HSV)",
        },
        {
            "code": "206",
            "text": "Cellular changes consistent with Cytomegalovirus (CMV)",
        },
        {
            "code": "210",
            "text": "Reactive cellular changes associated with inflammation",
        },
        {
            "code": "211",
            "text": "Reactive cellular changes associated with atrophy with inflammation",
        },
        {
            "code": "212",
            "text": "Reactive cellular changes associated with atrophic vaginitis",
        },
        {"code": "213", "text": "Reactive cellular changes associated with radiation"},
        {
            "code": "214",
            "text": "Reactive cellular changes associated with intrauterine contraceptive (IUD)",
        },
        {
            "code": "215",
            "text": "Reactive cellular changes associated with post partum inflammation",
        },
        {
            "code": "216",
            "text": "Glandular cell(s) present in status post hysterectomy",
        },
        {
            "code": "217",
            "text": "Reactive cellular changes associated with lymphocytic (follicular) cervicitis",
        },
        {
            "code": "218",
            "text": "Endometrial cells in a woman 45 years of age or older",
        },
        # --- 3xx (Parent: 300) ---
        {
            "code": "301",
            "text": "Atypical squamous cells of undetermined significance (ASC-US)",
        },
        {
            "code": "302",
            "text": "Atypical squamous cells of undetermined significance (ASC-US) favor HPV changes",
        },
        {
            "code": "303",
            "text": "Atypical squamous cells of undetermined significance (ASC-US) favor SIL",
        },
        {
            "code": "304",
            "text": "Atypical squamous cells of undetermined significance (ASC-US) ; Atypical repair cells",
        },
        {"code": "305", "text": "Atypical squamous cells cannot exclude HSIL (ASC-H)"},
        {
            "code": "306",
            "text": "Low-grade squamous intraepithelial lesion (LSIL) : mild dysplasia / CIN I",
        },
        {
            "code": "307",
            "text": "Low-grade squamous intraepithelial lesion (LSIL) : HPV infection",
        },
        {
            "code": "308",
            "text": "Low-grade squamous intraepithelial lesion (LSIL) : mild dysplasia (CIN I ) with HPV infection",
        },
        {"code": "309", "text": "High-grade squamous intraepithelial lesion (HSIL)"},
        {
            "code": "310",
            "text": "High-grade squamous intraepithelial lesion (HSIL) : CIN II",
        },
        {
            "code": "311",
            "text": "High-grade squamous intraepithelial lesion (HSIL) : CIN III",
        },
        {
            "code": "312",
            "text": "High-grade squamous intraepithelial lesion (HSIL) with glandular involvement",
        },
        {
            "code": "313",
            "text": "High-grade squamous intraepithelial lesion (HSIL) with features suspicious for invasion",
        },
        {"code": "314", "text": "Squamous cell carcinoma (SCC)"},
        {
            "code": "315",
            "text": "Atypical glandular cells, not otherwise specified (NOS)",
        },
        {
            "code": "316",
            "text": "Atypical endocervical cells, not otherwise specified (NOS)",
        },
        {
            "code": "317",
            "text": "Atypical endometrial cells, not otherwise specified (NOS)",
        },
        {"code": "318", "text": "Atypical endocervical cells, favor neoplastic"},
        {"code": "319", "text": "Atypical glandular cells, favor neoplastic"},
        {"code": "320", "text": "Endocervical adenocarcinoma in situ (AIS)"},
        {"code": "321", "text": "Adenocarcinoma, endocervical"},
        {"code": "322", "text": "Adenocarcinoma, endometrial"},
        {"code": "323", "text": "Adenocarcinoma, extrauterine"},
        {"code": "324", "text": "Adenocarcinoma, not otherwise specified (NOS)"},
        {"code": "325", "text": "Adenosquamous cell carcinoma"},
        {"code": "326", "text": "Malignant Mullererian Mixed tumor (MMMT)"},
        {"code": "327", "text": "Malignant Melanoma"},
        {"code": "328", "text": "Malignant lymphoma"},
    ]

    for sub in sub_categories:
        # Determine parent logic
        code_val = int(sub["code"])
        parent_code = None
        if 100 <= code_val < 200:
            parent_code = "100"
        elif 200 <= code_val < 300:
            parent_code = "200"
        elif 300 <= code_val < 400:
            parent_code = "300"
        elif 400 <= code_val < 500:
            parent_code = "400"

        if parent_code:
            parent = (
                db.query(GyneDiagnosisCategory)
                .filter(GyneDiagnosisCategory.code == parent_code)
                .first()
            )
            if parent:
                exists = (
                    db.query(GyneDiagnosisCategory)
                    .filter(GyneDiagnosisCategory.code == sub["code"])
                    .first()
                )
                if not exists:
                    db.add(
                        GyneDiagnosisCategory(
                            code=sub["code"], text=sub["text"], parent_id=parent.id
                        )
                    )

    try:
        db.commit()
        print("✅ Gyne Diagnosis Categories seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding Gyne Diagnosis Categories: {e}")


def seed_notification_rules(db: Session):
    print("🌱 Seeding Notification Rules...")

    # กำหนด Rules ที่ต้องการสร้าง
    rules = [
        {
            "event_key": "stain_order_ihc",
            "message_template": "🔬 Order IHC\nCase: {id_case}\nBlock: {block}\nTests: {tests}\nAmount: {count}",
            "is_active": True,
        },
        {
            "event_key": "malignancy_result",
            "message_template": "⚠️ แจ้งผลเคส Malignancy\nHN: {hn}\nชื่อ: {name}\nแพทย์: {clinician}\nCase ID: {id_case}",
            "is_active": True,
        },
        {
            "event_key": "outlab_consult",
            "message_template": "📤 ส่ง Consult นอกโรงพยาบาล\nCase: {id_case}\nAccession: {accession_no}\nผู้ส่ง: {sender}\nห้องแล็บ: {lab_name}",
            "is_active": True,
        },
    ]

    for rule_data in rules:
        # ตรวจสอบว่ามี event_key นี้อยู่หรือยัง
        exists = (
            db.query(NotificationRule)
            .filter(NotificationRule.event_key == rule_data["event_key"])
            .first()
        )

        if not exists:
            # สร้าง Rule ใหม่ (โดยที่ channel_id ยังเป็น NULL เพื่อให้ไปตั้งค่าต่อในหน้าจอ Admin)
            new_rule = NotificationRule(
                event_key=rule_data["event_key"],
                message_template=rule_data["message_template"],
                is_active=rule_data["is_active"],
                channel_id=None,  # หรือจะระบุ ID ของ channel แรกที่สร้างใน seed_notification_channels ก็ได้
            )
            db.add(new_rule)
            print(f"   + Added rule: {rule_data['event_key']}")
        else:
            print(f"   ~ Rule {rule_data['event_key']} already exists, skipping.")

    try:
        db.commit()
        print("✅ Notification Rules seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding Notification Rules: {e}")


def seed_ihc_marker_options(db: Session):
    """
    Seed result options for IHC markers.
    Lookup by official code (stable) — not by name.
    Options: (label, value, display_order, has_numeric, numeric_unit)
    has_numeric: None | "%" | "score" | "custom"
    """
    # Shorthand option sets
    POS_FOC_NEG = [
        ("Positive", "positive", 0, None, None),
        ("Focally positive", "focally_positive", 1, None, None),
        ("Negative", "negative", 2, None, None),
    ]
    POS_NEG = [
        ("Positive", "positive", 0, None, None),
        ("Negative", "negative", 1, None, None),
    ]

    # code → [(label, value, order, has_numeric, numeric_unit)]
    OPTIONS: dict[str, list[tuple]] = {
        # ── Cytokeratin / Epithelial ──────────────────────────────────────────
        "38504": POS_FOC_NEG,  # AE 1/AE3
        "38516": POS_FOC_NEG,  # 34-beta E12
        "38528": POS_FOC_NEG,  # CAM 5.2
        "38561": POS_FOC_NEG,  # CK-5/6
        "38562": POS_FOC_NEG,  # CK-7
        "38563": POS_FOC_NEG,  # CK-8
        "38564": POS_FOC_NEG,  # CK-19
        "38565": POS_FOC_NEG,  # CK-20
        "38627": POS_FOC_NEG,  # MNF 116
        "38580": POS_FOC_NEG,  # EMA
        "38558": POS_FOC_NEG,  # CEA
        "38578": [  # E-cadherin (loss of expression is key finding)
            ("Positive (retained)", "positive", 0, None, None),
            ("Focally positive", "focally_positive", 1, None, None),
            ("Negative (lost)", "negative", 2, None, None),
        ],
        # ── Glandular / Organ-specific ───────────────────────────────────────
        "38557": POS_NEG,  # CDX-2
        "38589": POS_NEG,  # GCDFP-15
        "38590": POS_FOC_NEG,  # GFAP
        "38602": POS_NEG,  # Hepatocyte
        "38687": POS_FOC_NEG,  # Villin
        "38505": POS_NEG,  # AFP
        "38663": POS_NEG,  # Renal cell carcinoma Ag
        # ── Breast ────────────────────────────────────────────────────────────
        "38582": [  # ER (Estrogen Receptor)
            ("Positive", "positive", 0, "%", "%"),
            ("Negative", "negative", 1, None, None),
        ],
        "38658": [  # PR (Progesterone Receptor)
            ("Positive", "positive", 0, "%", "%"),
            ("Negative", "negative", 1, None, None),
        ],
        "38603": [  # HER-2
            ("0 (Negative)", "0", 0, None, None),
            ("1+ (Negative)", "1plus", 1, None, None),
            ("2+ (Equivocal)", "2plus", 2, None, None),
            ("3+ (Positive)", "3plus", 3, None, None),
        ],
        "38618": [  # Ki-67 (MIB-1) — numeric % only
            ("Low (<10%)", "low", 0, "%", "%"),
            ("Intermediate (10–30%)", "intermediate", 1, "%", "%"),
            ("High (>30%)", "high", 2, "%", "%"),
        ],
        # ── Thyroid ───────────────────────────────────────────────────────────
        "38682": POS_NEG,  # TTF-1
        "38680": POS_NEG,  # Thyroglobulin (TG)
        "38524": POS_NEG,  # Calcitonin
        # ── Neuroendocrine ────────────────────────────────────────────────────
        "38560": POS_NEG,  # Chromogranin A
        "38676": POS_NEG,  # Synaptophysin
        "38640": POS_NEG,  # NSE
        "38546": POS_NEG,  # CD56
        # ── Melanoma ──────────────────────────────────────────────────────────
        "38606": POS_NEG,  # HMB-45
        "38625": POS_NEG,  # Melan A
        "38683": POS_NEG,  # Tyrosinase
        "38664": POS_FOC_NEG,  # S-100
        # ── Mesenchymal / Soft tissue ─────────────────────────────────────────
        "38572": POS_FOC_NEG,  # Desmin
        "38671": POS_FOC_NEG,  # Smooth muscle actin (SMA)
        "38688": POS_FOC_NEG,  # Vimentin
        "38525": POS_NEG,  # Caldesmon
        "38526": POS_NEG,  # Calponin
        "38634": POS_NEG,  # Myogenin
        "38636": POS_NEG,  # Myosin
        "38638": POS_FOC_NEG,  # Neurofilament
        # ── Vascular ─────────────────────────────────────────────────────────
        "38541": POS_NEG,  # CD31
        "38542": POS_NEG,  # CD34
        "38583": POS_NEG,  # Factor VIII
        # ── Prostate ──────────────────────────────────────────────────────────
        "38660": POS_NEG,  # PSA
        "38661": POS_NEG,  # PSAP
        "38645": POS_FOC_NEG,  # P504S (AMACR)
        "38648": POS_FOC_NEG,  # p63
        # ── p53 (aberrant expression patterns) ───────────────────────────────
        "38646": [
            ("Wild type", "wild_type", 0, None, None),
            ("Aberrant — diffuse positive", "aberrant_diffuse", 1, None, None),
            ("Aberrant — null pattern", "aberrant_null", 2, None, None),
            ("Aberrant — cytoplasmic", "aberrant_cyto", 3, None, None),
        ],
        # ── Lymphoma / Haematolymphoid ────────────────────────────────────────
        "38531": POS_NEG,  # CD3
        "38532": POS_NEG,  # CD4
        "38533": POS_NEG,  # CD5
        "38534": POS_NEG,  # CD8
        "38535": POS_NEG,  # CD10
        "38536": POS_NEG,  # CD15
        "38537": POS_NEG,  # CD20
        "38538": POS_NEG,  # CD21
        "38539": POS_NEG,  # CD23
        "38540": POS_NEG,  # CD30
        "38545": POS_NEG,  # CD45
        "38548": POS_NEG,  # CD68
        "38550": POS_NEG,  # CD79a
        "38551": POS_NEG,  # CD99
        "38552": POS_NEG,  # CD117
        "38553": POS_NEG,  # CD138
        "38512": POS_NEG,  # Bcl-2
        "38513": POS_NEG,  # Bcl-6
        "38514": POS_NEG,  # Bcl-10
        "38571": POS_NEG,  # Cyclin D1
        "38631": POS_NEG,  # MUM-1
        "38678": POS_NEG,  # TdT
        "38633": POS_NEG,  # Myeloperoxidase
        "38677": POS_NEG,  # T-cell (UCHL-1)
        "38521": POS_NEG,  # BOB-1
        "38615": POS_NEG,  # Kappa
        "38619": POS_NEG,  # Lambda
        "38681": POS_NEG,  # TIA-1
        "38594": POS_NEG,  # Granzyme B
        "38650": POS_NEG,  # Perforin
        # ── Mesothelioma / Pleural ────────────────────────────────────────────
        "38527": POS_FOC_NEG,  # Calretinin
        "38515": POS_NEG,  # Ber-EP 4
        "38554": POS_NEG,  # CD141 (Thrombomodulin)
        "38628": POS_NEG,  # MOC-31
        # ── Germ cell ─────────────────────────────────────────────────────────
        "38654": POS_NEG,  # PLAP
        "38642": POS_NEG,  # OCT-3/4
        "38641": POS_NEG,  # Oct-1
        # ── Infection ─────────────────────────────────────────────────────────
        "38596": POS_NEG,  # H. pylori
        "38597": POS_NEG,  # HBcAg
        "38598": POS_NEG,  # HBsAg
        "38577": POS_NEG,  # EBV
        "38566": POS_NEG,  # CMV
        # ── Misc ──────────────────────────────────────────────────────────────
        "38506": POS_NEG,  # ALK protein
        "38529": POS_NEG,  # Cathepsin D
        "38579": POS_NEG,  # EGFR
        "38662": POS_NEG,  # PTEN
        "38686": POS_NEG,  # VEGF
        "38675": POS_NEG,  # Surfactant
        "38608": POS_NEG,  # HPV
        # ── Legacy codes from initial demo seed (old test entries still used by stain records) ──
        "38101": POS_FOC_NEG,  # CK7 (old code)
        "38102": POS_FOC_NEG,  # CK20 (old code)
        "38103": POS_FOC_NEG,  # Pan-Cytokeratin AE1/AE3 (old code)
        "38104": [  # ER (old code)
            ("Positive", "positive", 0, "%", "%"),
            ("Negative", "negative", 1, None, None),
        ],
        "38105": [  # PR (old code)
            ("Positive", "positive", 0, "%", "%"),
            ("Negative", "negative", 1, None, None),
        ],
        "38106": [  # HER2 (old code)
            ("0 (Negative)", "0", 0, None, None),
            ("1+ (Negative)", "1plus", 1, None, None),
            ("2+ (Equivocal)", "2plus", 2, None, None),
            ("3+ (Positive)", "3plus", 3, None, None),
        ],
        "38107": [  # Ki-67 (old code)
            ("Low (<15%)", "low", 0, "%", "%"),
            ("Intermediate (15-30%)", "intermediate", 1, "%", "%"),
            ("High (>30%)", "high", 2, "%", "%"),
        ],
    }

    print("🌱 Seeding IHC Marker Options...")
    added = skipped = not_found = 0

    for code, options in OPTIONS.items():
        test = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.code == code)
            .first()
        )
        if not test:
            print(f"   ⚠️  code {code} not found in DB — skipping")
            not_found += 1
            continue

        for label, value, order, has_numeric, numeric_unit in options:
            exists = (
                db.query(IHCMarkerOption)
                .filter(
                    IHCMarkerOption.ap_test_id == test.id,
                    IHCMarkerOption.option_value == value,
                )
                .first()
            )
            if exists:
                skipped += 1
                continue
            db.add(
                IHCMarkerOption(
                    ap_test_id=test.id,
                    option_label=label,
                    option_value=value,
                    display_order=order,
                    has_numeric=has_numeric,
                    numeric_unit=numeric_unit,
                )
            )
            added += 1

    db.commit()
    print(
        f"✅ IHC Marker Options: เพิ่ม {added} options, ข้าม {skipped}, ไม่พบ code {not_found} รายการ"
    )


def seed_tissue_processing(db: Session):
    print("🌱 Seeding Tissue Processing Data...")
    try:
        if db.query(ProcessorMachine).count() == 0:
            db.add_all(
                [
                    ProcessorMachine(name="Peloris 1"),
                    ProcessorMachine(name="Peloris 2"),
                    ProcessorMachine(name="Leica ASP300"),
                ]
            )
            print("   - Added ProcessorMachines")

        if db.query(ProcessingProgram).count() == 0:
            db.add_all(
                [
                    ProcessingProgram(name="Overnight", duration_hours=12),
                    ProcessingProgram(name="Rapid Biopsy", duration_hours=4),
                    ProcessingProgram(name="Fat Processing", duration_hours=16),
                ]
            )
            print("   - Added ProcessingPrograms")

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding tissue processing: {e}")


def seed_stain_panels(db: Session):
    """Seed common IHC / Special-stain panels used in surgical pathology."""

    admin = db.query(User).filter(User.username == "admin").first()
    admin_id = admin.id if admin else None

    def _find(name: str):
        return (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.name == name)
            .first()
        )

    PANELS = [
        # ── Lymphoma ──────────────────────────────────────────────────────
        {
            "name": "B-cell Lymphoma Screening",
            "category": "Lymphoma",
            "description": "First-line IHC for B-cell lymphoma workup. Covers lineage, follicular markers, and proliferation index.",
            "tests": [
                "CD20", "CD3", "CD5", "CD10", "CD23", "Bcl-2", "Bcl-6",
                "Ki-67 (MIB-1)", "CD79a", "CD45",
            ],
        },
        {
            "name": "T-cell Lymphoma Screening",
            "category": "Lymphoma",
            "description": "First-line IHC for T-cell / NK-cell lymphoma. Includes cytotoxic markers.",
            "tests": [
                "CD3", "CD4", "CD8", "CD5", "CD56", "CD30",
                "TIA-1", "Granzyme B", "CD45", "Ki-67 (MIB-1)",
            ],
        },
        {
            "name": "Hodgkin Lymphoma",
            "category": "Lymphoma",
            "description": "Classic Hodgkin lymphoma (cHL) vs NLPHL differentiation. RS cell markers plus background.",
            "tests": [
                "CD30", "CD15", "CD20", "CD3", "CD45", "EBV",
                "Ki-67 (MIB-1)", "BOB-1", "CD79a", "EMA",
            ],
        },
        {
            "name": "Mantle Cell Lymphoma",
            "category": "Lymphoma",
            "description": "MCL panel. Cyclin D1 overexpression + CD5+/CD23- pattern is hallmark.",
            "tests": [
                "CD20", "CD5", "Cyclin D1", "CD23", "Ki-67 (MIB-1)",
                "CD3", "Bcl-2", "CD79a",
            ],
        },
        {
            "name": "Follicular Lymphoma",
            "category": "Lymphoma",
            "description": "FL grading and follicular vs diffuse architecture distinction.",
            "tests": [
                "CD20", "Bcl-2", "Bcl-6", "CD10", "CD3",
                "CD23", "Ki-67 (MIB-1)", "CD5",
            ],
        },
        {
            "name": "Diffuse Large B-Cell Lymphoma (DLBCL)",
            "category": "Lymphoma",
            "description": "DLBCL profiling for GCB vs non-GCB (Hans algorithm) and double-hit assessment.",
            "tests": [
                "CD20", "CD3", "CD10", "Bcl-2", "Bcl-6",
                "MUM-1", "Ki-67 (MIB-1)", "c-myc", "CD30", "CD45",
            ],
        },
        {
            "name": "Anaplastic Large Cell Lymphoma (ALCL)",
            "category": "Lymphoma",
            "description": "ALCL panel. ALK status separates ALK+ (better prognosis) from ALK-.",
            "tests": [
                "CD30", "ALK protein", "EMA", "CD3", "CD20",
                "CD45", "TIA-1", "Granzyme B", "Ki-67 (MIB-1)",
            ],
        },
        {
            "name": "Plasma Cell Neoplasm / Myeloma",
            "category": "Lymphoma",
            "description": "Multiple myeloma / plasmacytoma workup. Light chain restriction assessment.",
            "tests": [
                "CD138", "MUM-1", "Kappa", "Lambda", "EMA",
                "CD20", "CD3", "Ki-67 (MIB-1)",
            ],
        },
        # ── Breast ───────────────────────────────────────────────────────
        {
            "name": "Breast Carcinoma — ER/PR/HER2/Ki67",
            "category": "Breast",
            "description": "Standard breast carcinoma biomarker panel for treatment decision (hormonal therapy, trastuzumab).",
            "tests": [
                "ER (Estrogen Receptor)", "PR (Progesterone Receptor)",
                "HER-2", "Ki-67 (MIB-1)",
            ],
        },
        {
            "name": "Breast Carcinoma Extended",
            "category": "Breast",
            "description": "Extended breast panel including basal markers and E-cadherin for lobular vs ductal distinction.",
            "tests": [
                "ER (Estrogen Receptor)", "PR (Progesterone Receptor)", "HER-2",
                "Ki-67 (MIB-1)", "p53", "EGFR", "E-cadherin",
                "GCDFP-15", "CK-5/6", "p63",
            ],
        },
        {
            "name": "Breast vs Metastatic Carcinoma",
            "category": "Breast",
            "description": "Distinguish primary breast carcinoma from metastatic adenocarcinoma to breast.",
            "tests": [
                "ER (Estrogen Receptor)", "PR (Progesterone Receptor)", "GCDFP-15",
                "CEA", "CK-7", "CK-20", "CK-5/6", "EMA",
            ],
        },
        # ── Lung ─────────────────────────────────────────────────────────
        {
            "name": "Lung Carcinoma Subtyping",
            "category": "Lung",
            "description": "Adenocarcinoma (TTF-1+) vs squamous cell carcinoma (p63/CK-5/6+) vs SCLC (NE markers).",
            "tests": [
                "TTF-1", "CK-7", "p63", "CK-5/6",
                "Synaptophysin", "Chromogranin A", "CD56", "NSE", "Ki-67 (MIB-1)",
            ],
        },
        {
            "name": "Pulmonary Neuroendocrine Tumor",
            "category": "Lung",
            "description": "SCLC, carcinoid, large-cell neuroendocrine. Ki-67 separates typical from atypical carcinoid.",
            "tests": [
                "Synaptophysin", "Chromogranin A", "CD56", "NSE",
                "Ki-67 (MIB-1)", "CK-7", "TTF-1", "EMA",
            ],
        },
        # ── Gastrointestinal ─────────────────────────────────────────────
        {
            "name": "GI Neuroendocrine Tumor (NET)",
            "category": "GI",
            "description": "GI NET workup including hormonal markers for functional tumors.",
            "tests": [
                "Synaptophysin", "Chromogranin A", "Ki-67 (MIB-1)", "CD56",
                "NSE", "Glucagon", "Serotonin", "Insulin", "Gastrin", "Somatostatin",
            ],
        },
        {
            "name": "GIST Panel",
            "category": "GI",
            "description": "Gastrointestinal stromal tumor. CD117 (c-kit) is the key marker; DOG1 equivalent via SMA for smooth muscle.",
            "tests": [
                "CD117", "CD34", "Smooth muscle actin (SMA)",
                "Desmin", "S-100", "Ki-67 (MIB-1)",
            ],
        },
        {
            "name": "GI Adenocarcinoma Origin",
            "category": "GI",
            "description": "CK7/CK20/CDX2 algorithm to identify colonic vs upper GI vs other adenocarcinoma origin.",
            "tests": [
                "CK-7", "CK-20", "CDX-2", "CEA",
                "EMA", "MOC-31", "Villin", "MUC-2",
            ],
        },
        {
            "name": "H. pylori & GI Infections",
            "category": "GI",
            "description": "IHC panel for common GI infective agents when morphology is equivocal.",
            "tests": [
                "H. pylori", "CMV", "Cryptosporidium",
            ],
        },
        # ── Soft Tissue ───────────────────────────────────────────────────
        {
            "name": "Soft Tissue Tumor — Basic Lineage",
            "category": "Soft Tissue",
            "description": "First-line panel to assign lineage (epithelial / mesenchymal / neural) in soft-tissue masses.",
            "tests": [
                "Vimentin", "AE 1/AE3", "S-100", "CD34",
                "Smooth muscle actin (SMA)", "Desmin", "CD99", "EMA",
            ],
        },
        {
            "name": "Rhabdomyosarcoma",
            "category": "Soft Tissue",
            "description": "RMS panel. Myogenin is most specific; Desmin/Myoglobin confirm skeletal muscle differentiation.",
            "tests": [
                "Myogenin", "Desmin", "Myoglobin", "Myosin",
                "Sarcomeric actin", "CD99", "Vimentin", "HHF-35",
            ],
        },
        {
            "name": "Nerve Sheath Tumor (MPNST / Schwannoma)",
            "category": "Soft Tissue",
            "description": "Neural/nerve sheath differentiation; S-100 loss in high-grade MPNST.",
            "tests": [
                "S-100", "CD34", "EMA", "p63",
                "Neurofilament", "PGP 9.5",
            ],
        },
        {
            "name": "Vascular Tumor Panel",
            "category": "Soft Tissue",
            "description": "Endothelial differentiation markers. CD31 most sensitive; Factor VIII most specific.",
            "tests": [
                "CD31", "CD34", "Factor VIII",
                "CD141 (Thrombomodulin)", "Ulex B279",
            ],
        },
        # ── Melanoma ──────────────────────────────────────────────────────
        {
            "name": "Melanoma Panel",
            "category": "IHC",
            "description": "Melanoma confirmation and differentiation from carcinoma / sarcoma.",
            "tests": [
                "S-100", "HMB-45", "Melan A", "Tyrosinase",
                "Ki-67 (MIB-1)", "Vimentin",
            ],
        },
        # ── Prostate ──────────────────────────────────────────────────────
        {
            "name": "Prostate Carcinoma",
            "category": "IHC",
            "description": "PCa confirmation (PSA/PSAP/AMACR) and basal cell absence (p63/CK-5/6).",
            "tests": [
                "PSA", "PSAP", "P504S (AMACR)",
                "p63", "CK-5/6", "CK-7",
            ],
        },
        # ── Thyroid ───────────────────────────────────────────────────────
        {
            "name": "Thyroid Tumor Panel",
            "category": "IHC",
            "description": "PTC/FTC (TG+/TTF-1+), MTC (Calcitonin+/CEA+), undifferentiated (loss of markers).",
            "tests": [
                "Thyroglobulin (TG)", "TTF-1", "Calcitonin",
                "CEA", "Ki-67 (MIB-1)", "p63", "CK-5/6", "EMA",
            ],
        },
        # ── Renal ─────────────────────────────────────────────────────────
        {
            "name": "Renal Cell Carcinoma Panel",
            "category": "IHC",
            "description": "RCC subtyping: clear cell (CD10+/RCCAg+), papillary (AMACR+/CK7+), chromophobe (CK7+/CD117+).",
            "tests": [
                "Renal cell carcinoma Ag", "CD10", "CK-7",
                "Vimentin", "CD34", "EMA",
                "Wilms' tumor (WT-1)", "P504S (AMACR)",
            ],
        },
        # ── Liver ─────────────────────────────────────────────────────────
        {
            "name": "Hepatic Tumor Panel",
            "category": "IHC",
            "description": "HCC (Hepatocyte+/AFP+/CD34 sinusoidal) vs cholangiocarcinoma (CK7+/CK19+) vs metastasis.",
            "tests": [
                "Hepatocyte", "AFP", "CEA", "CD34",
                "CK-7", "CK-20", "CK-19", "HBsAg", "HBcAg", "EMA",
            ],
        },
        # ── Germ Cell ─────────────────────────────────────────────────────
        {
            "name": "Germ Cell Tumor Panel",
            "category": "IHC",
            "description": "Seminoma (PLAP+/OCT3/4+/CD117+) vs embryonal carcinoma (CD30+) vs choriocarcinoma (β-hCG+).",
            "tests": [
                "PLAP", "OCT-3/4", "CD117", "AFP",
                "Beta-hCG", "EMA", "CD30", "CK-7", "CD99",
            ],
        },
        # ── CNS ───────────────────────────────────────────────────────────
        {
            "name": "Brain Tumor — Basic",
            "category": "IHC",
            "description": "Astrocytic (GFAP+), neuronal (Synaptophysin+/NF+), embryonal (CD99+), meningeal (EMA+) lineage.",
            "tests": [
                "GFAP", "S-100", "Neurofilament", "Synaptophysin",
                "Ki-67 (MIB-1)", "EMA", "Vimentin", "CD99", "Chromogranin A",
            ],
        },
        # ── Mesothelioma ──────────────────────────────────────────────────
        {
            "name": "Mesothelioma vs Adenocarcinoma",
            "category": "IHC",
            "description": "2 positive mesothelioma markers + 2 negative adenocarcinoma markers approach.",
            "tests": [
                "Calretinin", "Wilms' tumor (WT-1)", "CK-5/6",
                "Ber-EP 4", "CEA", "MOC-31", "EMA",
            ],
        },
        # ── Unknown Primary ───────────────────────────────────────────────
        {
            "name": "Carcinoma of Unknown Primary (CUP)",
            "category": "IHC",
            "description": "Broad panel for determining origin of metastatic carcinoma. Interpret CK7/CK20 pattern first.",
            "tests": [
                "CK-7", "CK-20", "TTF-1", "CDX-2", "PSA",
                "ER (Estrogen Receptor)", "CK-5/6", "p63",
                "Hepatocyte", "CEA", "Thyroglobulin (TG)",
            ],
        },
        # ── Renal Biopsy IF ───────────────────────────────────────────────
        {
            "name": "Renal Biopsy — Immunofluorescence",
            "category": "IHC",
            "description": "Immune deposit characterisation in medical renal disease (IgA nephropathy, lupus, membranous).",
            "tests": [
                "IgA", "IgG", "IgM", "C1q", "C3c",
                "Fibrinogen", "Kappa", "Lambda",
            ],
        },
        # ── Infection IHC ─────────────────────────────────────────────────
        {
            "name": "Infection IHC Screen",
            "category": "IHC",
            "description": "IHC confirmation of common opportunistic and viral pathogens in tissue sections.",
            "tests": [
                "CMV", "EBV", "H. pylori", "HSV (type II)",
                "HBsAg", "Chlamydia", "Cryptosporidium", "Pneumocystis",
            ],
        },
        # ── Special Stain ─────────────────────────────────────────────────
        {
            "name": "Infection Special Stains",
            "category": "Special Stain",
            "description": "AFB for mycobacteria; GMS for fungi. Order together when granulomatous inflammation or fungal infection is suspected.",
            "tests": [
                "AFB (Acid Fast Bacilli)", "GMS (Grocott's Methenamine Silver)",
            ],
        },
    ]

    print("🌱 Seeding Stain Panels...")
    added = skipped = not_found_total = 0

    for panel_data in PANELS:
        exists = db.query(StainPanel).filter(StainPanel.name == panel_data["name"]).first()
        if exists:
            skipped += 1
            continue

        panel = StainPanel(
            name=panel_data["name"],
            category=panel_data["category"],
            description=panel_data.get("description"),
            is_active=True,
            created_by_id=admin_id,
        )
        db.add(panel)
        db.flush()

        found_tests = []
        for test_name in panel_data["tests"]:
            test = _find(test_name)
            if test:
                found_tests.append(test)
            else:
                not_found_total += 1
                print(f"   ⚠️  Test not found: '{test_name}' (panel: {panel_data['name']})")

        for i, test in enumerate(found_tests):
            db.add(StainPanelItem(stain_panel_id=panel.id, test_id=test.id, sort_order=i))

        db.commit()
        print(f"   + [{panel_data['category']}] {panel_data['name']} ({len(found_tests)} tests)")
        added += 1

    print(f"✅ Stain Panels: เพิ่ม {added} panels, ข้าม {skipped} (มีอยู่แล้ว), test ไม่พบ {not_found_total} รายการ")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        # 1. สร้างข้อมูลพื้นฐาน
        seed_titles(db)
        seed_positions(db)
        seed_hospitals(db)

        # 2. สร้าง Admin
        seed_admin(db)

        # 3. สร้างข้อมูลแล็บและเทมเพลต
        seed_ap_tests(db)
        seed_surgical_pathology_from_official(db)
        seed_ihc_ap_tests_official(db)
        seed_gross_templates(db)
        seed_diagnostic_templates(db)
        seed_nongyne_diagnostic_templates(db)
        seed_specimen_templates(db)
        seed_cytology_specimen_templates(db)

        # 4. Gyne Cytology Master Data
        seed_gyne_specimen_adequacy(db)
        seed_gyne_diagnosis_categories(db)  # Now implemented

        # 5. IHC marker options
        seed_ihc_marker_options(db)

        # 6. Tissue Processing
        seed_tissue_processing(db)

        # 7. Notification Rules
        seed_notification_rules(db)

        # 8. Stain Panels
        seed_stain_panels(db)

        print("\n✅ All seeding operations completed successfully!")
    except Exception as e:
        print(f"\n❌ Error during seeding: {e}")
    finally:
        db.close()

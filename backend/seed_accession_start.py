"""
Run once to set the starting accession number for any case type.

Usage:
    python seed_accession_start.py <accession_no>

Examples:
    python seed_accession_start.py S26-01500   # Surgical  → next: S26-01501
    python seed_accession_start.py C26-00800   # Gyne Cyto → next: C26-00801
    python seed_accession_start.py N26-00300   # Non-Gyne  → next: N26-00301

The script inserts a cancelled placeholder so the next real case gets +1.
"""

import sys
from app.db.database import SessionLocal
from app.models.user import User
from app.models.patient import Patient


CASE_TYPES = {
    "S": ("Surgical",  "app.models.surgical_case",    "SurgicalCase"),
    "C": ("Gyne Cyto", "app.models.gyne_cyto_case",   "GyneCytologyCase"),
    "N": ("Non-Gyne",  "app.models.nongyne_cyto_case", "NongyneCytologyCase"),
}


def main():
    if len(sys.argv) < 2:
        print("Usage: python seed_accession_start.py <accession_no>")
        print("Examples:")
        print("  python seed_accession_start.py S26-01500")
        print("  python seed_accession_start.py C26-00800")
        print("  python seed_accession_start.py N26-00300")
        sys.exit(1)

    target = sys.argv[1].strip().upper()
    prefix_char = target[0]

    if prefix_char not in CASE_TYPES:
        print(f"ERROR: Unknown prefix '{prefix_char}'. Expected S (Surgical), C (Gyne), or N (Non-Gyne).")
        sys.exit(1)

    label, module_path, class_name = CASE_TYPES[prefix_char]

    import importlib
    module = importlib.import_module(module_path)
    Model = getattr(module, class_name)

    db = SessionLocal()
    try:
        existing = db.query(Model).filter(Model.accession_no == target).first()
        if existing:
            print(f"Already exists: {target} (id={existing.id}, status={existing.status})")
            return

        user = db.query(User).first()
        patient = db.query(Patient).first()

        if not user or not patient:
            print("ERROR: No user or patient found in DB. Create at least one first.")
            sys.exit(1)

        placeholder = Model(
            accession_no=target,
            patient_id=patient.id,
            registrar_id=user.id,
            status="cancelled",
            hn="SEED",
        )
        db.add(placeholder)
        db.commit()

        next_no = int(target.split("-")[1]) + 1
        next_accession = f"{target.split('-')[0]}-{next_no:05d}"
        print(f"OK [{label}] — inserted placeholder {target} (status=cancelled)")
        print(f"Next accession will be: {next_accession}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

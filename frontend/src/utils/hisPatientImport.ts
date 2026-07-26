import type { Dispatch, SetStateAction } from "react";
import { message } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PatientService from "../services/patientService";
import TitleService from "../services/titleService";
import DepartmentService from "../services/departmentService";
import MedicalSchemeService from "../services/medicalSchemeService";
import type { HisPatientResult } from "../services/hisService";
import type { Patient } from "../types/patient";
import type { Title } from "../types/title";
import type { Hospital } from "../types/hospital";
import type { Department } from "../types/department";
import type { MedicalScheme } from "../types/medicalScheme";

export interface HisPatientImportDeps<Extra extends { id: number } = never> {
  titles: Title[];
  schemes: MedicalScheme[];
  departments: Department[];
  hospitals: Hospital[];
  setTitles: Dispatch<SetStateAction<Title[]>>;
  setSchemes: Dispatch<SetStateAction<MedicalScheme[]>>;
  setDepartments: Dispatch<SetStateAction<Department[]>>;
  setPatients: Dispatch<SetStateAction<(Patient | Extra)[]>>;
  /** Surgical/Gyne backfill an existing patient's missing title from the HIS
   * record; Molecular doesn't attempt this today. Not a bug either way —
   * kept explicit per caller rather than picked one way. */
  backfillExistingPatientTitle: boolean;
}

export interface HisPatientImportResult {
  patient: Patient;
  matchedHospitalId: number | undefined;
  matchedDepartmentId: number | undefined;
  matchedSchemeId: number | undefined;
  collectAt: Dayjs | undefined;
}

/** The patient/title/department/scheme resolution shared by all 4
 * case-registration modals' HIS-import flow (~80% of the original
 * handler). Field-mapping into the form and the outer try/catch's
 * success/error message text stay at each call site — those genuinely
 * differ per case type and per file's existing copy. */
export async function importHisPatient<Extra extends { id: number } = never>(
  record: HisPatientResult,
  deps: HisPatientImportDeps<Extra>,
): Promise<HisPatientImportResult> {
  const {
    titles,
    schemes,
    departments,
    hospitals,
    setTitles,
    setSchemes,
    setDepartments,
    setPatients,
    backfillExistingPatientTitle,
  } = deps;

  // Map HOSxP gender code: 1=male, 2=female
  let gender: string | undefined;
  if (record.gender_code === 1) gender = "Male";
  else if (record.gender_code === 2) gender = "Female";

  // HIS sends fname (first name) and lname (last name) separately
  const firstName = record.fname?.trim() || "";
  const lastName = record.lname?.trim() || "";
  let patient: Patient | null = null;

  // 1. Find by CID (most reliable)
  if (record.cid && record.cid.trim()) {
    const existingPatients = await PatientService.getPatients(record.cid);
    patient = existingPatients.find((p) => p.cid === record.cid) || null;
  }

  // 2. Find by first name + last name match
  if (!patient && firstName) {
    const existingPatients = await PatientService.getPatients(firstName);
    patient =
      existingPatients.find(
        (p) => p.name === firstName && (p.ln || "") === lastName,
      ) || null;
  }

  const pnameClean = (record.pname || "").trim();
  let matchedTitle = pnameClean
    ? titles.find((t) => (t.title || "").trim() === pnameClean)
    : undefined;

  if (pnameClean && !matchedTitle) {
    try {
      const created = await TitleService.createTitle({ title: pnameClean });
      matchedTitle = created;
      setTitles((prev) => [...prev, created]);
      message.info(`New title added: ${created.title}`);
    } catch {
      /* No permission to create — leave blank */
    }
  }

  // 3. Create new patient with split name fields
  if (!patient) {
    patient = await PatientService.createPatient({
      title_id: matchedTitle?.id || undefined,
      name: firstName,
      ln: lastName || undefined,
      gender,
      cid: record.cid || undefined,
      birth_date: record.birthday ? record.birthday.split(" ")[0] : undefined,
    });
    message.success(`New patient created: ${firstName} ${lastName}`.trim());
  } else if (backfillExistingPatientTitle && !patient.title_id && matchedTitle) {
    // Backfill title for an existing patient registered without one
    await PatientService.updatePatient(patient.id, {
      title_id: matchedTitle.id,
    });
    patient = { ...patient, title_id: matchedTitle.id };
  }

  const resolvedPatient = patient;
  setPatients((prev) => {
    const exists = prev.find((p) => p.id === resolvedPatient.id);
    return exists ? prev : [resolvedPatient, ...prev];
  });

  // Match hospital — HIS is connected to one institution so default to first
  const matchedHospitalId = hospitals[0]?.id;

  // Match department by name (bidirectional substring + trim to handle
  // whitespace from HIS), creating one if no match exists.
  let matchedDepartmentId: number | undefined;
  if (record.department?.trim()) {
    const existing = departments.find((d) => {
      const dn = d.name?.toLowerCase().trim() ?? "";
      const rn = record.department!.toLowerCase().trim();
      return dn === rn || dn.includes(rn) || rn.includes(dn);
    });
    if (existing) {
      matchedDepartmentId = existing.id;
    } else {
      try {
        const created = await DepartmentService.createDepartment({
          name: record.department.trim(),
          is_active: true,
        });
        matchedDepartmentId = created.id;
        setDepartments((prev) => [...prev, created]);
        message.info(`New department added: ${created.name}`);
      } catch {
        // No permission to create department — leave field blank
      }
    }
  }

  // Auto-match or create medical scheme from HIS pttype text
  let matchedSchemeId: number | undefined;
  if (record.pttype?.trim()) {
    const pt = record.pttype.trim().toLowerCase();
    const existing = schemes.find(
      (s) =>
        s.name?.toLowerCase() === pt ||
        s.name?.toLowerCase().includes(pt) ||
        pt.includes(s.name?.toLowerCase() ?? ""),
    );
    if (existing) {
      matchedSchemeId = existing.id;
    } else {
      try {
        const created = await MedicalSchemeService.createScheme({
          name: record.pttype.trim(),
        });
        matchedSchemeId = created.id;
        setSchemes((prev) => [...prev, created]);
        message.info(`New medical scheme added: ${created.name}`);
      } catch {
        /* No permission to create */
      }
    }
  }

  const collectAt = record.order_date ? dayjs(record.order_date) : undefined;

  return {
    patient: resolvedPatient,
    matchedHospitalId,
    matchedDepartmentId,
    matchedSchemeId,
    collectAt,
  };
}

// src/constants/roles.constants.ts

export const ROLES = {
  admin: { label: "System Admin (IT)", color: "red" },
  lab_manager: { label: "Lab Manager", color: "volcano" },
  pathologist: { label: "Pathologist", color: "purple" },
  senior_pathologist: { label: "Senior Pathologist", color: "volcano" },
  cytotechnologist: { label: "Cytotechnologist", color: "magenta" },
  histo: { label: "Histotechnologist", color: "blue" },
  gross: { label: "Gross Staff", color: "cyan" },
  immuno: { label: "Immuno Staff", color: "geekblue" },
  financial: { label: "Financial", color: "gold" },
  register: { label: "Registration Staff", color: "green" },
  hospital: { label: "Hospital Staff", color: "default" },
  clinician: { label: "Clinician", color: "lime" },
} as const;

export type UserRole = keyof typeof ROLES;

/** บัญชีฝั่งผู้ส่งตรวจ — แพทย์ผู้ส่งตรวจและบัญชีของโรงพยาบาลคู่สัญญา
 *  ไม่ใช่เจ้าหน้าที่ในห้องปฏิบัติการ ตรงกับ EXTERNAL_ROLES ใน
 *  backend/app/dependencies/auth.py — แก้ที่เดียวไม่พอ ต้องแก้ให้ตรงกันทั้งสองฝั่ง */
export const EXTERNAL_ROLES: readonly UserRole[] = ["clinician", "hospital"];

export const isExternalRole = (roles?: string[] | null): boolean =>
  (roles ?? []).some((r) => (EXTERNAL_ROLES as readonly string[]).includes(r));

export const ROLE_OPTIONS = Object.entries(ROLES).map(([value, meta]) => ({
  value: value as UserRole,
  label: meta.label,
  color: meta.color,
}));

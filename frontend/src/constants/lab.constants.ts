// src/constants/lab.constants.ts

// =======================
// Specimen Status
// =======================
export const CASE_STATUS = {
  REGISTERED: "registered",
  FORMALIN_FIXING: "formalin_fixing",
  GROSS_IN_PROGRESS: "in progress",
  GROSSED: "grossed",
  PROCESSED: "processed",
  EMBEDDED: "embedded",
  SECTIONED: "sectioned",
  STAINED: "stained",
  SLIDE_SENT: "slide sent",
  PENDING_DIAGNOSIS: "pending diagnosis",
  PENDING_STAIN: "pending special stains",
  PENDING_IHC: "pending immuno",
  PENDING_REVIEW: "pending peer review",
  SIGNED_OUT: "signed out",
  PENDING_ADDENDUM: "pending addendum",
  ADDENDUM_SIGNED: "addendum signed",
  CANCELLED: "cancelled",
} as const;

export const REPORT_STATUS = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  PUBLISHED: "published",
} as const;

export type SpecimenStatusType = (typeof CASE_STATUS)[keyof typeof CASE_STATUS];

export const STATUS_OPTIONS = [
  { value: CASE_STATUS.REGISTERED, label: "Registered", color: "default" },
  {
    value: CASE_STATUS.FORMALIN_FIXING,
    label: "Fixation", // รอ Fix Formalin
    color: "cyan", // ใช้สีที่ดูสะอาดตาหรือสีฟ้าอ่อน
  },
  { value: CASE_STATUS.GROSSED, label: "Grossed", color: "orange" },
  { value: CASE_STATUS.GROSS_IN_PROGRESS, label: "Grossing", color: "purple" },
  { value: CASE_STATUS.PROCESSED, label: "Processed", color: "blue" },
  { value: CASE_STATUS.EMBEDDED, label: "Embedded", color: "gold" },
  { value: CASE_STATUS.STAINED, label: "Stained", color: "purple" },
  {
    value: CASE_STATUS.SLIDE_SENT,
    label: "Slide Sent",
    color: "blue", // ใช้สีที่ดูมีความเคลื่อนไหว เช่น สีน้ำเงิน
  },
  {
    value: CASE_STATUS.PENDING_DIAGNOSIS,
    label: "Pending Diagnosis",
    color: "magenta",
  },
  {
    value: CASE_STATUS.PENDING_STAIN,
    label: "Pending Special Stains",
    color: "volcano",
  },
  {
    value: CASE_STATUS.PENDING_IHC,
    label: "Pending Immuno",
    color: "geekblue",
  },
  {
    value: CASE_STATUS.PENDING_REVIEW,
    label: "Pending Approval",
    color: "cyan",
  },
  { value: CASE_STATUS.SIGNED_OUT, label: "Signed Out", color: "green" },
  { value: CASE_STATUS.CANCELLED, label: "Cancelled", color: "red" },
] as const;

// =======================
// Lab / Report
// =======================
export const TEST_CATEGORY_OPTIONS = [
  { value: "Surgical Pathology", label: "Surgical Pathology" },
  { value: "Special Stain", label: "Special Stain" }, // ใช้คำนี้แทน Histochem เพื่อความเป็นสากล
  { value: "IHC", label: "Immunohistochemistry (IHC)" },
  { value: "ISH", label: "In Situ Hybridization (FISH/CISH)" }, // ครอบคลุมทั้ง FISH และ CISH
  { value: "Molecular", label: "Molecular Pathology" },
  { value: "Cytopathology", label: "Cytopathology" }, // เพิ่มงานเซลล์วิทยา
] as const;

// สร้าง Type จาก options เพื่อใช้กับ TypeScript
export type TestCategory = (typeof TEST_CATEGORY_OPTIONS)[number]["value"];

export const REPORT_TYPE_OPTIONS = [
  { value: "Original", label: "Original (รายงานฉบับแรก)" },
  { value: "Addendum", label: "Addendum (ออกผลเพิ่มเติม)" },
  { value: "Revised", label: "Revised (แก้ไขผล)" },
  { value: "Corrected", label: "Corrected (แก้ typo)" },
  { value: "Preliminary", label: "Preliminary (ชั่วคราว)" },
] as const;

export const REPORT_TYPE_COLORS: Record<string, string> = {
  Original: "blue",
  Addendum: "cyan",
  Revised: "volcano",
  Corrected: "orange",
  Preliminary: "purple",
};

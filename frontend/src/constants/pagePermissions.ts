// src/constants/pagePermissions.ts
import type { UserRole } from "./roles.constants";
import RequireRoleView from "../components/auth/RequireRoleView";

export type PageKey =
  | "dashboard"
  | "grossing"
  | "surgical-blocks"
  | "decal-queue"
  | "tissue-processing"
  | "embedding"
  | "sectioning"
  | "print-sticker-he"
  | "slide-dispatch"
  | "staining-manager"
  | "pathologist-page"
  | "surgical-report-form"
  | "all-report"
  | "gyne-cyto-cases"
  | "gyne-cyto-run-list"
  | "gyne-cyto-stains"
  | "gyne-cyto-work-list"
  | "gyne-cyto-diagnosis-entry"
  | "nongyne-cyto-work-list"
  | "nongyne-cyto-diagnosis-entry"
  | "nongyne-cyto-cases"
  | "nongyne-cyto-stains"
  | "approval"
  | "users"
  | "patients"
  | "settings"
  | "system-settings"
  | "hospital-results"
  | "specimen-storage"
  | "block-storage"
  | "slide-storage"
  | "outlab-management"
  | "outlab-run-list"
  | "outlab-consult-list"
  | "outlab-consult-run-list"
  | "outlab-test-queue"
  | "billing-management"
  | "hospital-billing"
  | "stat-review"
  | "stat-cyto"
  | "workload-dashboard"
  | "report-analytics"
  | "print-report-queue"
  | "report-lookup"
  | "slide-block-release"
  | "audit-log"
  | "his-export-log"
  | "accession"
  | "results"
  | "nongyne-cell-block"
  | "gyne-qc-review"
  | "wsi-file-list"
  | "wsi-slide-gallery"
  | "molecular-cases";

export const PAGE_PERMISSIONS: Record<PageKey, UserRole[]> = {
  dashboard: [
    "admin",
    "lab_manager",
    "pathologist",
    "cytotechnologist",
    "histo",
    "gross",
    "immuno",
    "financial",
    "register",
    "hospital",
    "clinician",
  ],
  grossing: ["gross", "pathologist", "lab_manager", "admin"],
  "surgical-blocks": ["gross", "lab_manager", "admin"],
  "decal-queue": ["gross", "histo", "lab_manager", "admin"],
  "tissue-processing": ["gross", "histo", "lab_manager", "admin"],
  embedding: ["histo", "lab_manager", "admin"],
  sectioning: ["histo", "lab_manager", "admin"],
  "print-sticker-he": ["histo", "lab_manager", "admin"],
  "slide-dispatch": ["histo", "lab_manager", "admin"],
  "staining-manager": ["histo", "lab_manager", "admin"],
  "molecular-cases": ["admin", "lab_manager", "pathologist", "senior_pathologist"],
  "specimen-storage": ["gross", "histo", "lab_manager", "admin"],
  "block-storage": ["histo", "lab_manager", "admin"],
  "slide-storage": ["histo", "lab_manager", "admin"],
  "pathologist-page": ["admin", "lab_manager", "pathologist", "senior_pathologist"],
  "surgical-report-form": ["admin", "lab_manager", "pathologist", "senior_pathologist"],
  "all-report": ["admin", "lab_manager", "senior_pathologist", "register"],
  "gyne-cyto-cases": ["admin", "lab_manager", "cytotechnologist"],
  "nongyne-cyto-cases": ["admin", "lab_manager", "cytotechnologist"],
  "gyne-cyto-run-list": ["admin", "lab_manager", "cytotechnologist"],
  "gyne-cyto-stains": ["admin", "lab_manager", "cytotechnologist"],
  "nongyne-cyto-stains": ["admin", "lab_manager", "cytotechnologist"],
  "nongyne-cell-block": ["admin", "lab_manager", "cytotechnologist"],
  "gyne-qc-review": [
    "admin",
    "lab_manager",
    "pathologist",
    "senior_pathologist",
    "cytotechnologist",
  ],
  "gyne-cyto-work-list": [
    "admin",
    "lab_manager",
    "pathologist",
    "senior_pathologist",
    "cytotechnologist",
  ],
  "gyne-cyto-diagnosis-entry": [
    "admin",
    "lab_manager",
    "pathologist",
    "senior_pathologist",
    "cytotechnologist",
  ],
  "nongyne-cyto-work-list": [
    "admin",
    "lab_manager",
    "pathologist",
    "senior_pathologist",
    "cytotechnologist",
  ],
  "nongyne-cyto-diagnosis-entry": [
    "admin",
    "lab_manager",
    "pathologist",
    "senior_pathologist",
    "cytotechnologist",
  ],
  approval: ["admin", "lab_manager", "senior_pathologist", "cytotechnologist"],
  users: ["admin", "lab_manager"],
  patients: ["admin", "lab_manager"],
  settings: ["admin", "lab_manager"],
  "system-settings": ["admin"],
  "hospital-results": ["admin", "lab_manager", "hospital"],
  "outlab-management": ["histo", "lab_manager", "admin"],
  "outlab-run-list": ["histo", "lab_manager", "admin"],
  "outlab-consult-list": ["admin", "lab_manager", "pathologist", "histo"],
  "outlab-consult-run-list": ["admin", "lab_manager", "pathologist", "histo"],
  "outlab-test-queue": ["admin", "lab_manager", "cytotechnologist", "register"],
  "billing-management": ["admin", "lab_manager"],
  "hospital-billing": ["admin", "lab_manager"],
  "stat-review": ["admin", "lab_manager", "senior_pathologist"],
  "stat-cyto": ["admin", "lab_manager", "senior_pathologist"],
  "workload-dashboard": ["admin", "lab_manager", "senior_pathologist"],
  "report-analytics": ["admin", "lab_manager", "histo", "gross", "immuno", "cytotechnologist", "register", "pathologist", "senior_pathologist"],
  "report-lookup": ["admin", "lab_manager", "histo", "gross", "cytotechnologist", "register"],
  "print-report-queue": ["admin", "lab_manager", "histo", "gross", "cytotechnologist", "register"],
  "slide-block-release": ["admin", "lab_manager", "gross", "histo", "cytotechnologist"],
  "wsi-file-list": ["admin", "lab_manager", "histo"],
  "wsi-slide-gallery": ["admin", "lab_manager", "pathologist", "senior_pathologist"],
  "audit-log": ["admin"],
  "his-export-log": ["admin"],
  results: ["admin", "lab_manager", "hospital", "clinician"],
  accession: Array.from(
    new Set([
      ...["admin", "lab_manager", "gross"] as UserRole[],
      ...["admin", "lab_manager", "cytotechnologist"] as UserRole[],
      ...["register"] as UserRole[],
    ])
  ) as UserRole[],
};

// src/constants/sideMenu.config.ts
import React from "react";
import type { ComponentType } from "react";
import type { MenuProps } from "antd";
import type { UserRole } from "./roles.constants";
import { PAGE_PERMISSIONS } from "./pagePermissions";

import {
  UserOutlined,
  ExperimentOutlined,
  MedicineBoxOutlined,
  HeartOutlined,
  SettingOutlined,
  TeamOutlined,
  InboxOutlined,
  ScissorOutlined,
  CopyOutlined,
  DollarOutlined,
  BarChartOutlined,
  PrinterOutlined,
  ExportOutlined,
  GlobalOutlined,
  ControlOutlined,
  AuditOutlined,
  ToolOutlined,
  SolutionOutlined,
  BankOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
  HomeOutlined,
} from "@ant-design/icons";

/** Menu item config type */
export interface SideMenuItem {
  key: string;
  label: string;
  view?: string;
  icon?: ComponentType;
  roles?: UserRole[];
  children?: SideMenuItem[];
  /** Hide this item when the named SystemSetting boolean is false */
  featureFlag?: string;
}

export const SIDE_MENU_CONFIG: SideMenuItem[] = [
  {
    key: "dashboard",
    label: "Home",
    icon: HomeOutlined,
    view: "dashboard",
  },

  // ===== Lab Services (front-desk / technician tools) =====
  {
    key: "lab-services-group",
    label: "Front Desk",
    icon: ControlOutlined,
    children: [
      {
        key: "acc:unified",
        label: "Accession",
        icon: InboxOutlined,
        view: "accession",
        roles: PAGE_PERMISSIONS["accession"],
      },
      {
        key: "report-lookup",
        label: "Report Archive",
        icon: HistoryOutlined,
        view: "report-lookup",
        roles: PAGE_PERMISSIONS["report-lookup"],
      },
      {
        key: "print-report-queue",
        label: "Print Queue",
        icon: PrinterOutlined,
        view: "print-report-queue",
        roles: PAGE_PERMISSIONS["print-report-queue"],
      },
      {
        key: "slide-block-release",
        label: "Slide / Block Release",
        icon: ExportOutlined,
        view: "slide-block-release",
        roles: PAGE_PERMISSIONS["slide-block-release"],
      },
    ],
  },

  // ===== Surgical =====
  {
    key: "surgical-pathology-services",
    label: "Surgical",
    icon: ScissorOutlined,
    children: [
      {
        key: "grossing",
        label: "Grossing",
        view: "grossing",
        roles: PAGE_PERMISSIONS.grossing,
      },
      {
        key: "sur:processing",
        label: "Tissue Processing",
        view: "sur:tissue-processing",
        roles: PAGE_PERMISSIONS["tissue-processing"],
        featureFlag: "enable_tissue_processing_workflow",
      },
      {
        key: "decal-queue",
        label: "Decal & Extended Fix",
        view: "decal-queue",
        roles: PAGE_PERMISSIONS["decal-queue"],
      },
      {
        key: "specimen-storage",
        label: "Specimen Storage",
        view: "specimen-storage",
        roles: PAGE_PERMISSIONS["specimen-storage"],
      },
    ],
  },

  // ===== Histology =====
  {
    key: "histology-workflow",
    label: "Histology",
    icon: CopyOutlined,
    children: [
      {
        key: "his:process-out",
        label: "Process Out",
        view: "his:process-out",
        roles: PAGE_PERMISSIONS["tissue-processing"],
        featureFlag: "enable_tissue_processing_workflow",
      },
      {
        key: "embed",
        label: "Embedding",
        view: "embedding",
        roles: PAGE_PERMISSIONS["embedding"],
        featureFlag: "enable_tissue_processing_workflow",
      },
      {
        key: "section",
        label: "Sectioning",
        view: "sectioning",
        roles: PAGE_PERMISSIONS["sectioning"],
        featureFlag: "enable_tissue_processing_workflow",
      },
      {
        key: "he-staining-manager",
        label: "H&E Staining",
        view: "he-staining-manager",
        roles: PAGE_PERMISSIONS["staining-manager"],
      },
      {
        key: "slide-dispatch",
        label: "Slide Dispatch",
        view: "slide-dispatch",
        roles: PAGE_PERMISSIONS["slide-dispatch"],
      },
      {
        key: "wsi-file-list",
        label: "WSI Files",
        view: "wsi-file-list",
        roles: PAGE_PERMISSIONS["wsi-file-list"],
      },
    ],
  },

  // ===== Gyne Cyto =====
  {
    key: "gyne-cytology-workflow",
    label: "Gyne Cytology",
    icon: MedicineBoxOutlined,
    roles: PAGE_PERMISSIONS["gyne-cyto-cases"],
    children: [
      {
        key: "gyne-cyto-run-list",
        label: "Staining",
        view: "gyne-cyto-run-list",
        roles: PAGE_PERMISSIONS["gyne-cyto-run-list"],
      },
      {
        key: "gyne-cyto-work-list",
        label: "Diagnosis",
        view: "gyne-cyto-work-list",
        roles: PAGE_PERMISSIONS["gyne-cyto-work-list"],
      },
      {
        key: "gyne-qc-review",
        label: "QC Review",
        view: "gyne-qc-review",
        roles: PAGE_PERMISSIONS["gyne-qc-review"],
      },
    ],
  },

  // ===== Non-Gyne Cyto =====
  {
    key: "nongyne-cytology-workflow",
    label: "Non-Gyne Cytology",
    icon: UserOutlined,
    roles: PAGE_PERMISSIONS["nongyne-cyto-cases"],
    children: [
      {
        key: "nongyne-cyto-stains",
        label: "Staining Batch",
        view: "nongyne-cyto-stains",
        roles: PAGE_PERMISSIONS["nongyne-cyto-stains"],
      },
      {
        key: "nongyne-cyto-work-list",
        label: "Diagnosis",
        view: "nongyne-cyto-work-list",
        roles: PAGE_PERMISSIONS["nongyne-cyto-work-list"],
      },
      {
        key: "nongyne-cyto-slide-dispatch",
        label: "Slide Dispatch",
        view: "nongyne-slide-dispatch",
        roles: PAGE_PERMISSIONS["slide-dispatch"],
        featureFlag: "nongyne_slide_dispatch_enabled",
      },
      {
        key: "nongyne-cell-block",
        label: "Cell Block Tracking",
        view: "nongyne-cell-block",
        roles: PAGE_PERMISSIONS["nongyne-cell-block"],
      },
    ],
  },

  // ===== Internal Staining =====
  {
    key: "special-stains-workflow",
    label: "Internal Staining",
    icon: ExperimentOutlined,
    children: [
      {
        key: "staining-manager",
        label: "Internal Stain Orders",
        view: "staining-manager",
        roles: PAGE_PERMISSIONS["staining-manager"],
      },
      {
        key: "staining-run",
        label: "Internal Staining Run",
        view: "staining-run",
        roles: PAGE_PERMISSIONS["staining-manager"],
      },
    ],
  },

  // ===== Outlab (External Services) =====
  {
    key: "outlab-workflow",
    label: "External Lab",
    icon: GlobalOutlined,
    children: [
      {
        key: "outlab-stain-tracking",
        label: "External Tracking",
        view: "outlab-management",
        roles: PAGE_PERMISSIONS["outlab-management"],
      },
      {
        key: "outlab-stain-run",
        label: "External Runs",
        view: "outlab-run-list",
        roles: PAGE_PERMISSIONS["outlab-run-list"],
      },
      {
        key: "outlab-consult-list",
        label: "Consult Request",
        view: "outlab-consult-list",
        roles: PAGE_PERMISSIONS["outlab-consult-list"],
      },
      {
        key: "outlab-test-queue",
        label: "Outlab Test Queue",
        view: "outlab-test-queue",
        roles: PAGE_PERMISSIONS["outlab-test-queue"],
      },
    ],
  },

  // ===== Diagnosis =====
  {
    key: "diagnosis-group",
    label: "Diagnosis",
    icon: SolutionOutlined,
    children: [
      {
        key: "pathologist-page",
        label: "My Worklist",
        view: "pathologist-page",
        roles: PAGE_PERMISSIONS["pathologist-page"],
      },
      {
        key: "molecular-cases",
        label: "Molecular Pathology",
        icon: ExperimentOutlined,
        view: "molecular-cases",
        roles: PAGE_PERMISSIONS["molecular-cases"],
      },
      {
        key: "diagnosis-gyne-qc-review",
        label: "QC Review",
        view: "gyne-qc-review",
        roles: PAGE_PERMISSIONS["gyne-qc-review"],
      },
      {
        key: "all-report",
        label: "Report Archive",
        view: "all-report",
        roles: PAGE_PERMISSIONS["all-report"],
      },
      {
        key: "approval",
        label: "Approval",
        view: "approval",
        roles: PAGE_PERMISSIONS["approval"],
      },
      {
        key: "wsi-slide-gallery",
        label: "WSI Slides",
        view: "wsi-slide-gallery",
        roles: PAGE_PERMISSIONS["wsi-slide-gallery"],
      },
    ],
  },

  // ===== Storage =====
  {
    key: "slide-storage-group",
    label: "Storage",
    icon: InboxOutlined,
    children: [
      {
        key: "surgical-blocks",
        label: "Block Management",
        view: "surgical-blocks",
        roles: PAGE_PERMISSIONS["surgical-blocks"],
      },
      {
        key: "slide-storage",
        label: "Slide Storage",
        view: "slide-storage",
        roles: PAGE_PERMISSIONS["slide-storage"],
      },
    ],
  },

  // ===== Statistics =====
  {
    key: "statistics-group",
    label: "Statistics",
    icon: BarChartOutlined,
    roles: PAGE_PERMISSIONS["report-analytics"],
    children: [
      {
        key: "report-analytics",
        label: "Report Analytics",
        view: "report-analytics",
        roles: PAGE_PERMISSIONS["report-analytics"],
      },
      {
        key: "critical-notification-log",
        label: "Critical Notification Log",
        view: "critical-notification-log",
        roles: PAGE_PERMISSIONS["audit-log"],
      },
    ],
  },

  // ===== Administration (lab manager / admin) =====
  {
    key: "administration-group",
    label: "Administration",
    icon: BankOutlined,
    children: [
      {
        key: "patients",
        label: "Patient Management",
        icon: HeartOutlined,
        view: "patients",
        roles: PAGE_PERMISSIONS.patients,
      },
      {
        key: "settings",
        label: "Master Data",
        icon: SettingOutlined,
        view: "settings",
        roles: PAGE_PERMISSIONS.settings,
      },
      {
        key: "billing-management",
        label: "Billing & Cost",
        icon: DollarOutlined,
        view: "billing-management",
        roles: PAGE_PERMISSIONS["billing-management"],
      },
      {
        key: "users",
        label: "User Management",
        icon: TeamOutlined,
        view: "users",
        roles: PAGE_PERMISSIONS.users,
      },
    ],
  },

  // ===== IT Administration (admin only) =====
  {
    key: "it-administration-group",
    label: "IT Administration",
    icon: CloudServerOutlined,
    children: [
      {
        key: "system-settings",
        label: "System Settings",
        icon: ToolOutlined,
        view: "system-settings",
        roles: PAGE_PERMISSIONS["system-settings"],
      },
      {
        key: "audit-log",
        label: "Audit Log",
        icon: AuditOutlined,
        view: "audit-log",
        roles: PAGE_PERMISSIONS["audit-log"],
      },
      {
        key: "his-export-log",
        label: "HIS Export Log",
        icon: CloudUploadOutlined,
        view: "his-export-log",
        roles: PAGE_PERMISSIONS["his-export-log"],
      },
    ],
  },
];

export function buildAuthorizedMenuItems(
  config: SideMenuItem[],
  roles: string[],
  enabledFlags: Record<string, boolean> = {},
): NonNullable<MenuProps["items"]> {
  const hasAccess = (item: SideMenuItem) =>
    !item.roles || item.roles.some((r) => roles.includes(r));

  const isVisible = (item: SideMenuItem) =>
    !item.featureFlag || enabledFlags[item.featureFlag] !== false;

  const build = (items: SideMenuItem[]): NonNullable<MenuProps["items"]> =>
    items
      .map((item): NonNullable<MenuProps["items"]>[number] | null => {
        if (!hasAccess(item)) return null;
        if (!isVisible(item)) return null;
        if (item.children) {
          const children = build(item.children);
          if (children.length === 0) return null;
          return {
            key: item.key,
            icon: item.icon ? React.createElement(item.icon) : undefined,
            label: item.label,
            children,
          };
        }
        return {
          key: item.view ?? item.key,
          icon: item.icon ? React.createElement(item.icon) : undefined,
          label: item.label,
        };
      })
      .filter(Boolean) as NonNullable<MenuProps["items"]>;

  return build(config);
}

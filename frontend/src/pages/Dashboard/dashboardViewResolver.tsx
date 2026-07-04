import React, { Suspense, lazy } from "react";
import RequireRoleView from "../../components/auth/RequireRoleView";
import type { User } from "../../types/user";
import { PAGE_PERMISSIONS, PageKey } from "../../constants/pagePermissions";
import { Spin } from "antd";

// --- Lazy Imports (ช่วยลดขนาดไฟล์แรกที่โหลด) ---
const PatientManager = lazy(() => import("../../components/PatientManager"));
const SurgicalCaseManager = lazy(() => import("../SurgicalCase"));
const NongyneCaseManager = lazy(() => import("../NongyneCase"));
const GrossExamination = lazy(() => import("../Gross"));
const SurgicalBlockList = lazy(() => import("../SurgicalBlock"));
const ProcessingManager = lazy(() => import("../TissueProcessing"));
const EmbeddingManager = lazy(() => import("../Embedding"));
const SectioningManager = lazy(() => import("../Sectioning/SectioningManager"));
const RoutineHEManager = lazy(() => import("../Stain/RoutineHE"));
const StainingRun = lazy(() => import("../Stain/StainRun"));
const StainManagement = lazy(() => import("../Stain/StainManagement"));
const SlideDispatchListPage = lazy(
  () => import("../SlideDispatch/SlideDispatchListPage.tsx"),
);
const SpecimenStorage = lazy(() => import("../SpecimenStorage"));
const PathologistPage = lazy(() => import("../Pathologist"));
const SurgicalReportForm = lazy(
  () => import("../Pathologist/SurgicalDiagnosisReportForm"),
);
const ReportHistoryTable = lazy(() => import("../Report/ReportHistoryTable"));
const PrintReportQueue = lazy(() => import("../Report/PrintReportQueue"));
const ReportAnalyticsHub = lazy(() => import("../Report/ReportAnalyticsHub"));
const PendingApprovalList = lazy(
  () => import("../Approval/PendingApprovalList"),
);
const ApprovalDetailPage = lazy(() => import("../Approval/ApprovalDetailPage"));
const GyneApprovalDetailPage = lazy(
  () => import("../Approval/GyneApprovalDetailPage"),
);
const NongyneApprovalDetailPage = lazy(
  () => import("../Approval/NongyneApprovalDetailPage"),
);
const GyneCytologyCasePage = lazy(() => import("../GyneCytologyCase"));
const GyneStainBatchPage = lazy(
  () => import("../GyneCytologyStain/GyneStainBatchPage"),
);
const GyneStainRunListPage = lazy(
  () => import("../GyneCytologyStain/GyneStainRunListPage"),
);
const NongyneStainRunListPage = lazy(
  () => import("../NongyneCytologyStain/NongyneStainRunListPage"),
);
const GyneCytoWorklist = lazy(
  () => import("../GyneCytoDiagnosis/GyneCytoWorklist"),
);
const GyneQCReviewTable = lazy(
  () => import("../GyneCytoDiagnosis/GyneQCReviewTable"),
);
const GyneDiagnosisEntryPage = lazy(
  () => import("../GyneCytoDiagnosis/GyneDiagnosisEntryPage"),
);
const PathologistGyneDiagnosisPage = lazy(
  () => import("../GyneCytoDiagnosis/PathologistGyneDiagnosisPage"),
);
const NongyneCytoWorklist = lazy(
  () => import("../NongyneCytoDiagnosis/NongyneCytoWorklist"),
);
const NongyneDiagnosisEntryPage = lazy(
  () => import("../NongyneCytoDiagnosis/NongyneDiagnosisEntryPage"),
);
const PathologistNongyneDiagnosisPage = lazy(
  () => import("../NongyneCytoDiagnosis/PathologistNongyneDiagnosisPage"),
);
const OutlabManagement = lazy(() => import("../Outlab"));
const OutlabStainRunList = lazy(() => import("../Outlab/OutlabStainRun/OutlabStainRunList"));
const OutlabConsultList = lazy(() => import("../Outlab/OutlabConsultList"));
const OutlabReportQueue = lazy(() => import("../Outlab/OutlabReportQueue"));
const OutlabTestQueue = lazy(() => import("../Outlab/OutlabTestQueue"));
const BlockStorageManager = lazy(() => import("../BlockStorage"));
const SlideStorageManager = lazy(() => import("../SlideStorage"));
const SlideBlockReleasePage = lazy(() => import("../SlideBlockRelease"));
const UnifiedAccession = lazy(() => import("../UnifiedAccession"));
const DecalQueuePage = lazy(() => import("../DecalQueue"));
const CellBlockTrackingPage = lazy(() => import("../CellBlock"));

const WsiFileListPage = lazy(() => import("../WSIFileList"));
const WsiSlideGalleryPage = lazy(() => import("../WSISlideGallery"));
const WsiViewerPage = lazy(() => import("../WSIViewer/WSIViewerPage"));
const UserManager = lazy(() => import("../../components/UserManager"));
const MasterData = lazy(() => import("../MasterData"));
const DashboardHome = lazy(() => import("./DashboardHome"));
const SystemSettings = lazy(() => import("../Admin/SystemSettings"));
const BillingHub = lazy(() => import("../Admin/Billing"));
const AuditLogPage = lazy(() => import("../Admin/AuditLogPage"));
const CriticalNotificationLogPage = lazy(() => import("../Admin/CriticalNotificationLogPage"));

interface Props {
  currentView: string;
  user: User | null;
  selectedSpecimenId: number | null;
  onOpenReport: (id: number, type: "surgical" | "gyne" | "nongyne") => void;
  onBackToWorklist: () => void;
  onNavigate?: (view: string) => void;
  isSidebarCollapsed?: boolean;
  isSideLayout?: boolean;
  defaultTab?: string;
}

// 2. สร้าง Config Mapping ครั้งเดียว (ไม่ต้องใช้ Switch-Case ยาวๆ)
const VIEW_CONFIG: Record<
  string,
  { pageKey: PageKey; component: React.ElementType }
> = {
  patients: { pageKey: "patients", component: PatientManager },
  "surgical-cases": {
    pageKey: "surgical-cases",
    component: SurgicalCaseManager,
  },
  grossing: { pageKey: "grossing", component: GrossExamination },
  "surgical-blocks": {
    pageKey: "surgical-blocks",
    component: SurgicalBlockList,
  },
  "decal-queue": {
    pageKey: "decal-queue",
    component: DecalQueuePage,
  },
  "sur:tissue-processing": {
    pageKey: "tissue-processing",
    component: ProcessingManager,
  },
  "his:process-out": {
    pageKey: "tissue-processing",
    component: ProcessingManager,
  },
  embedding: { pageKey: "embedding", component: EmbeddingManager },
  sectioning: { pageKey: "sectioning", component: SectioningManager },
  "he-staining-manager": {
    pageKey: "staining-manager",
    component: RoutineHEManager,
  },
  "staining-run": { pageKey: "staining-manager", component: StainingRun },
  "staining-manager": {
    pageKey: "staining-manager",
    component: StainManagement,
  },
  "print-sticker-he": {
    pageKey: "print-sticker-he",
    component: RoutineHEManager,
  },
  "slide-dispatch": {
    pageKey: "slide-dispatch",
    component: SlideDispatchListPage,
  },
  "gyne-slide-dispatch": {
    pageKey: "slide-dispatch",
    component: SlideDispatchListPage,
  },
  "nongyne-slide-dispatch": {
    pageKey: "slide-dispatch",
    component: SlideDispatchListPage,
  },
  "specimen-storage": {
    pageKey: "specimen-storage",
    component: SpecimenStorage,
  },
  "block-storage": {
    pageKey: "block-storage",
    component: BlockStorageManager,
  },
  "slide-storage": {
    pageKey: "slide-storage",
    component: SlideStorageManager,
  },
  "pathologist-page": {
    pageKey: "pathologist-page",
    component: PathologistPage,
  },
  "surgical-report-form": {
    pageKey: "surgical-report-form",
    component: SurgicalReportForm,
  },
  "all-report": { pageKey: "all-report", component: ReportHistoryTable },
  "report-lookup": { pageKey: "report-lookup", component: ReportHistoryTable },
  "print-report-queue": { pageKey: "all-report", component: PrintReportQueue },
  "stat-review": { pageKey: "report-analytics", component: ReportAnalyticsHub },
  "stat-cyto": { pageKey: "report-analytics", component: ReportAnalyticsHub },
  "workload-dashboard": { pageKey: "report-analytics", component: ReportAnalyticsHub },
  "report-analytics": { pageKey: "report-analytics", component: ReportAnalyticsHub },
  approval: { pageKey: "approval", component: PendingApprovalList },
  "wsi-file-list": { pageKey: "wsi-file-list", component: WsiFileListPage },
  "wsi-slide-gallery": { pageKey: "wsi-slide-gallery", component: WsiSlideGalleryPage },
  "wsi-viewer": { pageKey: "wsi-file-list", component: WsiViewerPage },
  "approval-manage": { pageKey: "approval", component: ApprovalDetailPage },
  "gyne-approval-manage": {
    pageKey: "approval",
    component: GyneApprovalDetailPage,
  },
  "nongyne-approval-manage": {
    pageKey: "approval",
    component: NongyneApprovalDetailPage,
  },

  "gyne-cyto-cases": {
    pageKey: "gyne-cyto-cases",
    component: GyneCytologyCasePage,
  },
  "nongyne-cyto-cases": {
    pageKey: "nongyne-cyto-cases",
    component: NongyneCaseManager,
  },
  "gyne-cyto-run-list": {
    pageKey: "gyne-cyto-run-list",
    component: GyneStainRunListPage,
  },
  "gyne-cyto-work-list": {
    pageKey: "gyne-cyto-work-list",
    component: GyneCytoWorklist,
  },
  "gyne-qc-review": {
    pageKey: "gyne-qc-review",
    component: GyneQCReviewTable,
  },
  "gyne-cyto-diagnosis-entry": {
    pageKey: "gyne-cyto-diagnosis-entry", // ใช้ Permission เดียวกับหน้า Worklist
    component: GyneDiagnosisEntryPage,
  },
  "pathologist-gyne-diagnosis": {
    pageKey: "gyne-cyto-diagnosis-entry",
    component: PathologistGyneDiagnosisPage,
  },

  "gyne-cyto-stains": {
    pageKey: "gyne-cyto-stains",
    component: GyneStainBatchPage,
  },
  "nongyne-cyto-stains": {
    pageKey: "nongyne-cyto-stains",
    component: NongyneStainRunListPage,
  },
  "nongyne-cyto-work-list": {
    pageKey: "nongyne-cyto-work-list",
    component: NongyneCytoWorklist,
  },
  "nongyne-cyto-diagnosis-entry": {
    pageKey: "nongyne-cyto-diagnosis-entry",
    component: NongyneDiagnosisEntryPage,
  },
  "pathologist-nongyne-diagnosis": {
    pageKey: "nongyne-cyto-diagnosis-entry",
    component: PathologistNongyneDiagnosisPage,
  },
  "nongyne-cell-block": {
    pageKey: "nongyne-cell-block",
    component: CellBlockTrackingPage,
  },

  "outlab-management": {
    pageKey: "outlab-management",
    component: OutlabManagement,
  },
  "outlab-run-list": {
    pageKey: "outlab-run-list",
    component: OutlabStainRunList,
  },
  "outlab-consult-list": {
    pageKey: "outlab-consult-list" as PageKey,
    component: OutlabConsultList,
  },
  "outlab-report-queue": {
    pageKey: "outlab-report-queue" as PageKey,
    component: OutlabReportQueue,
  },
  "outlab-test-queue": {
    pageKey: "outlab-test-queue" as PageKey,
    component: OutlabTestQueue,
  },

  users: { pageKey: "users", component: UserManager },
  settings: { pageKey: "settings", component: MasterData },
  "system-settings": { pageKey: "system-settings", component: SystemSettings },
  "billing-management": { pageKey: "billing-management", component: BillingHub },
  "audit-log": { pageKey: "audit-log", component: AuditLogPage },
  "critical-notification-log": { pageKey: "audit-log", component: CriticalNotificationLogPage },
  "slide-block-release": { pageKey: "slide-block-release", component: SlideBlockReleasePage },
  accession: { pageKey: "accession", component: UnifiedAccession },
};

export const resolveDashboardView = (props: Props) => {
  const { user, currentView, selectedSpecimenId, onOpenReport, onBackToWorklist, onNavigate } =
    props;

  const view = VIEW_CONFIG[currentView];

  // ถ้าเป็นหน้า Default หรือไม่มีใน Config
  if (!view || currentView === "dashboard") {
    return (
      <Suspense fallback={<Spin fullscreen size="large" />}>
        <DashboardHome user={user} onNavigate={onNavigate} onSelectCase={onOpenReport} />
      </Suspense>
    );
  }

  const { pageKey, component: Component } = view;

  return (
    <Suspense
      fallback={
        <Spin size="large" style={{ display: "block", margin: "100px auto" }} />
      }
    >
      <RequireRoleView user={user} roles={PAGE_PERMISSIONS[pageKey]}>
        <Component
          key={currentView}
          {...props}
          user={user}
          caseId={selectedSpecimenId?.toString()}
          reportId={selectedSpecimenId}
          onSelectCase={onOpenReport}
          onBack={onBackToWorklist}
        />
      </RequireRoleView>
    </Suspense>
  );
};

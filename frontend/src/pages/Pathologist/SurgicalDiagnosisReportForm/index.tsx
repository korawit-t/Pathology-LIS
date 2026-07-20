import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Form,
  Input,
  Button,
  Spin,
  Typography,
  Space,
  Row,
  Col,
  message,
  Anchor,
  Alert,
  Drawer,
  Card,
  Modal,
  Steps,
  Upload,
  DatePicker,
  Table,
  Tag,
} from "antd";
import {
  FileTextOutlined,
  MedicineBoxOutlined,
  ReloadOutlined,
  HistoryOutlined,
  EditOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  ArrowLeftOutlined,
  UploadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  FileAddOutlined,
  FilePdfOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PatientInfoCard from "../../../components/PatientInfoCard";
import ClinicalInfoSection from "../../../components/ClinicalInfoSection";
import { useSurgicalReport } from "../hooks/useSurgicalReport";
import SpecimenManagerSection from "../../../components/SpecimenManagerSection/SpecimenManagerSection";
import PageContainer from "../../../components/Layout/PageContainer";
import SpecimenIntegratedWorkblock from "./components/SpecimenIntegratedWorkblock";
import WsiSlidesSection from "./components/WsiSlidesSection";
import MicroscopicImageCaptureModal from "./components/MicroscopicImageCaptureModal";
import MicroscopicImageService from "../../../services/microscopicImageService";
import { MicroscopicImage } from "../../../types/image";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import IntegratedCaseDiagnosisEditor from "./components/IntegratedCaseDiagnosisEditor";
import SurgicalReportToolbar from "./components/SurgicalReportToolbar";
import ReportHistorySection from "./components/ReportHistorySection";
import PathologistDiagnosisManager from "./components/PathologistDiagnosisManager";
import ReportMasterControl from "./components/ReportMasterControl";
import FinalizeReportPage from "./components/FinalizeReportPage";
import ReportStationSettingsModal from "./components/ReportStationSettingsModal";
import CaseFlagManager from "./components/CaseFlagManager";
import CytoHistoCorrelationCard from "./components/CytoHistoCorrelationCard";
import SurgicalReportNavigator from "./components/SurgicalReportNavigator";
import styles from "../../../styles/LayoutWidget.module.css";
import StyledCard from "../../../components/Layout/StyledCard";
import UserService, { UserPreferences } from "../../../services/userService";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import SurgicalReportService from "../../../services/surgicalReportService";
import ReportGenerationService from "../../../services/reportGenerationService";
import type { ReportGenRequest } from "../../../services/reportGenerationService";
import AIGeneratePreviewModal from "./components/AIGeneratePreviewModal";
import { useAuth } from "../../../hooks/useAuth";
import logger from "../../../utils/logger";
import type { User } from "../../../types/user";
import type { SurgicalReport } from "../../../types/surgicalReport";
import { FinalizeData } from "./components/FinalizeReportPage";
import WsiSettingService from "../../../services/wsiSettingService";
import type { WsiFile } from "../../../types/system";
import { getConsultLockState } from "../utils/consultLockState";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Props {
  user: User;
  caseId: string;
  onBack: () => void;
  isSidebarCollapsed?: boolean;
  isSideLayout?: boolean;
}

const SurgicalReportForm: React.FC<Props> = ({
  user,
  caseId,
  onBack,
  isSidebarCollapsed,
  isSideLayout,
}) => {
  const { updateUser } = useAuth();
  const [form] = Form.useForm();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [consultPdfPopupOpen, setConsultPdfPopupOpen] = useState(false);
  const [popupUploadFile, setPopupUploadFile] = useState<File | null>(null);
  const [popupReceivedAt, setPopupReceivedAt] = useState<Dayjs>(dayjs());
  const [popupUploading, setPopupUploading] = useState(false);
  const consultPdfPopupShownRef = useRef(false);
  const [consultPdfBlobUrl, setConsultPdfBlobUrl] = useState<string | null>(null);
  const [consultPdfPreviewLoading, setConsultPdfPreviewLoading] = useState(false);
  const [consultPdfDeleting, setConsultPdfDeleting] = useState(false);
  const [consultApproving, setConsultApproving] = useState(false);

  const [completedCasePopupOpen, setCompletedCasePopupOpen] = useState(false);
  const completedCasePopupShownRef = useRef(false);
  const [isAddendumMode, setIsAddendumMode] = useState(false);
  const [completedPdfUrl, setCompletedPdfUrl] = useState<string | null>(null);
  const [completedPdfLoading, setCompletedPdfLoading] = useState(false);
  const [completedReports, setCompletedReports] = useState<SurgicalReport[]>([]);
  const [completedReportsLoading, setCompletedReportsLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

const handleOpenFinalizeModal = async () => {
    await handleSave();

    // Check for empty diagnoses before opening finalize modal
    const isCombined = diagnosisMode === "integrated" || diagnosisMode === "clean";
    if (isCombined) {
      const caseText = (form.getFieldValue("case_diagnosis_text") || "").trim();
      if (!caseText) {
        Modal.confirm({
          title: "Diagnosis ยังว่างอยู่",
          icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
          content: "ยังไม่ได้กรอก diagnosis รวม ต้องการ Sign Off ต่อหรือไม่?",
          okText: "Sign Off ต่อ",
          cancelText: "ยกเลิก",
          onOk: () => setIsFinalizeModalOpen(true),
        });
        return;
      }
    } else {
      const specimens = surgicalCase?.specimens || [];
      const emptySpecimens = specimens.filter((spec) => {
        const diag = (form.getFieldValue(["diagnoses", spec.id, "diagnosis"]) || "").trim();
        return !diag;
      });
      if (emptySpecimens.length > 0) {
        const labels = emptySpecimens
          .map((s) => s.specimen_label || `Specimen #${s.id}`)
          .join(", ");
        Modal.confirm({
          title: "Diagnosis ยังไม่ครบ",
          icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
          content: (
            <span>
              ชิ้นเนื้อต่อไปนี้ยังไม่มี diagnosis:{" "}
              <strong>{labels}</strong>
              <br />
              ต้องการ Sign Off ต่อหรือไม่?
            </span>
          ),
          okText: "Sign Off ต่อ",
          cancelText: "ยกเลิก",
          onOk: () => setIsFinalizeModalOpen(true),
        });
        return;
      }
    }

    setIsFinalizeModalOpen(true);
  };

  const handleConfirmFinalize = async (data: FinalizeData) => {
    const success = await handleCompleteWorkflow(data, "Report signed off successfully");
    if (success) {
      setIsFinalizeModalOpen(false);
      onBack();
    }
  };

  const handleConfirmFinalizeWithConsult = async (data: FinalizeData) => {
    const success = await handleCompleteWorkflow(data, "Report signed off — Internal Consult request sent");
    if (success) {
      setIsFinalizeModalOpen(false);
      onBack();
    }
  };

  const handleConfirmAndOutLab = async (reason: string, data: FinalizeData) => {
    form.setFieldsValue({
      is_out_lab_consult: true,
      consult_reason: reason,
    });
    const outLabData = {
      ...data,
      is_pending: true,
      pending_reason: data.pending_reason || "Out-Lab Consult — awaiting results",
    };
    const success = await handleCompleteWorkflow(outLabData, "Report signed off — flagged for Out-Lab Consult");
    if (success) {
      setIsFinalizeModalOpen(false);
      onBack();
    }
  };

  const [microImages, setMicroImages] = useState<MicroscopicImage[]>([]);
  const [wsiSlides, setWsiSlides] = useState<WsiFile[]>([]);
  const [isMicroModalOpen, setIsMicroModalOpen] = useState(false);
  const [targetSpecimenId, setTargetSpecimenId] = useState<number | null>(null);
  const [editingImage, setEditingImage] = useState<MicroscopicImage | null>(
    null,
  );
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // ── Auto-save & unsaved-changes guard ──────────────────────────────
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState<boolean>(
    user?.preferences?.auto_save ?? true,
  );
  const [autoSaveInterval, setAutoSaveInterval] = useState<number>(
    user?.preferences?.auto_save_interval ?? 45,
  );
  const [editorFontSize, setEditorFontSize] = useState<
    "small" | "medium" | "large"
  >(user?.preferences?.editor_font_size ?? "medium");
  const [showSpecimenCategory, setShowSpecimenCategory] = useState<boolean>(
    user?.preferences?.show_specimen_category ?? true,
  );

  const EDITOR_FONT_SIZE_MAP = {
    small: "13px",
    medium: "15px",
    large: "18px",
  } as const;

  const {
    loading,
    pdfUrl,
    generatingPdf,
    surgicalCase,
    allDiagnoses,
    currentDiagnosis,
    pathologists,
    isLocked,
    hasOriginalSigned,
    settings,
    isAwaitingApproval,
    diagnosisMode,
    setDiagnosisMode,
    handleSaveAsIndividualDraft,
    handleSaveAsIntegratedDraft,
    handleSaveAsCleanDraft,
    handlePreviewPDF,
    handleSelectDiagnosis,
    refresh,
    handleCompleteWorkflow,
    setSurgicalCase,
  } = useSurgicalReport(caseId, user, form);

  const { isConsultEditorLocked, isConsultFinalizeLocked, isEditorLocked, isFinalizeLocked } =
    getConsultLockState({
      isLocked,
      isAddendumMode,
      isAwaitingApproval,
      isOutLabConsult: !!surgicalCase?.is_out_lab_consult,
      consultStatus: surgicalCase?.consult_status,
      consultPdfPath: surgicalCase?.consult_pdf_path,
    });

  // Auto-open consult PDF popup once per case-load whenever a consult round is active —
  // regardless of whether the PDF is already uploaded (e.g. by lab staff before the
  // pathologist opened the case). The popup itself switches between an upload view and
  // a preview/sign-off view depending on whether consult_pdf_path is set.
  useEffect(() => {
    if (
      surgicalCase &&
      surgicalCase.is_out_lab_consult &&
      surgicalCase.consult_status === "processing" &&
      !consultPdfPopupShownRef.current
    ) {
      consultPdfPopupShownRef.current = true;
      setConsultPdfPopupOpen(true);
    }
  }, [surgicalCase?.id, surgicalCase?.is_out_lab_consult, surgicalCase?.consult_status]);

  // Load the consult PDF inline as soon as the popup opens in the
  // "already uploaded" state — no extra click needed to preview it.
  useEffect(() => {
    let activeUrl: string | null = null;
    if (consultPdfPopupOpen && surgicalCase?.consult_pdf_path && caseId) {
      setConsultPdfPreviewLoading(true);
      SurgicalCaseService.getConsultPdfBlob(Number(caseId))
        .then((blob) => {
          activeUrl = URL.createObjectURL(blob);
          setConsultPdfBlobUrl(activeUrl);
        })
        .catch(() => message.error("ไม่สามารถโหลด Consult PDF ได้"))
        .finally(() => setConsultPdfPreviewLoading(false));
    } else {
      setConsultPdfBlobUrl(null);
    }
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [consultPdfPopupOpen, surgicalCase?.consult_pdf_path, caseId]);

  // Handle signed-out case entry: always show popup so user sees report history.
  // Skipped while a consult round is actively pending (upload or re-sign-off) so
  // that popup doesn't cover the Consult PDF popup underneath it.
  useEffect(() => {
    const isSignedOut =
      surgicalCase?.status === "signed out" || surgicalCase?.status === "published";
    const hasActiveConsult =
      !!surgicalCase?.is_out_lab_consult && surgicalCase?.consult_status === "processing";
    if (surgicalCase && isSignedOut && !hasActiveConsult && !completedCasePopupShownRef.current) {
      completedCasePopupShownRef.current = true;
      setCompletedCasePopupOpen(true);
    }
  }, [
    surgicalCase?.id,
    surgicalCase?.status,
    surgicalCase?.is_out_lab_consult,
    surgicalCase?.consult_status,
  ]);

  // Fetch report history when popup opens OR history drawer opens
  useEffect(() => {
    if ((!completedCasePopupOpen && !isHistoryOpen) || !surgicalCase?.id) {
      if (!isHistoryOpen) {
        setCompletedReports([]);
        setSelectedReportId(null);
      }
      return;
    }
    setCompletedReportsLoading(true);
    SurgicalReportService.getReportHistory(Number(surgicalCase.id))
      .then((data) => {
        setCompletedReports(data.items);
        const publishedReports = data.items.filter((r) => r.status === "published");
        const latest = publishedReports.reduce<SurgicalReport | null>(
          (best, r) => (!best || r.version_no > best.version_no ? r : best),
          null,
        );
        if (latest) setSelectedReportId(latest.id);
      })
      .catch(() => {})
      .finally(() => setCompletedReportsLoading(false));
  }, [completedCasePopupOpen, isHistoryOpen, surgicalCase?.id, historyRefreshKey]);

  const handleDeleteDraftReport = (reportId: number) => {
    Modal.confirm({
      title: "Delete Draft Report",
      icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
      content: "This draft report will be permanently deleted. Continue?",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        setDeletingReportId(reportId);
        try {
          await SurgicalReportService.deleteReport(reportId);
          message.success("Draft report deleted");
          if (selectedReportId === reportId) setSelectedReportId(null);
          setHistoryRefreshKey((k) => k + 1);
        } catch {
          message.error("Failed to delete draft report");
        } finally {
          setDeletingReportId(null);
        }
      },
    });
  };

  // Fetch PDF when selected report changes
  useEffect(() => {
    let activeUrl: string | null = null;
    if (completedCasePopupOpen && selectedReportId) {
      setCompletedPdfLoading(true);
      SurgicalReportService.getReportPdf(selectedReportId)
        .then((blob) => {
          activeUrl = URL.createObjectURL(blob);
          setCompletedPdfUrl(activeUrl);
        })
        .catch(() => message.error("Failed to load PDF preview"))
        .finally(() => setCompletedPdfLoading(false));
    } else {
      setCompletedPdfUrl(null);
    }
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [completedCasePopupOpen, selectedReportId]);

  const handlePopupUpload = async () => {
    if (!popupUploadFile || !caseId) return;
    setPopupUploading(true);
    try {
      await SurgicalCaseService.uploadConsultPdf(
        Number(caseId),
        popupUploadFile,
        popupReceivedAt.toISOString(),
      );
      message.success("Consult PDF uploaded successfully");
      // Keep the popup open — it switches to Preview/Sign Off once
      // surgicalCase.consult_pdf_path comes back truthy from refresh().
      setPopupUploadFile(null);
      refresh();
    } catch {
      message.error("Failed to upload Consult PDF");
    } finally {
      setPopupUploading(false);
    }
  };

  const handleSignOffFromConsultPopup = async () => {
    if (!caseId) return;
    setConsultApproving(true);
    try {
      await SurgicalCaseService.approveConsultPdf(Number(caseId));
      message.success("Consult PDF reviewed and approved");
      refresh();
    } catch {
      message.error("Failed to record consult approval");
      return;
    } finally {
      setConsultApproving(false);
    }
    setConsultPdfPopupOpen(false);
    handleOpenFinalizeModal();
  };

  const handleDeleteConsultPdf = () => {
    if (!caseId) return;
    Modal.confirm({
      title: "Delete Consult PDF",
      icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
      content: "Remove the uploaded consult PDF? You'll need to upload a new one before signing off.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        setConsultPdfDeleting(true);
        try {
          await SurgicalCaseService.deleteConsultPdf(Number(caseId));
          message.success("Consult PDF deleted");
          refresh();
        } catch {
          message.error("Failed to delete Consult PDF");
        } finally {
          setConsultPdfDeleting(false);
        }
      },
    });
  };

  // ── Unified save (used by toolbar, auto-save, and keyboard shortcut) ──
  const handleSave = useCallback(async () => {
    if (isFinalizeLocked) return;
    try {
      if (diagnosisMode === "individual") await handleSaveAsIndividualDraft();
      else if (diagnosisMode === "integrated")
        await handleSaveAsIntegratedDraft();
      else if (diagnosisMode === "clean") await handleSaveAsCleanDraft();
      // Only mark saved on actual success — errors in the hooks show their own toast
      setLastSavedAt(new Date());
      setIsDirty(false);
    } catch {
      // hook already showed message.error; do not clear dirty / lastSavedAt
    }
  }, [
    isFinalizeLocked,
    diagnosisMode,
    handleSaveAsIndividualDraft,
    handleSaveAsIntegratedDraft,
    handleSaveAsCleanDraft,
  ]);

  const handleAIGenerate = useCallback(() => {
    setAiModalOpen(true);
  }, []);

  const buildAIPayload = useCallback(
    (source: "gross_and_micro" | "gross_only" | "micro_only"): ReportGenRequest => {
      const needsDraft = (source === "gross_and_micro" || source === "micro_only") && diagnosisMode === "individual";
      const draftSpecimens = needsDraft
        ? (surgicalCase?.specimens || []).map((spec) => ({
            specimen_id: spec.id,
            microscopic_description:
              form.getFieldValue(["diagnoses", spec.id, "microscopic_description"]) || "",
          }))
        : [];
      return {
        source,
        diagnosis_mode: diagnosisMode,
        draft_data: draftSpecimens.length > 0 ? { specimens: draftSpecimens } : undefined,
      };
    },
    [surgicalCase, diagnosisMode, form],
  );

  const fetchAIPreview = useCallback(
    (source: "gross_and_micro" | "gross_only" | "micro_only") => {
      if (!surgicalCase?.id) return Promise.reject(new Error("No case"));
      return ReportGenerationService.getPreview(surgicalCase.id, buildAIPayload(source));
    },
    [surgicalCase, buildAIPayload],
  );

  const handleAIConfirm = useCallback(
    async (source: "gross_and_micro" | "gross_only" | "micro_only") => {
      if (!surgicalCase?.id) return;
      setIsAIGenerating(true);
      try {
        const result = await ReportGenerationService.generate(
          surgicalCase.id,
          buildAIPayload(source),
        );
        if (result.mode === "individual") {
          result.specimens.forEach((item) => {
            form.setFieldValue(
              ["diagnoses", item.specimen_id, "microscopic_description"],
              item.microscopic_description,
            );
            form.setFieldValue(["diagnoses", item.specimen_id, "diagnosis"], item.diagnosis);
          });
          message.success(
            `AI draft generated for ${result.specimens.length} specimen(s) — review before saving.`,
          );
        } else {
          if (result.case_diagnosis_text) {
            form.setFieldValue("case_diagnosis_text", result.case_diagnosis_text);
            message.success("AI draft generated — review before saving.");
          }
        }
        setIsDirty(true);
        setAiModalOpen(false);
      } catch (err: any) {
        message.error(err?.response?.data?.detail || "AI generation failed");
      } finally {
        setIsAIGenerating(false);
      }
    },
    [surgicalCase, buildAIPayload, form],
  );

  // ── Auto-save on configurable interval when there are unsaved changes ──
  useEffect(() => {
    if (isEditorLocked || !isAutoSaveEnabled) return;
    autoSaveRef.current = setInterval(() => {
      setIsDirty((dirty) => {
        if (dirty) handleSave();
        return dirty;
      });
    }, autoSaveInterval * 1_000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [isEditorLocked, isAutoSaveEnabled, autoSaveInterval, handleSave]);

  // ── Keyboard shortcuts: Ctrl/⌘+S = save, Ctrl/⌘+Shift+P = preview ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePreviewPDF().then(() => setIsPreviewModalOpen(true));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleSave, handlePreviewPDF]);

  // ── Discard: reload from server (safe), no DB delete ──
  const handleDiscard = useCallback(() => {
    if (!isDirty) return;
    Modal.confirm({
      title: "Discard Changes",
      content:
        "Reload the last saved version? Your unsaved changes will be lost.",
      okText: "Discard",
      okType: "danger",
      cancelText: "Keep Editing",
      onOk: () => {
        form.resetFields();
        refresh();
        setIsDirty(false);
        setLastSavedAt(null);
      },
      onCancel: () => {},
    });
  }, [isDirty, form, refresh]);

  // ── Back with unsaved-changes guard ──
  const handleBack = useCallback(() => {
    if (!isDirty) {
      onBack();
      return;
    }
    const modal = Modal.confirm({
      title: "Unsaved Changes",
      content: "You have unsaved changes.",
      okText: "Save & Leave",
      cancelText: "Stay",
      onOk: async () => {
        await handleSave();
        onBack();
      },
      onCancel: () => {},
      footer: (_, { OkBtn, CancelBtn }) => (
        <Space>
          <CancelBtn />
          <OkBtn />
          <Button
            danger
            type="link"
            size="small"
            onClick={() => {
              modal.destroy();
              onBack();
            }}
          >
            Leave without saving
          </Button>
        </Space>
      ),
    });
  }, [isDirty, handleSave, onBack]);

  // Initialize display settings from user preferences
  const [isSplitMode, setIsSplitMode] = useState<boolean>(
    user?.preferences?.is_split_mode ?? false,
  );
  const [isPatientInfoExpanded, setIsPatientInfoExpanded] = useState<boolean>(
    user?.preferences?.patient_info_expanded ?? true,
  );
  const [showNavigatorPref, setShowNavigatorPref] = useState<boolean>(
    user?.preferences?.show_navigator ?? true,
  );

  const fetchMicroImages = async () => {
    // 🚩 ตรวจสอบว่ามี caseId หรือไม่ก่อนยิง API
    if (!caseId) return;

    try {
      // 🚩 เปลี่ยนชื่อให้ตรงกับ Service (getImagesByCaseId)
      const data = await MicroscopicImageService.getImagesByCaseId(caseId);
      setMicroImages(data);
    } catch (error) {
      // แจ้งเตือนผู้ใช้หากดึงข้อมูลไม่สำเร็จ
      logger.error("Failed to fetch micro images:", error);
      message.error("ไม่สามารถโหลดรูปภาพ Microscopic ได้");
    }
  };

  const fetchWsiSlides = async () => {
    if (!caseId) return;
    try {
      const slides = await WsiSettingService.getCaseSlides(Number(caseId));
      setWsiSlides(slides);
    } catch { /* silent — ไม่มี WSI ก็ไม่แสดง */ }
  };

  // 🚩 โหลดรูปเมื่อเปิดหน้าเว็บ หรือเมื่อ caseId เปลี่ยนแปลง
  useEffect(() => {
    if (caseId) {
      fetchMicroImages();
      fetchWsiSlides();
    }
  }, [caseId]);

  // 🚩 เพิ่มฟังก์ชันสำหรับ Refresh (สำหรับส่งลงไปให้ Gallery ใช้ตอนลบรูป)
  const handleRefreshMicroImages = () => {
    fetchMicroImages();
  };

  // 🚩 ฟังก์ชันเปิด Modal กล้อง
  const handleOpenMicroCapture = (specimenId: number) => {
    setTargetSpecimenId(specimenId);
    setIsMicroModalOpen(true);
  };

  // 🚩 เพิ่มฟังก์ชันนี้สำหรับ "แก้ไข"
  const handleEditMicroImage = (image: MicroscopicImage) => {
    setEditingImage(image); // 🚩 ใส่ข้อมูลรูปที่จะแก้ลงไป
    setTargetSpecimenId(image.specimen_id);
    setIsMicroModalOpen(true);
  };

  const handleCaptureAndUpload = async (
    imageSrc: string,
    specimenId: number,
    metadata: Pick<MicroscopicImage, "magnification" | "stain" | "description">,
  ) => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    try {
      if (editingImage) {
        // 🚩 กรณีแก้ไข (Update) - ใช้ข้อมูลจาก metadata ตรงๆ
        await MicroscopicImageService.updateImage(editingImage.id, {
          magnification: metadata.magnification,
          stain: metadata.stain,
          description: metadata.description,
        });
        message.success("อัปเดตข้อมูลรูปภาพสำเร็จ");
      } else {
        // 🚩 กรณีอัปโหลดใหม่ (Upload)
        const response = await fetch(imageSrc);
        const blob = await response.blob();

        // ✅ เพิ่มการตรวจขนาดไฟล์
        if (blob.size > MAX_FILE_SIZE) {
          message.error(
            `ไฟล์ใหญ่เกินไป (${(blob.size / (1024 * 1024)).toFixed(2)} MB). จำกัดที่ 5MB`,
          );
          return;
        }

        // ✅ สร้างชื่อไฟล์ที่มี Timestamp เพื่อไม่ให้ชื่อใน UI ซ้ำกัน
        const timestamp = new Date()
          .toISOString()
          .replace(/[-:T.]/g, "")
          .slice(8, 14); // ได้ HHmmss
        const fileName = `micro_${specimenId}_${timestamp}.jpg`;

        const file = new File([blob], fileName, { type: "image/jpeg" });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("magnification", metadata.magnification);
        formData.append("stain", metadata.stain);
        formData.append("description", metadata.description || "");

        await MicroscopicImageService.uploadImage(specimenId, formData);
        message.success("อัปโหลดรูปภาพสำเร็จ");
      }

      fetchMicroImages();
      setIsMicroModalOpen(false);
      setEditingImage(null); // 🚩 อย่าลืม Reset state การแก้ไข
    } catch (error) {
      message.error("ดำเนินการล้มเหลว");
      logger.error(error);
    }
  };

  if (loading && !surgicalCase) {
    return (
      <div style={{ textAlign: "center", padding: "100px" }}>
        <Spin size="large" tip="กำลังโหลดข้อมูล..." />
      </div>
    );
  }

  if (!loading && surgicalCase && (surgicalCase.specimens?.length ?? 0) === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "100px 40px",
          textAlign: "center",
        }}
      >
        <ExclamationCircleOutlined
          style={{ fontSize: 64, color: "#faad14", marginBottom: 24 }}
        />
        <Title level={3} style={{ marginBottom: 8 }}>
          No Specimens Found
        </Title>
        <Text type="secondary" style={{ fontSize: 15, maxWidth: 420 }}>
          This case has no specimens recorded yet. Please complete{" "}
          <Text strong>Gross Examination</Text> before proceeding to diagnosis.
        </Text>
        <Button
          icon={<ArrowLeftOutlined />}
          size="large"
          style={{ marginTop: 32 }}
          onClick={onBack}
        >
          Back to Worklist
        </Button>
      </div>
    );
  }

  // 1. Logic เดิม: โชว์ Navigator ด้านข้าง เมื่อพับ Sidebar
  const showNavigator = isSideLayout ? isSidebarCollapsed : true;

  // 2. Logic ใหม่: โชว์ Anchor แนวนอนที่ Top Bar เมื่อ "เปิด" Sidebar (เพื่อประหยัดพื้นที่แนวตั้ง)
  // และซ่อนมันเมื่อพับ Sidebar (เพราะเรามี Navigator ด้านข้างมาแทนแล้ว)
  const showTopAnchor = isSideLayout ? !isSidebarCollapsed : false;

  const handleUpdatePreference = async (newPrefs: UserPreferences) => {
    try {
      // 1. อัปเดต UI State ทันที (Optimistic Update)
      if (newPrefs.is_split_mode !== undefined) {
        setIsSplitMode(newPrefs.is_split_mode);
      }
      if (newPrefs.default_diagnosis_mode !== undefined) {
        setDiagnosisMode(
          newPrefs.default_diagnosis_mode as
            | "individual"
            | "integrated"
            | "clean",
        );
      }
      if (newPrefs.patient_info_expanded !== undefined) {
        setIsPatientInfoExpanded(newPrefs.patient_info_expanded);
      }
      if (newPrefs.show_navigator !== undefined) {
        setShowNavigatorPref(newPrefs.show_navigator);
      }
      if (newPrefs.auto_save !== undefined) {
        setIsAutoSaveEnabled(newPrefs.auto_save);
      }
      if (newPrefs.auto_save_interval !== undefined) {
        setAutoSaveInterval(newPrefs.auto_save_interval);
      }
      if (newPrefs.editor_font_size !== undefined) {
        setEditorFontSize(
          newPrefs.editor_font_size as "small" | "medium" | "large",
        );
      }
      if (newPrefs.show_specimen_category !== undefined) {
        setShowSpecimenCategory(newPrefs.show_specimen_category);
      }

      // 2. บันทึกลง Database ผ่าน UserService
      await UserService.updateMyPreferences(newPrefs);

      // 3. อัปเดต localStorage เพื่อให้สิทธิ์และค่า setting ผูกกับ Current Session
      const currentUserStr = localStorage.getItem("user");
      if (currentUserStr) {
        const currentUserData = JSON.parse(currentUserStr);
        currentUserData.preferences = {
          ...currentUserData.preferences,
          ...newPrefs,
        };
        localStorage.setItem("user", JSON.stringify(currentUserData));
        // 4. ให้ React Re-render ทุก Component ที่ใช้งาน User Context
        updateUser(currentUserData);
      }
    } catch (error) {
      logger.error("Failed to update preferences:", error);
      message.error("ไม่สามารถบันทึกการตั้งค่าได้");
    }
  };

  return (
    <Form form={form} layout="vertical" onValuesChange={() => setIsDirty(true)}>
      <SurgicalReportToolbar
        accessionNo={surgicalCase?.accession_no}
        onBack={handleBack}
        onSave={handleSave}
        onPreview={async () => {
          await handlePreviewPDF();
          setIsPreviewModalOpen(true);
        }}
        onSignOff={handleOpenFinalizeModal}
        onOpenHistory={() => setIsHistoryOpen(true)}
        loading={loading}
        generatingPdf={generatingPdf}
        isLocked={isFinalizeLocked}
        showTopAnchor={showTopAnchor}
        allDiagnosesCount={new Set(allDiagnoses?.map((d) => d.diagnosis_order)).size || 0}
        isSplitMode={isSplitMode}
        onToggleSplitMode={() => setIsSplitMode(!isSplitMode)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        onDiscard={handleDiscard}
        hasReport={(surgicalCase?.reports?.length ?? 0) > 0 || lastSavedAt !== null}
      />

      <PageContainer withCard>
        {!isLocked && isConsultFinalizeLocked && (
          <div style={{ marginBottom: 20 }}>
            <Alert
              message="Case Locked — Awaiting External Consult Report"
              description="Slides have been dispatched to an external lab. Upload the consult PDF to enable sign-off."
              type="warning"
              showIcon
              action={
                <Button size="small" onClick={() => setConsultPdfPopupOpen(true)}>
                  Upload PDF
                </Button>
              }
            />
          </div>
        )}
        {!isLocked && isConsultEditorLocked && !isConsultFinalizeLocked && (
          <div style={{ marginBottom: 20 }}>
            <Alert
              message="Consult PDF Uploaded — Ready to Sign Off"
              description="The diagnosis editor is locked. Click Sign Off to complete the consult report with the uploaded PDF."
              type="info"
              showIcon
              action={
                <Button size="small" onClick={() => setConsultPdfPopupOpen(true)}>
                  View / Sign Off
                </Button>
              }
            />
          </div>
        )}
        {isAwaitingApproval && (
          <div style={{ marginBottom: 20 }}>
            <Alert
              message="Report Awaiting Approval"
              description="This report is currently pending review. Editing is disabled until approval or rejection."
              type="info"
              showIcon
              action={
                <Button size="small" type="default" ghost onClick={refresh}>
                  <ReloadOutlined /> Refresh Status
                </Button>
              }
            />
          </div>
        )}
        <Row gutter={[24, 0]} wrap={false}>
          {showNavigator && showNavigatorPref && (
            <SurgicalReportNavigator isDarkMode={isDarkMode} />
          )}
          {/* คอลัมน์กลาง: Main Form (ปรับ span ตามโหมด) */}
          <Col flex="auto" style={{ minWidth: 0 }}>
            <Row gutter={[24, 24]}>
              {/* ⬅️ ฝั่งซ้าย: แบบฟอร์มการทำงาน */}
              <Col xs={24} lg={isSplitMode ? 14 : 24}>
                <Space
                  direction="vertical"
                  size={16}
                  style={{ display: "flex" }}
                >
                  {/* 2. Patient Info */}
                  <div id="patient-info">
                    <PatientInfoCard
                      activeCase={surgicalCase}
                      activeCaseType="surgical"
                      isExpanded={isPatientInfoExpanded}
                      onToggle={(state) =>
                        handleUpdatePreference({ patient_info_expanded: state })
                      }
                    />
                  </div>

                  {/* Clinical Info and Specimen Manager - 2 Columns (50/50) or Stacked in Split Mode */}
                  <Row gutter={[16, 16]} align="stretch">
                    <Col xs={24} lg={isSplitMode ? 24 : 10}>
                      <div id="clinical-info" style={{ height: "100%" }}>
                        <ClinicalInfoSection
                          name="clinical_diagnosis"
                          rows={4} // ปรับจำนวนแถวให้เล็กลงหน่อยเพราะกางกว้างแล้ว
                          label="Clinical Diagnosis"
                        />
                      </div>
                    </Col>
                    <Col xs={24} lg={isSplitMode ? 24 : 14}>
                      <div id="specimen-manager" style={{ height: "100%" }}>
                        <SpecimenManagerSection
                          key={`spec-mgr-${surgicalCase?.id}`}
                          activeCaseId={surgicalCase?.id}
                          specimens={surgicalCase?.specimens || []}
                          activeSpecimenId={
                            currentDiagnosis?.surgical_specimen_id
                          }
                          canAddDelete={false}
                          onSpecimensChange={() => refresh()}
                          showSpecimenName={settings?.show_specimen_name}
                          showSpecimenCategory={showSpecimenCategory}
                        />
                      </div>
                    </Col>
                  </Row>

                  <WsiSlidesSection caseId={Number(caseId)} />

                  {/* 3. Diagnostic Station ทั้งหมด (Integrated Editor + Workblocks) */}
                  <StyledCard
                    id="diagnostic-station"
                    // 🚩 ถอด border/borderRadius/background เดิมออก เพราะ StyledCard จัดการให้แล้ว
                    bodyStyle={{ padding: 0 }} // 🚩 สำคัญ: ตั้งเป็น 0 เพื่อให้ ReportMasterControl ชิดขอบพอดี
                    style={{
                      overflow: "hidden", // ยังคงไว้เพื่อให้เนื้อหาข้างในถูกตัดตามมุมมน 20px ของ StyledCard
                      scrollMarginTop: "100px",
                    }}
                  >
                    {/* 🚩 1. แถบคอนโทรล (ติดขอบบน) */}
                    <ReportMasterControl
                      form={form}
                      reports={allDiagnoses || []}
                      diagnosisMode={diagnosisMode}
                      setDiagnosisMode={setDiagnosisMode}
                      isLocked={isEditorLocked}
                      hasOriginalSigned={hasOriginalSigned}
                      specimens={surgicalCase?.specimens || []}
                      showSpecimenName={settings?.show_specimen_name}
                    />

                    {/* 🚩 2. Integrated/Clean Editor (ถ้าอยู่ในโหมดรวม) */}
                    {(diagnosisMode === "integrated" ||
                      diagnosisMode === "clean") && (
                      <div
                        style={{
                          padding: "16px",
                          borderBottom: "1px solid #f0f0f0",
                          // 🚩 เปลี่ยนสีพื้นหลังเบาๆ ตามโหมดเพื่อให้หมอไม่สับสน
                          background:
                            diagnosisMode === "clean" ? "#f6ffed" : "#f0f7ff",
                        }}
                      >
                        <IntegratedCaseDiagnosisEditor
                          surgicalCase={surgicalCase}
                          isLocked={isEditorLocked}
                          form={form}
                          diagnosisMode={diagnosisMode}
                          onAIGenerate={handleAIGenerate}
                          isAIGenerating={isAIGenerating}
                        />
                      </div>
                    )}

                    {/* 🚩 3. รายการชิ้นเนื้อ (Workblocks) */}
                    <div
                      className="workblocks-container"
                      style={{ fontSize: EDITOR_FONT_SIZE_MAP[editorFontSize], ["--editor-font-size" as string]: EDITOR_FONT_SIZE_MAP[editorFontSize] } as React.CSSProperties}
                    >
                      {surgicalCase?.specimens?.map((spec, index: number) => (
                        <SpecimenIntegratedWorkblock
                          key={spec.id}
                          specimen={spec}
                          surgicalCase={surgicalCase}
                          form={form}
                          isLocked={isEditorLocked}
                          hasOriginalSigned={hasOriginalSigned}
                          pathologists={pathologists}
                          microImages={microImages}
                          wsiSlides={wsiSlides}
                          onOpenMicroCapture={handleOpenMicroCapture}
                          onEditMicroImage={handleEditMicroImage}
                          onRefreshMicroImages={fetchMicroImages}
                          hideDiagnosisEditor={
                            diagnosisMode === "integrated" ||
                            diagnosisMode === "clean"
                          }
                          showAIGenerate={index === 0 && diagnosisMode === "individual" && !!(settings?.report_gen_llm_profile_id)}
                          onAIGenerate={handleAIGenerate}
                          isAIGenerating={isAIGenerating}
                          isLast={index === surgicalCase.specimens.length - 1}
                        />
                      ))}
                    </div>
                  </StyledCard>

                  <Row gutter={[16, 16]} align="stretch">
                    <Col xs={24} lg={14}>
                      <div style={{ height: "100%" }}>
                        <PathologistDiagnosisManager
                          form={form}
                          pathologists={pathologists}
                          defaultPathologistId={
                            surgicalCase?.pathologist_id || user?.id
                          }
                          isLocked={isEditorLocked}
                          namePath={["global_pathologists"]}
                          settings={settings}
                        />
                      </div>
                    </Col>
                    <Col xs={24} lg={10}>
                      <div style={{ height: "100%" }}>
                        <CaseFlagManager
                          isLocked={isLocked && !isAddendumMode}
                          form={form}
                          caseId={Number(caseId)}
                          reportId={surgicalCase?.reports?.find(
                            (r: SurgicalReport) => ["draft", "pending", "pending_approval"].includes(r.status)
                          )?.id}
                          currentUserId={user?.id}
                          pathologists={pathologists.map((p: any) => ({ value: p.id ?? p.value, label: p.full_name ?? p.label }))}
                          tumorRegistryEnabled={settings?.tumor_registry_enabled ?? false}
                          tumorRegistryAiEnabled={!!(settings?.tumor_registry_llm_profile_id)}
                        />
                      </div>
                    </Col>
                  </Row>

                  {surgicalCase?.patient_id && (
                    <CytoHistoCorrelationCard
                      surgicalCase={surgicalCase}
                      currentUser={user}
                      isLocked={isLocked && !isAddendumMode}
                    />
                  )}
                </Space>
              </Col>
              {/* ➡️ ฝั่งขวาของ Split: ประวัติ และ Preview (แสดงเฉพาะตอน "เปิด" Split Mode) */}
              {isSplitMode && (
                <Col xs={24} lg={10}>
                  <div
                    style={{
                      position: "sticky",
                      top: "100px",
                      height: "calc(100vh - 140px)",
                      overflowY: "auto",
                    }}
                  >
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      <StyledCard
                        title={
                          <span>
                            <FileTextOutlined /> Live Preview
                          </span>
                        }
                        size="small"
                        bodyStyle={{ padding: 0 }}
                      >
                        {pdfUrl ? (
                          <iframe
                            src={`${pdfUrl}#toolbar=0`}
                            width="100%"
                            height="600px"
                            style={{ border: "none" }}
                          />
                        ) : (
                          <div style={{ padding: 40, textAlign: "center" }}>
                            <Text type="secondary">No preview</Text>
                          </div>
                        )}
                      </StyledCard>
                    </Space>
                  </div>
                </Col>
              )}
            </Row>
          </Col>
        </Row>
      </PageContainer>
      <MicroscopicImageCaptureModal
        open={isMicroModalOpen}
        editingImage={editingImage}
        specimenId={targetSpecimenId}
        onClose={() => setIsMicroModalOpen(false)}
        onSuccess={() => {
          setIsMicroModalOpen(false);
          fetchMicroImages(); // โหลดรูปใหม่มาโชว์ใน Gallery ทันที
        }}
        specimens={surgicalCase?.specimens || []}
        onCaptureAndUpload={handleCaptureAndUpload}
      />
      <ReportPreviewModal
        open={isPreviewModalOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setIsPreviewModalOpen(false)}
      />

      {/* 🚩 Report Station Settings Modal */}
      <ReportStationSettingsModal
        open={isSettingsOpen}
        onCancel={() => setIsSettingsOpen(false)}
        isSplitMode={isSplitMode}
        diagnosisMode={diagnosisMode}
        isPatientInfoExpanded={isPatientInfoExpanded}
        showNavigator={showNavigatorPref}
        autoSave={isAutoSaveEnabled}
        autoSaveInterval={autoSaveInterval}
        editorFontSize={editorFontSize}
        showSpecimenCategory={showSpecimenCategory}
        onUpdatePreference={handleUpdatePreference}
      />

      {/* Entry History Drawer */}
      <Drawer
        title={
          <Space>
            <HistoryOutlined style={{ color: "#1890ff" }} />
            Entry History
            {allDiagnoses?.length > 0 && (
              <span style={{ fontSize: 12, color: "#8c8c8c", fontWeight: 400 }}>
                ({allDiagnoses.length}{" "}
                {allDiagnoses.length === 1 ? "entry" : "entries"})
              </span>
            )}
          </Space>
        }
        placement="right"
        width={520}
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        styles={{ body: { padding: "16px" } }}
      >
        <ReportHistorySection
          reports={allDiagnoses}
          specimens={surgicalCase?.specimens || []}
          reportSnapshots={completedReports}
          onSelect={(diagnosis) => {
            handleSelectDiagnosis(diagnosis);
            setIsHistoryOpen(false);
          }}
          showSpecimenName={settings?.show_specimen_name ?? true}
          diagnosisMode={diagnosisMode}
        />
      </Drawer>

      {/* Consult PDF Upload — auto-shown when case is dispatched to external lab */}
      <Modal
        open={consultPdfPopupOpen}
        title={
          <Space>
            <InboxOutlined style={{ color: "#722ed1" }} />
            <Typography.Text strong style={{ fontSize: 15, color: "#722ed1" }}>
              Out-Lab Consult
            </Typography.Text>
          </Space>
        }
        onCancel={() => setConsultPdfPopupOpen(false)}
        footer={null}
        width={surgicalCase?.consult_pdf_path ? 720 : 520}
        maskClosable={false}
      >
        {!surgicalCase?.consult_pdf_path ? (
          <>
            <Alert
              type="info"
              showIcon
              message="This case has been sent for external consultation. Please upload the consult report PDF."
              style={{ marginBottom: 16 }}
            />
            <div>
              <Typography.Text style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#8c8c8c" }}>
                Report Received Date / Time:
              </Typography.Text>
              <DatePicker
                showTime={{ format: "HH:mm" }}
                format="DD/MM/YYYY HH:mm"
                value={popupReceivedAt}
                onChange={(d) => d && setPopupReceivedAt(d)}
                style={{ width: "100%", marginBottom: 12 }}
              />
            </div>
            <Upload.Dragger
              accept="application/pdf"
              maxCount={1}
              beforeUpload={(file) => {
                if (file.size > 10 * 1024 * 1024) {
                  message.error("File must be under 10 MB");
                  return Upload.LIST_IGNORE;
                }
                setPopupUploadFile(file);
                return false;
              }}
              onRemove={() => setPopupUploadFile(null)}
              style={{ borderColor: "#d3adf7", background: "#f9f0ff" }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: "#722ed1" }} />
              </p>
              <p className="ant-upload-text" style={{ color: "#722ed1" }}>
                Click or drag PDF to upload
              </p>
              <p className="ant-upload-hint" style={{ fontSize: 11 }}>
                Max 10 MB · PDF only
              </p>
            </Upload.Dragger>
            {popupUploadFile && (
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={handlePopupUpload}
                loading={popupUploading}
                style={{ backgroundColor: "#722ed1", borderColor: "#722ed1", marginTop: 12 }}
                block
              >
                Upload Report PDF
              </Button>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", textAlign: "center", marginTop: 8 }}>
              A thumbnail of this PDF's first page and your sign-off will appear on the printed report's first page. The full consult PDF stays downloadable separately.
            </Typography.Text>
          </>
        ) : (
          <>
            <Alert
              type="success"
              showIcon
              message="Consult report PDF received."
              description="Review it below, then Sign Off to complete this consult round."
              style={{ marginBottom: 12 }}
            />
            {surgicalCase?.consult_pdf_approved_at && (
              <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                Approved by {surgicalCase.consult_pdf_approver_name || "—"} on{" "}
                {dayjs(surgicalCase.consult_pdf_approved_at).format("DD/MM/YYYY HH:mm")}
              </Typography.Text>
            )}
            <div
              style={{
                height: 420,
                background: "#f5f5f5",
                borderRadius: 8,
                border: "1px solid #d9d9d9",
                overflow: "hidden",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {consultPdfPreviewLoading ? (
                <Spin tip="Loading PDF..." />
              ) : consultPdfBlobUrl ? (
                <iframe
                  src={`${consultPdfBlobUrl}#toolbar=1&navpanes=0`}
                  width="100%"
                  height="100%"
                  style={{ border: "none" }}
                  title="Consult PDF Preview"
                />
              ) : (
                <Typography.Text type="secondary">Preview unavailable</Typography.Text>
              )}
            </div>
            <Space direction="vertical" style={{ width: "100%" }} size={8}>
              <Button
                type="primary"
                onClick={handleSignOffFromConsultPopup}
                disabled={isConsultFinalizeLocked}
                loading={consultApproving}
                style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
                block
              >
                Sign Off
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDeleteConsultPdf}
                loading={consultPdfDeleting}
                block
              >
                Delete PDF
              </Button>
            </Space>
          </>
        )}
      </Modal>

      {/* Case Already Signed Off popup */}
      <Modal
        open={completedCasePopupOpen}
        onCancel={() => setCompletedCasePopupOpen(false)}
        footer={null}
        width={1300}
        centered
        closable
        style={{ top: 20 }}
      >
        <Row gutter={24}>
          <Col span={10} style={{ borderRight: "1px solid #f0f0f0", paddingRight: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Patient / case header */}
            <div style={{ background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <Typography.Text strong style={{ fontSize: 15 }}>
                  {surgicalCase?.accession_no}
                </Typography.Text>
                <Tag color="green" style={{ margin: 0 }}>SIGNED</Tag>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {[surgicalCase?.patient?.title?.title, surgicalCase?.patient?.name, surgicalCase?.patient?.ln]
                  .filter(Boolean).join(" ") || "—"}
              </div>
              <div style={{ fontSize: 12, color: "#595959", marginTop: 2 }}>
                HN: {surgicalCase?.patient?.hn || surgicalCase?.hn || "—"}
              </div>
            </div>

            {surgicalCase?.is_out_lab_consult && surgicalCase?.consult_status === "pending" && (
              <Alert
                type="warning"
                showIcon
                message="Pending Out-Lab Consult Dispatch"
                description="This case was flagged for Out-Lab Consult but hasn't been sent to an external lab yet. Go to Out-Lab Consult → Send to Consult to dispatch it."
              />
            )}

            <div style={{ textAlign: "center" }}>
              <CheckCircleOutlined style={{ fontSize: 36, color: "#52c41a", marginBottom: 6 }} />
              <Typography.Title level={5} style={{ margin: "0 0 4px" }}>
                Case Already Signed Off
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                You are in view-only mode.
              </Typography.Text>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12 }}>
                <Button onClick={onBack}>Go Back</Button>
                <Button
                  type="primary"
                  icon={<FileAddOutlined />}
                  onClick={() => { setIsAddendumMode(true); setCompletedCasePopupOpen(false); }}
                >
                  Add New Report
                </Button>
              </div>
            </div>

            <Table<SurgicalReport>
              size="small"
              loading={completedReportsLoading}
              dataSource={completedReports}
              rowKey="id"
              pagination={false}
              scroll={{ y: 300 }}
              onRow={(record) => ({
                onClick: () => setSelectedReportId(record.id),
                style: {
                  cursor: "pointer",
                  background: record.id === selectedReportId ? "#e6f4ff" : undefined,
                },
              })}
              columns={[
                {
                  title: "Ver.",
                  dataIndex: "version_no",
                  width: 42,
                  render: (v: number) => <Typography.Text strong>v{v}</Typography.Text>,
                },
                {
                  title: "Type",
                  dataIndex: "report_type",
                  width: 82,
                  render: (t: string) => (
                    <Tag color={t === "Final" ? "blue" : t === "Addendum" ? "orange" : "purple"} style={{ margin: 0 }}>
                      {t}
                    </Tag>
                  ),
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  width: 90,
                  render: (s: string) => (
                    <Tag
                      color={s === "published" ? "green" : s === "pending_approval" ? "orange" : "default"}
                      style={{ margin: 0 }}
                    >
                      {s?.replace(/_/g, " ").toUpperCase()}
                    </Tag>
                  ),
                },
                {
                  title: "Pathologist",
                  dataIndex: "pathologist_name",
                  ellipsis: true,
                  render: (name: string) => (
                    <Typography.Text style={{ fontSize: 12 }}>{name || "—"}</Typography.Text>
                  ),
                },
                {
                  title: "Date",
                  dataIndex: "published_at",
                  width: 90,
                  render: (v: string, record) =>
                    (v || record.created_at)
                      ? dayjs(v || record.created_at).format("DD/MM/YY HH:mm")
                      : "-",
                },
                {
                  title: "",
                  key: "actions",
                  width: 36,
                  render: (_: unknown, record) =>
                    record.status === "draft" ? (
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        loading={deletingReportId === record.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraftReport(record.id);
                        }}
                      />
                    ) : null,
                },
              ]}
            />
          </Col>
          <Col span={14}>
            <div
              style={{
                height: "70vh",
                background: "#f5f5f5",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 8,
                border: "1px solid #d9d9d9",
                overflow: "hidden",
              }}
            >
              {completedPdfLoading ? (
                <Spin tip="Loading Report..." size="large" />
              ) : completedPdfUrl ? (
                <iframe
                  src={completedPdfUrl}
                  width="100%"
                  height="100%"
                  style={{ border: "none" }}
                  title="Signed Report Preview"
                />
              ) : (
                <div style={{ textAlign: "center", color: "#999" }}>
                  <FilePdfOutlined style={{ fontSize: 48, marginBottom: 8 }} />
                  <p>No Preview Available</p>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Modal>

      <FinalizeReportPage
        open={isFinalizeModalOpen}
        onCancel={() => setIsFinalizeModalOpen(false)}
        onConfirm={handleConfirmFinalize}
        onConfirmWithConsult={handleConfirmFinalizeWithConsult}
        onConfirmAndOutLab={handleConfirmAndOutLab}
        loading={loading}
        caseId={Number(surgicalCase?.id)}
        accessionNo={surgicalCase?.accession_no}
        initialData={{
          stain_quality: surgicalCase?.stain_quality || undefined,
          tissue_quality: surgicalCase?.tissue_quality || undefined,
          slide_quality: surgicalCase?.slide_quality || undefined,
          // Force the "provisional" toggle off when resolving a consult round —
          // the form field itself still holds the stale `true` set when the case
          // was originally dispatched to consult, so a plain `??` fallback here
          // would never kick in (the field is already non-nullish).
          is_pending: isConsultEditorLocked
            ? false
            : form.getFieldValue("is_pending") ?? !!surgicalCase?.is_pending,
          pending_reason:
            form.getFieldValue("pending_reason") ||
            surgicalCase?.pending_reason ||
            "",
        }}
        reportId={surgicalCase?.reports?.find(
          (r: SurgicalReport) => r.status === "draft"
        )?.id}
        pathologists={pathologists.map((p: any) => ({ value: p.id ?? p.value, label: p.full_name ?? p.label }))}
        currentUserId={user?.id}
        senderName={user?.full_name}
      />
      <AIGeneratePreviewModal
        open={aiModalOpen}
        fetchPreview={fetchAIPreview}
        confirming={isAIGenerating}
        onConfirm={handleAIConfirm}
        onCancel={() => setAiModalOpen(false)}
      />
    </Form>
  );
};

export default SurgicalReportForm;

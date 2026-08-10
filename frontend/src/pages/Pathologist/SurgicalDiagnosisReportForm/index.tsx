import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
} from "antd";
import {
  FileTextOutlined,
  MedicineBoxOutlined,
  ReloadOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
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
import ConsultPdfModal from "./components/ConsultPdfModal";
import CompletedCaseModal from "./components/CompletedCaseModal";
import CytoHistoCorrelationCard from "./components/CytoHistoCorrelationCard";
import SurgicalReportNavigator from "./components/SurgicalReportNavigator";
import styles from "../../../styles/LayoutWidget.module.css";
import StyledCard from "../../../components/Layout/StyledCard";
import UserService, { UserPreferences } from "../../../services/userService";
import SurgicalReportService from "../../../services/surgicalReportService";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import NotificationRuleService from "../../../services/notificationRuleService";
import ReportGenerationService from "../../../services/reportGenerationService";
import type { ReportGenRequest } from "../../../services/reportGenerationService";
import AIGeneratePreviewModal from "./components/AIGeneratePreviewModal";
import { useAuth } from "../../../hooks/useAuth";
import logger from "../../../utils/logger";
import type { User } from "../../../types/user";
import { oversizeMessage } from "../../../utils/imageUpload";
import { MAX_IMAGE_UPLOAD_BYTES } from "../../../constants/upload.constants";
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

// Report-station display preferences, always resolved to a concrete value
// (unlike UserPreferences, whose fields are optional partial-update inputs)
type DisplayPreferences = Required<
  Pick<
    UserPreferences,
    | "is_split_mode"
    | "patient_info_expanded"
    | "show_navigator"
    | "auto_save"
    | "auto_save_interval"
    | "editor_font_size"
    | "show_specimen_category"
  >
>;

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
  const consultPdfPopupShownRef = useRef(false);

  const [completedCasePopupOpen, setCompletedCasePopupOpen] = useState(false);
  const completedCasePopupShownRef = useRef(false);
  const [isAddendumMode, setIsAddendumMode] = useState(false);
  const [completedReports, setCompletedReports] = useState<SurgicalReport[]>([]);
  const [completedReportsLoading, setCompletedReportsLoading] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

const handleOpenFinalizeModal = async () => {
    await handleSave();

    // Check for empty diagnoses before opening finalize modal
    const isCombined = diagnosisMode === "integrated" || diagnosisMode === "clean";
    if (isCombined) {
      const caseText = (form.getFieldValue("case_diagnosis_text") || "").trim();
      if (!caseText) {
        Modal.confirm({
          title: "Diagnosis is still empty",
          icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
          content: "The combined diagnosis hasn't been filled in. Continue to Sign Off anyway?",
          okText: "Continue to Sign Off",
          cancelText: "Cancel",
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
          title: "Diagnosis is incomplete",
          icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
          content: (
            <span>
              The following specimens don't have a diagnosis yet:{" "}
              <strong>{labels}</strong>
              <br />
              Continue to Sign Off anyway?
            </span>
          ),
          okText: "Continue to Sign Off",
          cancelText: "Cancel",
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

  // Flag the case for out-lab consult straight from the Case Actions panel,
  // without signing the report off (the Finalize page's Out-Lab button does both).
  // The form fields are kept in sync because prepareBulkSavePayload sends
  // is_out_lab_consult/consult_reason on every draft save — a stale `false` there
  // would silently clear the flag we just set.
  const handleRequestOutLabConsult = async (reason: string) => {
    if (!surgicalCase?.id) return;
    try {
      const state = await SurgicalCaseService.requestOutLabConsult(
        Number(surgicalCase.id),
        reason,
      );
      form.setFieldsValue({ is_out_lab_consult: true, consult_reason: reason });
      setSurgicalCase((prev) =>
        prev
          ? {
              ...prev,
              is_out_lab_consult: state.is_out_lab_consult,
              consult_status: state.consult_status ?? "pending",
              consult_reason: state.consult_reason ?? reason,
            }
          : prev,
      );
      NotificationRuleService.triggerEvent("outlab_consult", {
        id_case: surgicalCase.accession_no ?? String(surgicalCase.id),
        accession_no: surgicalCase.accession_no ?? "",
        sender: user?.full_name ?? "-",
        lab_name: "-",
      }).catch(() => {});
      message.success("Case queued for Out-Lab Consult");
    } catch (error: unknown) {
      logger.error("Failed to flag case for out-lab consult", error);
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || "Failed to flag case for Out-Lab Consult");
      throw error;
    }
  };

  const handleCancelOutLabConsult = async () => {
    if (!surgicalCase?.id) return;
    try {
      await SurgicalCaseService.cancelOutLabConsult(Number(surgicalCase.id));
      form.setFieldsValue({ is_out_lab_consult: false, consult_reason: "" });
      setSurgicalCase((prev) =>
        prev
          ? { ...prev, is_out_lab_consult: false, consult_status: "", consult_reason: null }
          : prev,
      );
      message.success("Out-Lab Consult flag removed");
    } catch (error: unknown) {
      logger.error("Failed to clear out-lab consult flag", error);
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || "Failed to remove Out-Lab Consult flag");
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

  // Report-station display preferences, initialized from user.preferences
  const [prefs, setPrefs] = useState<DisplayPreferences>({
    is_split_mode: user?.preferences?.is_split_mode ?? false,
    patient_info_expanded: user?.preferences?.patient_info_expanded ?? true,
    show_navigator: user?.preferences?.show_navigator ?? true,
    auto_save: user?.preferences?.auto_save ?? true,
    auto_save_interval: user?.preferences?.auto_save_interval ?? 45,
    editor_font_size: user?.preferences?.editor_font_size ?? "medium",
    show_specimen_category: user?.preferences?.show_specimen_category ?? true,
  });

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

  const pathologistOptions = useMemo(
    () => pathologists.map((p) => ({ value: p.id, label: p.full_name || "" })),
    [pathologists],
  );

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
      if (!isHistoryOpen) setCompletedReports([]);
      return;
    }
    setCompletedReportsLoading(true);
    SurgicalReportService.getReportHistory(Number(surgicalCase.id))
      .then((data) => setCompletedReports(data.items))
      .catch(() => {})
      .finally(() => setCompletedReportsLoading(false));
  }, [completedCasePopupOpen, isHistoryOpen, surgicalCase?.id, historyRefreshKey]);

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
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { detail?: string } } };
        message.error(axiosErr?.response?.data?.detail || "AI generation failed");
      } finally {
        setIsAIGenerating(false);
      }
    },
    [surgicalCase, buildAIPayload, form],
  );

  // ── Auto-save on configurable interval when there are unsaved changes ──
  useEffect(() => {
    if (isEditorLocked || !prefs.auto_save) return;
    autoSaveRef.current = setInterval(() => {
      setIsDirty((dirty) => {
        if (dirty) handleSave();
        return dirty;
      });
    }, prefs.auto_save_interval * 1_000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [isEditorLocked, prefs.auto_save, prefs.auto_save_interval, handleSave]);

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

  const fetchMicroImages = async () => {
    if (!caseId) return;

    try {
      const data = await MicroscopicImageService.getImagesByCaseId(caseId);
      setMicroImages(data);
    } catch (error) {
      logger.error("Failed to fetch micro images:", error);
      message.error("Failed to load Microscopic images");
    }
  };

  const fetchWsiSlides = async () => {
    if (!caseId) return;
    try {
      const slides = await WsiSettingService.getCaseSlides(Number(caseId));
      setWsiSlides(slides);
    } catch { /* silent — no WSI slides to show */ }
  };

  useEffect(() => {
    if (caseId) {
      fetchMicroImages();
      fetchWsiSlides();
    }
  }, [caseId]);

  const handleRefreshMicroImages = () => {
    fetchMicroImages();
  };

  const handleOpenMicroCapture = (specimenId: number) => {
    setTargetSpecimenId(specimenId);
    setIsMicroModalOpen(true);
  };

  const handleEditMicroImage = (image: MicroscopicImage) => {
    setEditingImage(image);
    setTargetSpecimenId(image.specimen_id);
    setIsMicroModalOpen(true);
  };

  const handleCaptureAndUpload = async (
    imageSrc: string,
    specimenId: number,
    metadata: Pick<MicroscopicImage, "magnification" | "stain" | "description">,
  ) => {
    try {
      if (editingImage) {
        await MicroscopicImageService.updateImage(editingImage.id, {
          magnification: metadata.magnification,
          stain: metadata.stain,
          description: metadata.description,
        });
        message.success("Image info updated successfully");
      } else {
        const response = await fetch(imageSrc);
        const blob = await response.blob();

        if (blob.size > MAX_IMAGE_UPLOAD_BYTES) {
          message.error(oversizeMessage(blob.size));
          return;
        }

        // Timestamp keeps generated filenames unique in the UI
        const timestamp = new Date()
          .toISOString()
          .replace(/[-:T.]/g, "")
          .slice(8, 14); // HHmmss
        const fileName = `micro_${specimenId}_${timestamp}.jpg`;

        const file = new File([blob], fileName, { type: "image/jpeg" });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("magnification", metadata.magnification);
        formData.append("stain", metadata.stain);
        formData.append("description", metadata.description || "");

        await MicroscopicImageService.uploadImage(specimenId, formData);
        message.success("Image uploaded successfully");
      }

      fetchMicroImages();
      setIsMicroModalOpen(false);
      setEditingImage(null);
    } catch (error) {
      message.error("Operation failed");
      logger.error(error);
    }
  };

  if (loading && !surgicalCase) {
    return (
      <div style={{ textAlign: "center", padding: "100px" }}>
        <Spin size="large" tip="Loading data..." />
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

  // Side navigator shows when the sidebar is collapsed (side layout only)
  const showNavigator = isSideLayout ? isSidebarCollapsed : true;

  // Horizontal top-bar anchor shows instead, to save vertical space, when the
  // sidebar is expanded — the side navigator already covers that case otherwise
  const showTopAnchor = isSideLayout ? !isSidebarCollapsed : false;

  const handleUpdatePreference = async (newPrefs: UserPreferences) => {
    try {
      // Optimistic UI update
      setPrefs((p) => ({
        is_split_mode: newPrefs.is_split_mode ?? p.is_split_mode,
        patient_info_expanded: newPrefs.patient_info_expanded ?? p.patient_info_expanded,
        show_navigator: newPrefs.show_navigator ?? p.show_navigator,
        auto_save: newPrefs.auto_save ?? p.auto_save,
        auto_save_interval: newPrefs.auto_save_interval ?? p.auto_save_interval,
        editor_font_size: newPrefs.editor_font_size ?? p.editor_font_size,
        show_specimen_category: newPrefs.show_specimen_category ?? p.show_specimen_category,
      }));
      if (newPrefs.default_diagnosis_mode !== undefined) {
        setDiagnosisMode(
          newPrefs.default_diagnosis_mode as
            | "individual"
            | "integrated"
            | "clean",
        );
      }

      await UserService.updateMyPreferences(newPrefs);

      const currentUserStr = localStorage.getItem("user");
      if (currentUserStr) {
        const currentUserData = JSON.parse(currentUserStr);
        currentUserData.preferences = {
          ...currentUserData.preferences,
          ...newPrefs,
        };
        localStorage.setItem("user", JSON.stringify(currentUserData));
        updateUser(currentUserData);
      }
    } catch (error) {
      logger.error("Failed to update preferences:", error);
      message.error("Failed to save settings");
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
        isSplitMode={prefs.is_split_mode}
        onToggleSplitMode={() =>
          setPrefs((p) => ({ ...p, is_split_mode: !p.is_split_mode }))
        }
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
          {showNavigator && prefs.show_navigator && (
            <SurgicalReportNavigator isDarkMode={isDarkMode} />
          )}
          <Col flex="auto" style={{ minWidth: 0 }}>
            <Row gutter={[24, 24]}>
              <Col xs={24} lg={prefs.is_split_mode ? 14 : 24}>
                <Space
                  direction="vertical"
                  size={16}
                  style={{ display: "flex" }}
                >
                  <div id="patient-info">
                    <PatientInfoCard
                      activeCase={surgicalCase}
                      activeCaseType="surgical"
                      isExpanded={prefs.patient_info_expanded}
                      onToggle={(state) =>
                        handleUpdatePreference({ patient_info_expanded: state })
                      }
                    />
                  </div>

                  {/* Clinical Info and Specimen Manager - 2 Columns (50/50) or Stacked in Split Mode */}
                  <Row gutter={[16, 16]} align="stretch">
                    <Col xs={24} lg={prefs.is_split_mode ? 24 : 10}>
                      <div id="clinical-info" style={{ height: "100%" }}>
                        <ClinicalInfoSection
                          name="clinical_diagnosis"
                          rows={4}
                          label="Clinical Diagnosis"
                        />
                      </div>
                    </Col>
                    <Col xs={24} lg={prefs.is_split_mode ? 24 : 14}>
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
                          showSpecimenCategory={prefs.show_specimen_category}
                        />
                      </div>
                    </Col>
                  </Row>

                  <WsiSlidesSection caseId={Number(caseId)} />

                  <StyledCard
                    id="diagnostic-station"
                    // padding: 0 lets ReportMasterControl sit flush against the card edge
                    bodyStyle={{ padding: 0 }}
                    style={{
                      // clips content to StyledCard's 20px rounded corners
                      overflow: "hidden",
                      scrollMarginTop: "100px",
                    }}
                  >
                    <ReportMasterControl
                      reports={allDiagnoses || []}
                      diagnosisMode={diagnosisMode}
                      setDiagnosisMode={setDiagnosisMode}
                      isLocked={isEditorLocked}
                      hasOriginalSigned={hasOriginalSigned}
                      specimens={surgicalCase?.specimens || []}
                      showSpecimenName={settings?.show_specimen_name}
                    />

                    {(diagnosisMode === "integrated" ||
                      diagnosisMode === "clean") && (
                      <div
                        style={{
                          padding: "16px",
                          borderBottom: "1px solid #f0f0f0",
                          // subtle background tint per mode so the pathologist doesn't confuse the two
                          background:
                            diagnosisMode === "clean" ? "#f6ffed" : "#f0f7ff",
                        }}
                      >
                        <IntegratedCaseDiagnosisEditor
                          surgicalCase={surgicalCase}
                          isLocked={isEditorLocked}
                          diagnosisMode={diagnosisMode}
                          onAIGenerate={handleAIGenerate}
                          isAIGenerating={isAIGenerating}
                        />
                      </div>
                    )}

                    <div
                      className="workblocks-container"
                      style={{ fontSize: EDITOR_FONT_SIZE_MAP[prefs.editor_font_size], ["--editor-font-size" as string]: EDITOR_FONT_SIZE_MAP[prefs.editor_font_size] } as React.CSSProperties}
                    >
                      {surgicalCase?.specimens?.map((spec, index: number) => (
                        <SpecimenIntegratedWorkblock
                          key={spec.id}
                          specimen={spec}
                          surgicalCase={surgicalCase}
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
                          caseId={Number(caseId)}
                          reportId={surgicalCase?.reports?.find(
                            (r: SurgicalReport) => ["draft", "pending", "pending_approval"].includes(r.status)
                          )?.id}
                          currentUserId={user?.id}
                          pathologists={pathologistOptions}
                          tumorRegistryEnabled={settings?.tumor_registry_enabled ?? false}
                          tumorRegistryAiEnabled={!!(settings?.tumor_registry_llm_profile_id)}
                          isOutLabConsult={!!surgicalCase?.is_out_lab_consult}
                          consultStatus={surgicalCase?.consult_status}
                          consultReason={surgicalCase?.consult_reason}
                          onRequestOutLabConsult={handleRequestOutLabConsult}
                          onCancelOutLabConsult={handleCancelOutLabConsult}
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
              {prefs.is_split_mode && (
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
          fetchMicroImages();
        }}
        specimens={surgicalCase?.specimens || []}
        onCaptureAndUpload={handleCaptureAndUpload}
      />
      <ReportPreviewModal
        open={isPreviewModalOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setIsPreviewModalOpen(false)}
      />

      <ReportStationSettingsModal
        open={isSettingsOpen}
        onCancel={() => setIsSettingsOpen(false)}
        isSplitMode={prefs.is_split_mode}
        diagnosisMode={diagnosisMode}
        isPatientInfoExpanded={prefs.patient_info_expanded}
        showNavigator={prefs.show_navigator}
        autoSave={prefs.auto_save}
        autoSaveInterval={prefs.auto_save_interval}
        editorFontSize={prefs.editor_font_size}
        showSpecimenCategory={prefs.show_specimen_category}
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
      <ConsultPdfModal
        open={consultPdfPopupOpen}
        onClose={() => setConsultPdfPopupOpen(false)}
        caseId={caseId}
        consultPdfPath={surgicalCase?.consult_pdf_path}
        consultPdfApprovedAt={surgicalCase?.consult_pdf_approved_at}
        consultPdfApproverName={surgicalCase?.consult_pdf_approver_name}
        isConsultFinalizeLocked={isConsultFinalizeLocked}
        onRefresh={refresh}
        onSignedOff={handleOpenFinalizeModal}
      />

      {/* Case Already Signed Off popup */}
      <CompletedCaseModal
        open={completedCasePopupOpen}
        onClose={() => setCompletedCasePopupOpen(false)}
        surgicalCase={surgicalCase}
        reports={completedReports}
        reportsLoading={completedReportsLoading}
        onBack={onBack}
        onAddendum={() => {
          setIsAddendumMode(true);
          setCompletedCasePopupOpen(false);
        }}
        onReportsChanged={() => setHistoryRefreshKey((k) => k + 1)}
      />
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
        pathologists={pathologistOptions}
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

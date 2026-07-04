import React, { useEffect, useState, useMemo, useRef } from "react";
import { sanitizeHtml } from "../../utils/sanitize";
import {
  Form,
  Input,
  Select,
  Button,
  Descriptions,
  Tag,
  Space,
  message,
  Spin,
  Alert,
  Typography,
  Row,
  Col,
  Checkbox,
  Badge,
  Tooltip,
  Switch,
  Modal,
  Drawer,
  Table,
} from "antd";
import {
  SaveOutlined,
  ArrowLeftOutlined,
  EditOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  LockOutlined,
  WarningOutlined,
  CameraOutlined,
  DeleteOutlined,
  PlusOutlined,
  ExperimentOutlined,
  EyeOutlined,
  PictureOutlined,
  FilePdfOutlined,
  ClockCircleOutlined,
  FileAddOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NotificationRuleService from "../../services/notificationRuleService";
import NongyneReportService from "../../services/nongyneReportService";
import NongyneCaseImageService, {
  NongyneCaseImage,
} from "../../services/nongyneCaseImageService";
import { API_BASE_URL } from "../../services/httpClient";
import SystemSettingService from "../../services/systemSettingService";
import ApprovalService from "../../services/approvalService";
import UserService from "../../services/userService";
import { NongyneDiagnosisResponse } from "../../types/nongyneDiagnosis";
import { NongyneCytologyCase } from "../../types/nongyne";
import { SystemSetting } from "../../types/system";
import { User } from "../../types/user";
import type { BadgeProps } from "antd";
import PatientInfoCard from "../../components/PatientInfoCard";
import PageContainer from "../../components/Layout/PageContainer";
import StyledCard from "../../components/Layout/StyledCard";
import ReportPreviewModal from "../../components/ReportPreviewModal";
import GynePathologistDiagnosisManager from "../GyneCytoDiagnosis/components/GynePathologistDiagnosisManager";
import ConsultRequestModal from "../../components/InternalConsult/ConsultRequestModal";
import ConsultHistorySection from "../../components/InternalConsult/ConsultHistorySection";
import NongyneIHCResultPanel from "./components/NongyneIHCResultPanel";
import NongyneCytologyImageCaptureModal from "./components/NongyneCytologyImageCaptureModal";
import logger from "../../utils/logger";
import SecureImage from "../../components/SecureImage";
import CytoCorrelationManager from "../../components/CytoCorrelationManager";
import SimpleTiptapEditor from "../../components/Editors/SimpleTiptapEditor";
import DiagnosticTemplateSystem from "../Pathologist/SurgicalDiagnosticTemplate/DiagnosticTemplateSystem";
import GrossTemplateSystem from "../Gross/components/GrossTemplateSystem";
import NongyneSignOffPage from "./components/NongyneSignOffPage";
import { getConsultLockState } from "../Pathologist/utils/consultLockState";

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  caseId?: string | number;
  onBack?: () => void;
}

const CASE_STATUS_CONFIG: Record<
  string,
  { color: string; label: string; badgeStatus: BadgeProps["status"] }
> = {
  registered: { color: "default", label: "Registered", badgeStatus: "default" },
  pending: { color: "default", label: "Pending", badgeStatus: "default" },
  in_progress: {
    color: "processing",
    label: "In Progress",
    badgeStatus: "processing",
  },
  screened: { color: "blue", label: "Screened", badgeStatus: "processing" },
  pending_approval: {
    color: "warning",
    label: "Pending Approval",
    badgeStatus: "warning",
  },
  reported: { color: "success", label: "Reported", badgeStatus: "success" },
  published: { color: "success", label: "Published", badgeStatus: "success" },
  cancelled: { color: "error", label: "Cancelled", badgeStatus: "error" },
};

const SPECIMEN_TYPES = [
  "Fluid",
  "Urine",
  "Sputum",
  "CSF",
  "FNA",
  "Brushing",
  "Washing",
  "Other",
];

const SPECIMEN_COLOR: Record<string, string> = {
  FNA: "purple",
  Fluid: "blue",
  Urine: "gold",
  Sputum: "cyan",
  CSF: "geekblue",
  Brushing: "lime",
  Washing: "teal",
  Other: "default",
};

const PathologistNongyneDiagnosisPage: React.FC<Props> = ({
  caseId: propsCaseId,
  onBack,
}) => {
  const caseId = propsCaseId;
  const [form] = Form.useForm();

  const [isPatientInfoExpanded, setIsPatientInfoExpanded] = useState(false);
  const [caseData, setCaseData] = useState<NongyneCytologyCase | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSetting | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [diagnosis, setDiagnosis] = useState<NongyneDiagnosisResponse | null>(
    null,
  );
  const [prevDiagnosis, setPrevDiagnosis] =
    useState<NongyneDiagnosisResponse | null>(null);
  const [isAddendumMode, setIsAddendumMode] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const [images, setImages] = useState<NongyneCaseImage[]>([]);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<NongyneCaseImage | null>(
    null,
  );
  const [descMap, setDescMap] = useState<Record<number, string>>({});
  const [slideQualityModalOpen, setSlideQualityModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [consultHistoryKey, setConsultHistoryKey] = useState(0);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [grossTemplateDrawerOpen, setGrossTemplateDrawerOpen] = useState(false);
  const completedCasePopupShownRef = useRef(false);
  const [completedCasePopupOpen, setCompletedCasePopupOpen] = useState(false);
  const [completedReports, setCompletedReports] = useState<any[]>([]);
  const [completedReportsLoading, setCompletedReportsLoading] = useState(false);
  const [selectedPopupReportId, setSelectedPopupReportId] = useState<
    number | null
  >(null);
  const [popupPdfUrl, setPopupPdfUrl] = useState<string | null>(null);
  const [popupPdfLoading, setPopupPdfLoading] = useState(false);

  const SIGNERS_PATH = useMemo(() => ["signers"], []);

  const defaultSigners = useMemo(() => {
    const signers: {
      user_id: number;
      role: string;
      signed_at: string | null;
    }[] = [];
    const cytoId =
      caseData?.cytotechnologist?.id || caseData?.cytotechnologist_id;
    const pathoId = caseData?.pathologist?.id || caseData?.pathologist_id;
    if (cytoId)
      signers.push({
        user_id: cytoId,
        role: "cytotechnologist",
        signed_at: null,
      });
    if (pathoId)
      signers.push({ user_id: pathoId, role: "primary", signed_at: null });
    return signers;
  }, [caseData]);

  const handleToggleOutLabConsult = async (checked: boolean) => {
    if (!caseId) return;
    try {
      await NongyneCytologyCaseService.update(Number(caseId), {
        is_out_lab_consult: checked,
      });
      setCaseData((prev) => ({ ...prev, is_out_lab_consult: checked }));
      message.success("Out-Lab Consult status updated.");
      if (checked) {
        NotificationRuleService.triggerEvent("outlab_consult", {
          id_case: caseData?.accession_no ?? String(caseId),
          accession_no: caseData?.accession_no ?? "",
          sender: currentUser?.full_name ?? "-",
          lab_name: "-",
        }).catch(() => {});
      }
    } catch {
      message.error("Failed to update Out-Lab Consult status.");
    }
  };

  const handleToggleCellBlock = async (checked: boolean) => {
    if (!caseId) return;
    try {
      const payload: import("../../types/nongyne").NongyneCytologyCaseUpdate = {
        is_cell_block: checked,
        ...(checked
          ? {
              cell_block_prepared_at: new Date().toISOString(),
              cell_block_prepared_by_id: currentUser?.id,
              cell_block_status: "pending" as const,
            }
          : {
              cell_block_prepared_at: undefined,
              cell_block_prepared_by_id: undefined,
              cell_block_status: undefined,
            }),
      };
      await NongyneCytologyCaseService.update(Number(caseId), payload);
      setCaseData((prev) => ({ ...prev, ...payload }) as NongyneCytologyCase);
      message.success(
        checked
          ? "Cell block marked as prepared."
          : "Cell block preparation cleared.",
      );
    } catch {
      message.error("Failed to update cell block status.");
    }
  };

  const fetchImages = () => {
    if (!caseId) return;
    NongyneCaseImageService.getImages(Number(caseId))
      .then((imgs) => {
        setImages(imgs);
        setDescMap(
          Object.fromEntries(imgs.map((i) => [i.id, i.description ?? ""])),
        );
      })
      .catch((e) => logger.error(e));
  };

  const saveDesc = async (imgId: number) => {
    await NongyneCaseImageService.update(imgId, {
      description: descMap[imgId] ?? "",
    });
  };

  useEffect(() => {
    if (!caseId) return;
    Promise.all([
      NongyneCytologyCaseService.getById(Number(caseId)),
      SystemSettingService.getSettings(),
      UserService.getUsers(),
      UserService.getCurrentUser(),
    ])
      .then(([caseRes, settings, users, me]) => {
        setCaseData(caseRes);
        setSystemSettings(settings);
        setAllUsers(users);
        setCurrentUser(me);
        form.setFieldsValue({
          clinical_history: caseRes.clinical_history,
          specimen_type: caseRes.specimen_type,
          collection_site: caseRes.collection_site,
          received_volume_ml: caseRes.received_volume_ml,
        });
      })
      .catch((e) => logger.error(e));
    fetchImages();
    NongyneReportService.getReportsByCase(Number(caseId))
      .then((reports) => {
        const active = reports.find((r: any) =>
          ["pending_approval", "published"].includes(r.status),
        );
        setActiveReportId((active as any)?.id ?? null);
      })
      .catch((e) => logger.error(e));
  }, [caseId]);

  useEffect(() => {
    const current = form.getFieldValue("signers");
    if ((!current || current.length === 0) && defaultSigners.length > 0)
      form.setFieldValue("signers", defaultSigners);
  }, [loading, diagnosis, caseData, defaultSigners, form]);

  const fetchDiagnosis = async (skipFormFill = false) => {
    if (!caseId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await NongyneDiagnosisService.getByCaseId(Number(caseId));
      if (data?.length > 0) {
        setDiagnosis(data[0]);
        if (!skipFormFill) form.setFieldsValue(data[0]);
      } else {
        setDiagnosis(null);
      }
    } catch {
      message.error("Failed to load diagnosis data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnosis();
  }, [caseId, form]);

  const isFinalized = useMemo(
    () =>
      ["reported", "pending_approval", "published"].includes(
        caseData?.status ?? "",
      ),
    [caseData],
  );
  const { isConsultEditorLocked, isConsultFinalizeLocked, isEditorLocked, isFinalizeLocked } =
    getConsultLockState({
      isLocked: isFinalized && !isAddendumMode,
      isAddendumMode,
      isAwaitingApproval: false,
      isOutLabConsult: !!caseData?.is_out_lab_consult,
      consultStatus: caseData?.consult_status,
      consultPdfPath: caseData?.consult_pdf_path,
    });
  const isFormMode = !diagnosis || isAddendumMode || !isFinalized || isConsultEditorLocked;

  // Auto-show popup when entering a finalized case — suppressed while a
  // consult round is actively awaiting the pathologist's attention, so it
  // doesn't cover up the now-reachable Sign-off button (mirrors the same
  // fix applied to Surgical's equivalent popup).
  useEffect(() => {
    if (caseData && isFinalized && !isConsultEditorLocked && !completedCasePopupShownRef.current) {
      completedCasePopupShownRef.current = true;
      setCompletedCasePopupOpen(true);
    }
  }, [caseData?.id, caseData?.status, isFinalized, isConsultEditorLocked]);

  // Load report history when popup opens
  useEffect(() => {
    if (!completedCasePopupOpen || !caseId) return;
    setCompletedReportsLoading(true);
    NongyneReportService.getReportsByCase(Number(caseId))
      .then((reports) => {
        setCompletedReports(reports);
        const first = (reports as any[])[0];
        if (first) setSelectedPopupReportId(first.id);
      })
      .catch(() => {})
      .finally(() => setCompletedReportsLoading(false));
  }, [completedCasePopupOpen, caseId]);

  // Load PDF for selected report in popup
  useEffect(() => {
    if (!selectedPopupReportId) {
      setPopupPdfUrl(null);
      return;
    }
    setPopupPdfLoading(true);
    NongyneReportService.getReportPdf(selectedPopupReportId)
      .then((blob) => {
        setPopupPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })
      .catch(() => {})
      .finally(() => setPopupPdfLoading(false));
  }, [selectedPopupReportId]);

  const onFinish = async (values: any) => {
    try {
      setSubmitting(true);
      const {
        clinical_history,
        specimen_type,
        collection_site,
        received_volume_ml,
        signers: _signers,
        ...diagnosisValues
      } = values;

      await NongyneCytologyCaseService.update(Number(caseId), {
        clinical_history: clinical_history ?? null,
        specimen_type,
        collection_site: collection_site ?? null,
        received_volume_ml: received_volume_ml ?? null,
      });
      setCaseData((prev) => ({
        ...prev,
        clinical_history,
        specimen_type,
        collection_site,
        received_volume_ml,
      }));

      if (diagnosis && !isAddendumMode) {
        await NongyneDiagnosisService.update(diagnosis.id, { ...diagnosisValues, signers: _signers });
        message.success("Draft saved.");
        fetchDiagnosis();
      } else {
        await NongyneDiagnosisService.create({
          ...diagnosisValues,
          case_id: Number(caseId),
          ...(isAddendumMode && prevDiagnosis
            ? {
                diagnosis_order: (prevDiagnosis.diagnosis_order ?? 1) + 1,
                entry_type: "Addendum",
              }
            : {}),
        });
        message.success("Draft saved.");
        fetchDiagnosis(true);
      }
    } catch (err) {
      logger.error(err);
      message.error("Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNewReport = () => {
    setPrevDiagnosis(diagnosis);
    setIsAddendumMode(true);
    setCompletedCasePopupOpen(false);
    setDiagnosis(null);
    form.resetFields();
    form.setFieldsValue({
      clinical_history: caseData?.clinical_history,
      specimen_type: caseData?.specimen_type,
      collection_site: caseData?.collection_site,
      received_volume_ml: caseData?.received_volume_ml,
      gross_description: diagnosis?.gross_description ?? "",
      microscopic_description: diagnosis?.microscopic_description ?? "",
      diagnosis: diagnosis?.diagnosis ?? "",
      comment: diagnosis?.comment ?? "",
    });
  };

  const handleFinalizeClick = () => {
    setSlideQualityModalOpen(true);
  };

  const finalizeCore = async (
    slideQuality: string | null,
    stainQuality: string | null,
    isCasePending: boolean,
    pendingReason: string,
    outLab?: { reason: string },
  ) => {
    if (!diagnosis) return;
    try {
      setSubmitting(true);
      const requireApproval =
        systemSettings?.enable_non_gyne_approve_system ?? true;
      const clinical_history = form.getFieldValue("clinical_history");
      const now = new Date().toISOString();

      const rawSigners: {
        user_id: number;
        role: string;
        signed_at: string | null;
      }[] = form.getFieldValue("signers") || [];
      const updatedSigners = rawSigners.map((s) =>
        Number(s.user_id) === Number(currentUser?.id)
          ? { ...s, signed_at: now }
          : s,
      );
      form.setFieldValue("signers", updatedSigners);

      await NongyneCytologyCaseService.update(Number(caseId), {
        clinical_history: clinical_history ?? null,
        slide_quality: slideQuality ?? undefined,
        stain_quality: stainQuality ?? undefined,
      });
      setCaseData((prev) =>
        prev
          ? {
              ...prev,
              clinical_history: clinical_history ?? null,
              slide_quality: slideQuality ?? undefined,
              stain_quality: stainQuality ?? undefined,
            }
          : prev,
      );

      await NongyneDiagnosisService.update(diagnosis.id, { status: "signed" });

      const publishedReport = (await NongyneReportService.publishReport(
        Number(caseId),
        updatedSigners,
        isCasePending,
        isCasePending ? pendingReason : undefined,
        outLab ? true : undefined,
        outLab?.reason,
      )) as { id: number };

      if (outLab) {
        message.success("Report signed off — flagged for Out-Lab Consult");
      } else if (!requireApproval) {
        await ApprovalService.processDecision(
          publishedReport.id,
          {
            action: "APPROVED",
            comment: "Auto-approved (approval not required)",
          },
          "nongyne",
        );
        message.success("Report finalized and published.");
      } else {
        message.success("Report submitted for approval.");
      }

      fetchDiagnosis();
      if (onBack) setTimeout(onBack, 800);
    } catch (err) {
      logger.error(err);
      message.error("Failed to finalize report.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = (
    slideQuality: string | null,
    stainQuality: string | null,
    isCasePending: boolean,
    pendingReason: string,
  ) => finalizeCore(slideQuality, stainQuality, isCasePending, pendingReason);

  const handleOutLabConsult = (
    reason: string,
    slideQuality: string,
    stainQuality: string,
  ) =>
    finalizeCore(
      slideQuality,
      stainQuality,
      true,
      "Out-Lab Consult — awaiting results",
      { reason },
    );

  const handlePreviewPdf = async () => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();
      const {
        clinical_history,
        specimen_type,
        collection_site,
        received_volume_ml,
        signers: _s,
        ...diagnosisValues
      } = values;
      await NongyneCytologyCaseService.update(Number(caseId), {
        clinical_history: clinical_history ?? null,
        specimen_type,
        collection_site: collection_site ?? null,
        received_volume_ml: received_volume_ml ?? null,
      });
      if (diagnosis) {
        await NongyneDiagnosisService.update(diagnosis.id, diagnosisValues);
      } else {
        await NongyneDiagnosisService.create({
          ...diagnosisValues,
          case_id: Number(caseId),
          ...(isAddendumMode && prevDiagnosis
            ? {
                diagnosis_order: (prevDiagnosis.diagnosis_order ?? 1) + 1,
                entry_type: "Addendum",
              }
            : {}),
        });
      }
      const blob = await NongyneDiagnosisService.previewReportPdf(
        Number(caseId),
      );
      setPreviewPdfUrl(window.URL.createObjectURL(blob));
      setIsPreviewModalVisible(true);
    } catch {
      message.error("Failed to generate PDF preview.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewFinalPdf = async () => {
    if (!diagnosis) return;
    try {
      setLoading(true);
      const blob = await NongyneDiagnosisService.getReportPdf(diagnosis.id);
      setPreviewPdfUrl(window.URL.createObjectURL(blob));
      setIsPreviewModalVisible(true);
    } catch {
      message.error("Failed to load report PDF.");
    } finally {
      setLoading(false);
    }
  };

  const caseStatus = caseData?.status ?? "";
  const statusConfig = CASE_STATUS_CONFIG[caseStatus] ?? {
    color: "default",
    label: caseStatus,
    badgeStatus: "default",
  };
  const specimenColor = SPECIMEN_COLOR[caseData?.specimen_type] ?? "default";

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" tip="Loading..." />
      </div>
    );

  return (
    <PageContainer withCard>
      {/* ── Sticky Toolbar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #f0f0f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          padding: "10px 24px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Left */}
          <Space size="large">
            <Button icon={<ArrowLeftOutlined />} type="text" onClick={onBack} />
            <Space size={8}>
              <Text strong style={{ fontSize: 16 }}>
                {caseData?.accession_no || `Case #${caseId}`}
              </Text>
              <Badge
                status={statusConfig.badgeStatus}
                text={
                  <Text style={{ fontSize: 13 }}>{statusConfig.label}</Text>
                }
              />
              {caseData?.is_pending && (
                <Tag
                  color="orange"
                  icon={<ClockCircleOutlined />}
                  style={{ margin: 0 }}
                >
                  Provisional
                </Tag>
              )}
              {caseData?.has_malignancy && (
                <Tag
                  color="red"
                  icon={<WarningOutlined />}
                  style={{ margin: 0 }}
                >
                  Malignancy
                </Tag>
              )}
              {isAddendumMode && <Tag color="orange">New Report Mode</Tag>}
              {isEditorLocked && (
                <Tooltip title="Form is locked after sign-off">
                  <LockOutlined style={{ color: "#8c8c8c" }} />
                </Tooltip>
              )}
            </Space>
          </Space>

          {/* Right */}
          <Space>
            <Checkbox
              checked={caseData?.is_out_lab_consult || false}
              onChange={(e) => handleToggleOutLabConsult(e.target.checked)}
              disabled={isEditorLocked}
            >
              Out-Lab Consult
            </Checkbox>

            {activeReportId && (
              <Button
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => setConsultModalOpen(true)}
              >
                Request Consult
              </Button>
            )}

            {isFinalized && !isAddendumMode && (
              <>
                <Button
                  icon={<FileTextOutlined />}
                  onClick={handleViewFinalPdf}
                >
                  View Report
                </Button>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setCompletedCasePopupOpen(true)}
                  style={{
                    background: "#fa8c16",
                    border: "none",
                    color: "#fff",
                  }}
                >
                  New Report
                </Button>
              </>
            )}

            {isAddendumMode && (
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => {
                  setIsAddendumMode(false);
                  setPrevDiagnosis(null);
                  fetchDiagnosis();
                }}
              >
                Cancel
              </Button>
            )}

            {isFormMode && (
              <>
                <Button icon={<FileTextOutlined />} onClick={handlePreviewPdf}>
                  Preview PDF
                </Button>

                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={submitting}
                  onClick={() => form.submit()}
                  style={{ background: "#52c41a", border: "none" }}
                >
                  Save Draft
                </Button>

                {(!isFinalized || isAddendumMode || isConsultEditorLocked) && diagnosis && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={submitting}
                    disabled={isFinalizeLocked}
                    onClick={handleFinalizeClick}
                    style={{ background: "#cf1322", border: "none" }}
                  >
                    Sign-off
                  </Button>
                )}
              </>
            )}
          </Space>
        </div>
      </div>

      {/* ── Patient Info ── */}
      <div style={{ padding: "12px 24px 8px" }}>
        <PatientInfoCard
          activeCase={
            caseData as unknown as import("../../types/surgical").SurgicalCase
          }
          activeCaseType="nongyne"
          activeCaseId={caseId ? Number(caseId) : undefined}
          isExpanded={isPatientInfoExpanded}
          onToggle={(state) => setIsPatientInfoExpanded(state)}
        />
      </div>

      <div
        style={{
          padding: "0 24px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* ── Finalized read-only view ── */}
        {diagnosis && isFinalized && !isAddendumMode && diagnosis.diagnosis && (
          <StyledCard styles={{ body: { padding: "20px 24px" } }}>
            <Descriptions
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                  <Text strong style={{ fontSize: 15 }}>
                    Reported Result
                  </Text>
                  {diagnosis.diagnosis_at && (
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, fontWeight: 400 }}
                    >
                      —{" "}
                      {dayjs(diagnosis.diagnosis_at).format(
                        "DD MMM YYYY HH:mm",
                      )}
                    </Text>
                  )}
                </Space>
              }
              column={1}
              bordered
              size="small"
              labelStyle={{
                width: 220,
                fontWeight: 600,
                background: "#fafafa",
              }}
            >
              <Descriptions.Item label="Specimen / Site">
                <Space size={8}>
                  <Tag color={specimenColor} style={{ fontWeight: 600 }}>
                    {caseData?.specimen_type || "—"}
                  </Tag>
                  {caseData?.collection_site && (
                    <Text type="secondary">{caseData.collection_site}</Text>
                  )}
                </Space>
              </Descriptions.Item>
              {caseData?.received_volume_ml && (
                <Descriptions.Item label="Received Volume">
                  {caseData.received_volume_ml} ml
                </Descriptions.Item>
              )}
              {caseData?.clinical_history && (
                <Descriptions.Item label="Clinical History">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(caseData.clinical_history),
                    }}
                  />
                </Descriptions.Item>
              )}
              {diagnosis.gross_description && (
                <Descriptions.Item label="Gross Description">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(diagnosis.gross_description),
                    }}
                  />
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Microscopic Description">
                {diagnosis.microscopic_description ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(diagnosis.microscopic_description),
                    }}
                  />
                ) : (
                  <Text>—</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Diagnosis">
                {diagnosis.diagnosis ? (
                  <div
                    style={{ fontWeight: 500 }}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(diagnosis.diagnosis),
                    }}
                  />
                ) : (
                  <Text>—</Text>
                )}
              </Descriptions.Item>
              {diagnosis.comment && (
                <Descriptions.Item label="Comment">
                  <Text style={{ whiteSpace: "pre-wrap" }}>
                    {diagnosis.comment}
                  </Text>
                </Descriptions.Item>
              )}
            </Descriptions>
            {images.filter((i) => i.show_in_report).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Text strong style={{ fontSize: 12, color: "#722ed1" }}>
                  Cytology Images
                </Text>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 8,
                  }}
                >
                  {images
                    .filter((i) => i.show_in_report)
                    .map((img) => (
                      <SecureImage
                        key={img.id}
                        src={`${API_BASE_URL}${img.image_url}`}
                        width={140}
                        height={110}
                        style={{ objectFit: "cover", borderRadius: 4 }}
                      />
                    ))}
                </div>
              </div>
            )}
          </StyledCard>
        )}

        {/* ── Edit / Create Form ── */}
        {isFormMode && (
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {isAddendumMode && (
              <Alert
                message="Creating New Report"
                description="The previous report is preserved. This will create a new version."
                type="warning"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}
            {isAddendumMode && prevDiagnosis?.diagnosis && (
              <StyledCard
                styles={{ body: { padding: "16px 24px" } }}
                style={{
                  borderLeft: "4px solid #d9d9d9",
                  marginBottom: 16,
                  opacity: 0.85,
                }}
              >
                <Space style={{ marginBottom: 8 }}>
                  <FileTextOutlined style={{ color: "#8c8c8c" }} />
                  <Text
                    type="secondary"
                    style={{ fontWeight: 600, fontSize: 13 }}
                  >
                    Previous Report
                    {prevDiagnosis.diagnosis_at
                      ? ` — ${dayjs(prevDiagnosis.diagnosis_at).format("DD/MM/YYYY HH:mm")}`
                      : ""}
                  </Text>
                </Space>
                <div
                  style={{ fontSize: 13 }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(prevDiagnosis.diagnosis),
                  }}
                />
              </StyledCard>
            )}

            {/* Specimen fields */}
            <StyledCard styles={{ body: { padding: "24px" } }}>
              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="specimen_type"
                    label="Specimen Type"
                    rules={[{ required: true }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select disabled={isEditorLocked}>
                      {SPECIMEN_TYPES.map((t) => (
                        <Select.Option key={t} value={t}>
                          {t}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="collection_site"
                    label="Collection Site"
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      placeholder="e.g. Right lobe, Ascitic fluid"
                      disabled={isEditorLocked}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="received_volume_ml"
                    label="Volume (ml)"
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="e.g. 50" disabled={isEditorLocked} />
                  </Form.Item>
                </Col>
              </Row>
            </StyledCard>

            {/* Clinical + Gross */}
            <Row gutter={16} align="stretch">
              <Col xs={24} lg={12}>
                <StyledCard
                  styles={{ body: { padding: "24px" } }}
                  style={{ height: "100%" }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Space>
                      <FileTextOutlined style={{ color: "#595959" }} />
                      <Text strong style={{ textTransform: "uppercase" }}>
                        Clinical Information
                      </Text>
                    </Space>
                  </div>
                  <Form.Item name="clinical_history" noStyle>
                    <SimpleTiptapEditor
                      placeholder="ประวัติการรักษาและผลตรวจที่เกี่ยวข้อง..."
                      style={{ minHeight: "90px" }}
                    />
                  </Form.Item>
                </StyledCard>
              </Col>
              <Col xs={24} lg={12}>
                <StyledCard
                  styles={{ body: { padding: "24px" } }}
                  style={{ height: "100%" }}
                >
                  <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Space>
                      <EyeOutlined style={{ color: "#595959" }} />
                      <Text strong style={{ textTransform: "uppercase" }}>
                        Gross Description
                      </Text>
                    </Space>
                    {!isEditorLocked && (
                      <Button size="small" icon={<FileTextOutlined />} onClick={() => setGrossTemplateDrawerOpen(true)}>
                        Templates
                      </Button>
                    )}
                  </div>
                  <Form.Item name="gross_description" noStyle>
                    <SimpleTiptapEditor
                      placeholder="Describe received specimen, fluid volume, color, turbidity, slides..."
                      disabled={isEditorLocked}
                      style={{ minHeight: "90px" }}
                    />
                  </Form.Item>
                </StyledCard>
              </Col>
            </Row>

            {/* Diagnosis + Microscopic */}
            <StyledCard styles={{ body: { padding: "24px" } }}>
              <Row gutter={24}>
                <Col xs={24} lg={12}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    <section>
                      <div
                        style={{
                          marginBottom: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Space>
                          <FileTextOutlined style={{ color: "#595959" }} />
                          <Text strong style={{ textTransform: "uppercase" }}>
                            Diagnosis
                          </Text>
                        </Space>
                        {!isEditorLocked && (
                          <Button
                            size="small"
                            icon={<FileTextOutlined />}
                            onClick={() => setTemplateDrawerOpen(true)}
                          >
                            Templates
                          </Button>
                        )}
                      </div>
                      <Form.Item
                        name="diagnosis"
                        noStyle
                        rules={[
                          { required: true, message: "Diagnosis is required." },
                        ]}
                      >
                        <SimpleTiptapEditor
                          placeholder="Enter diagnosis..."
                          disabled={isEditorLocked}
                          style={{ minHeight: "150px" }}
                        />
                      </Form.Item>
                    </section>
                    <section>
                      <div style={{ marginBottom: 8 }}>
                        <Space>
                          <ExperimentOutlined style={{ color: "#595959" }} />
                          <Text strong style={{ textTransform: "uppercase" }}>
                            Cell Block Preparation
                          </Text>
                        </Space>
                      </div>
                      <Space
                        size={12}
                        style={{
                          marginBottom: caseData?.is_cell_block ? 12 : 0,
                        }}
                      >
                        <Switch
                          checked={caseData?.is_cell_block || false}
                          onChange={handleToggleCellBlock}
                          disabled={isEditorLocked}
                        />
                        <Text strong>Cell block prepared</Text>
                        {caseData?.is_cell_block &&
                          caseData.cell_block_prepared_at && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {dayjs(caseData.cell_block_prepared_at).format(
                                "DD MMM YYYY HH:mm",
                              )}
                              {caseData.cell_block_prepared_by?.full_name &&
                                ` — ${caseData.cell_block_prepared_by.full_name}`}
                            </Text>
                          )}
                      </Space>
                      {caseData?.is_cell_block &&
                        caseData.cell_block_status && (
                          <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Processing Status:{" "}
                            </Text>
                            <Tag
                              color={
                                caseData.cell_block_status === "ready"
                                  ? "green"
                                  : caseData.cell_block_status === "processing"
                                    ? "blue"
                                    : caseData.cell_block_status === "failed"
                                      ? "red"
                                      : "orange"
                              }
                            >
                              {caseData.cell_block_status
                                .charAt(0)
                                .toUpperCase() +
                                caseData.cell_block_status.slice(1)}
                            </Tag>
                          </div>
                        )}
                    </section>
                  </div>
                </Col>
                <Col xs={24} lg={12}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    <section>
                      <div style={{ marginBottom: 8 }}>
                        <Space>
                          <PictureOutlined style={{ color: "#595959" }} />
                          <Text strong style={{ textTransform: "uppercase" }}>
                            Microscopic Description
                          </Text>
                        </Space>
                      </div>
                      <Form.Item name="microscopic_description" noStyle>
                        <SimpleTiptapEditor
                          placeholder="Describe microscopic findings..."
                          disabled={isEditorLocked}
                          style={{ minHeight: "150px" }}
                        />
                      </Form.Item>
                    </section>
                    <section>
                      <div style={{ marginBottom: 8 }}>
                        <Space>
                          <CameraOutlined style={{ color: "#595959" }} />
                          <Text strong style={{ textTransform: "uppercase" }}>
                            Cytology Images
                          </Text>
                        </Space>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 12,
                          marginBottom: images.length > 0 ? 12 : 0,
                        }}
                      >
                        {images.map((img) => (
                          <div
                            key={img.id}
                            style={{ position: "relative", width: 160 }}
                          >
                            <SecureImage
                              src={`${API_BASE_URL}${img.image_url}`}
                              width={160}
                              height={120}
                              style={{
                                objectFit: "cover",
                                borderRadius: 4,
                                border: "1px solid #d9d9d9",
                              }}
                              preview={true}
                            />
                            <Input
                              size="small"
                              placeholder="Description..."
                              value={descMap[img.id] ?? ""}
                              disabled={isEditorLocked}
                              style={{ marginTop: 4, fontSize: 11 }}
                              onChange={(e) =>
                                setDescMap((prev) => ({
                                  ...prev,
                                  [img.id]: e.target.value,
                                }))
                              }
                              onBlur={() => saveDesc(img.id)}
                              onPressEnter={() => saveDesc(img.id)}
                            />
                            <div
                              style={{ display: "flex", gap: 6, marginTop: 4 }}
                            >
                              <Switch
                                size="small"
                                checked={img.show_in_report}
                                checkedChildren="In Report"
                                unCheckedChildren="Hidden"
                                onChange={async (checked) => {
                                  await NongyneCaseImageService.update(img.id, {
                                    show_in_report: checked,
                                  });
                                  fetchImages();
                                }}
                              />
                              {!isEditorLocked && (
                                <Button
                                  size="small"
                                  icon={<EditOutlined />}
                                  onClick={() => {
                                    setEditingImage(img);
                                    setImageCaptureOpen(true);
                                  }}
                                />
                              )}
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={async () => {
                                  await NongyneCaseImageService.delete(img.id);
                                  fetchImages();
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      {!isEditorLocked && (
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() => {
                            setEditingImage(null);
                            setImageCaptureOpen(true);
                          }}
                        >
                          Capture / Upload Image
                        </Button>
                      )}
                    </section>
                  </div>
                </Col>
              </Row>
            </StyledCard>

            {/* IHC Panel */}
            {caseData?.is_cell_block && (
              <StyledCard styles={{ body: { padding: "24px" } }}>
                <NongyneIHCResultPanel
                  form={form}
                  caseId={Number(caseId)}
                  isLocked={isEditorLocked}
                />
              </StyledCard>
            )}

            {/* Cyto-Histo Correlation */}
            <CytoCorrelationManager
              caseId={Number(caseId)}
              caseType="nongyne"
              diagnosisSnapshot={diagnosis?.diagnosis ?? undefined}
              isLocked={isEditorLocked}
            />

            {/* Comment + Signatories */}
            <Row gutter={16} align="stretch">
              <Col xs={24} lg={12}>
                <StyledCard
                  styles={{ body: { padding: "24px" } }}
                  style={{ height: "100%" }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Text strong style={{ textTransform: "uppercase" }}>
                      Comment &amp; Notes
                    </Text>
                  </div>
                  <Form.Item name="comment" noStyle>
                    <TextArea
                      autoSize={{ minRows: 3 }}
                      placeholder="Additional comments or remarks..."
                      disabled={isEditorLocked}
                    />
                  </Form.Item>
                  {isAddendumMode && (
                    <Form.Item
                      name="revision_reason"
                      label="Reason for Revision"
                      style={{ marginTop: 12, marginBottom: 0 }}
                      rules={[
                        {
                          required: true,
                          message: "Please specify the reason for revision.",
                        },
                      ]}
                    >
                      <TextArea
                        autoSize={{ minRows: 3 }}
                        placeholder="Explain why this report is being revised..."
                      />
                    </Form.Item>
                  )}
                </StyledCard>
              </Col>
              <Col xs={24} lg={12}>
                <StyledCard
                  styles={{ body: { padding: "24px" } }}
                  style={{ height: "100%" }}
                >
                  <GynePathologistDiagnosisManager
                    form={form}
                    pathologists={allUsers}
                    defaultSigners={defaultSigners}
                    isLocked={isEditorLocked}
                    namePath={SIGNERS_PATH}
                    settings={{ require_all_pathologists_sign: false }}
                  />
                </StyledCard>
              </Col>
            </Row>

            {activeReportId && (
              <>
                <ConsultHistorySection
                  caseType="nongyne"
                  reportId={activeReportId}
                  currentUserId={currentUser?.id}
                  refreshKey={consultHistoryKey}
                />
                <ConsultRequestModal
                  open={consultModalOpen}
                  onClose={() => setConsultModalOpen(false)}
                  onSuccess={() => setConsultHistoryKey((k) => k + 1)}
                  caseType="nongyne"
                  reportId={activeReportId}
                  pathologists={allUsers.map((u) => ({
                    value: u.id,
                    label: u.full_name ?? u.username ?? String(u.id),
                  }))}
                />
              </>
            )}

            {isAddendumMode && (
              <div style={{ textAlign: "right", marginBottom: 16 }}>
                <Button
                  onClick={() => {
                    setIsAddendumMode(false);
                    setPrevDiagnosis(null);
                    fetchDiagnosis();
                  }}
                >
                  Cancel Revision
                </Button>
              </div>
            )}
          </Form>
        )}
      </div>

      <ReportPreviewModal
        open={isPreviewModalVisible}
        pdfUrl={previewPdfUrl}
        onCancel={() => {
          setIsPreviewModalVisible(false);
          if (previewPdfUrl) {
            window.URL.revokeObjectURL(previewPdfUrl);
            setPreviewPdfUrl(null);
          }
        }}
      />

      <NongyneCytologyImageCaptureModal
        open={imageCaptureOpen}
        caseId={Number(caseId)}
        editingImage={editingImage}
        nextOrder={images.length + 1}
        onClose={() => {
          setImageCaptureOpen(false);
          setEditingImage(null);
        }}
        onSuccess={() => fetchImages()}
      />

      <NongyneSignOffPage
        open={slideQualityModalOpen}
        caseId={caseId}
        caseData={caseData}
        finalizing={submitting}
        initialSlideQuality={caseData?.slide_quality ?? null}
        initialStainQuality={caseData?.stain_quality ?? null}
        initialIsCasePending={isConsultEditorLocked ? false : (caseData?.is_pending ?? false)}
        onClose={() => setSlideQualityModalOpen(false)}
        onConfirm={handleFinalize}
        onConfirmAndOutLab={handleOutLabConsult}
      />

      {/* Case Already Signed Off popup */}
      <Modal
        open={completedCasePopupOpen}
        onCancel={() => setCompletedCasePopupOpen(false)}
        footer={null}
        width={1100}
        centered
        closable
        style={{ top: 20 }}
      >
        <Row gutter={24}>
          <Col
            span={9}
            style={{
              borderRight: "1px solid #f0f0f0",
              paddingRight: 24,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                background: "#f6ffed",
                border: "1px solid #b7eb8f",
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <Typography.Text strong style={{ fontSize: 15 }}>
                  {caseData?.accession_no}
                </Typography.Text>
                <Tag color="green" style={{ margin: 0 }}>
                  SIGNED
                </Tag>
                {caseData?.is_pending && (
                  <Tag color="orange" style={{ margin: 0 }}>
                    PROVISIONAL
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {[
                  caseData?.patient?.title?.title,
                  caseData?.patient?.name,
                  caseData?.patient?.ln,
                ]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </div>
              <div style={{ fontSize: 12, color: "#595959", marginTop: 2 }}>
                HN: {caseData?.patient?.hn || caseData?.hn || "—"}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <CheckCircleOutlined
                style={{ fontSize: 36, color: "#52c41a", marginBottom: 6 }}
              />
              <Typography.Title level={5} style={{ margin: "0 0 4px" }}>
                Case Already Signed Off
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                You are in view-only mode.
              </Typography.Text>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "center",
                  marginTop: 12,
                }}
              >
                <Button onClick={onBack}>Go Back</Button>
                <Button
                  type="primary"
                  icon={<FileAddOutlined />}
                  style={{ background: "#fa8c16", borderColor: "#fa8c16" }}
                  onClick={handleStartNewReport}
                >
                  Add New Report
                </Button>
              </div>
            </div>
            <Table
              size="small"
              loading={completedReportsLoading}
              dataSource={completedReports}
              rowKey="id"
              pagination={false}
              scroll={{ y: 300 }}
              onRow={(record: any) => ({
                onClick: () => setSelectedPopupReportId(record.id),
                style: {
                  cursor: "pointer",
                  background:
                    selectedPopupReportId === record.id ? "#e6f4ff" : undefined,
                },
              })}
              columns={[
                {
                  title: "Round",
                  key: "round",
                  width: 60,
                  render: (_: any, __: any, idx: number) => `#${idx + 1}`,
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  key: "status",
                  width: 100,
                  render: (s: string) => (
                    <Tag
                      color={
                        s === "published"
                          ? "green"
                          : s === "pending_approval"
                            ? "orange"
                            : "default"
                      }
                      style={{ margin: 0 }}
                    >
                      {s?.replace("_", " ").toUpperCase()}
                    </Tag>
                  ),
                },
                {
                  title: "Published",
                  dataIndex: "created_at",
                  key: "created_at",
                  render: (d: string) =>
                    d ? dayjs(d).format("DD/MM/YY HH:mm") : "—",
                },
              ]}
            />
          </Col>
          <Col span={15}>
            <div
              style={{
                height: "70vh",
                background: "#f5f5f5",
                borderRadius: 8,
                border: "1px solid #d9d9d9",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {popupPdfLoading ? (
                <Spin tip="Loading PDF..." size="large" />
              ) : popupPdfUrl ? (
                <iframe
                  src={popupPdfUrl}
                  width="100%"
                  height="100%"
                  style={{ border: "none" }}
                  title="Report PDF"
                />
              ) : (
                <div style={{ textAlign: "center", color: "#999" }}>
                  <FilePdfOutlined style={{ fontSize: 48, marginBottom: 8 }} />
                  <p>Select a report to preview</p>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Modal>

      <Drawer
        title="Diagnosis Templates"
        open={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        width={720}
        destroyOnClose
      >
        <DiagnosticTemplateSystem
          hideTargetSelector
          defaultCategory={`Nongyne - ${caseData?.specimen_type ?? "General"}`}
          onApply={(data, mode) => {
            const cur = (form.getFieldValue("diagnosis") as string) ?? "";
            const curMicro =
              (form.getFieldValue("microscopic_description") as string) ?? "";
            form.setFieldValue(
              "diagnosis",
              mode === "replace" ? data.diagnosis : cur + data.diagnosis,
            );
            form.setFieldValue(
              "microscopic_description",
              mode === "replace"
                ? data.microscopic
                : curMicro + data.microscopic,
            );
            setTemplateDrawerOpen(false);
          }}
        />
      </Drawer>

      <Drawer
        title="Gross Description Templates"
        open={grossTemplateDrawerOpen}
        onClose={() => setGrossTemplateDrawerOpen(false)}
        width={720}
        destroyOnClose
      >
        <GrossTemplateSystem
          onFinishedText={(text, mode) => {
            const cur = (form.getFieldValue("gross_description") as string) ?? "";
            form.setFieldValue(
              "gross_description",
              mode === "replace" ? text : cur + text,
            );
            setGrossTemplateDrawerOpen(false);
          }}
        />
      </Drawer>
    </PageContainer>
  );
};

export default PathologistNongyneDiagnosisPage;

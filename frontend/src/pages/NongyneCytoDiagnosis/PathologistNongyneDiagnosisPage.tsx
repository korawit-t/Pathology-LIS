import React, { useEffect, useState, useMemo, useRef } from "react";
import { sanitizeHtml } from "../../utils/sanitize";
import {
  Form,
  Input,
  Select,
  Button,
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
  Drawer,
} from "antd";
import {
  SaveOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  LockOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  AlertOutlined,
  PlusOutlined,
  ExperimentOutlined,
  EyeOutlined,
  PictureOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NotificationRuleService from "../../services/notificationRuleService";
import NongyneReportService from "../../services/nongyneReportService";
import type { NongyneCaseImage } from "../../services/nongyneCaseImageService";
import { NongyneDiagnosisResponse, NongyneDiagnosisUpdate } from "../../types/nongyneDiagnosis";
import { NongyneCytologyCase } from "../../types/nongyne";
import type { BadgeProps } from "antd";
import { useNongyneDiagnosisData } from "./hooks/useNongyneDiagnosisData";
import { usePdfBlobUrl } from "../../hooks/usePdfBlobUrl";
import PatientInfoCard from "../../components/PatientInfoCard";
import PageContainer from "../../components/Layout/PageContainer";
import StyledCard from "../../components/Layout/StyledCard";
import ReportPreviewModal from "../../components/ReportPreviewModal";
import PathologistDiagnosisManager from "../../components/PathologistDiagnosis/PathologistDiagnosisManager";
import ConsultRequestModal from "../../components/InternalConsult/ConsultRequestModal";
import ConsultHistorySection from "../../components/InternalConsult/ConsultHistorySection";
import ConsultPdfPanel from "../../components/OutlabConsult/ConsultPdfPanel";
import NongyneIHCResultPanel from "./components/NongyneIHCResultPanel";
import NongyneCompletedCaseModal from "./components/NongyneCompletedCaseModal";
import NongyneFinalizedResultCard from "./components/NongyneFinalizedResultCard";
import NongyneCytologyImageGrid from "./components/NongyneCytologyImageGrid";
import NongyneCytologyImageCaptureModal from "./components/NongyneCytologyImageCaptureModal";
import logger from "../../utils/logger";
import CytoCorrelationManager from "../../components/CytoCorrelationManager";
import SimpleTiptapEditor from "../../components/Editors/SimpleTiptapEditor";
import DiagnosticTemplateSystem from "../Pathologist/SurgicalDiagnosticTemplate/DiagnosticTemplateSystem";
import GrossTemplateSystem from "../Gross/components/GrossTemplateSystem";
import NongyneSignOffPage from "./components/NongyneSignOffPage";
import { getConsultLockState } from "../Pathologist/utils/consultLockState";
import { toPathologistOptions } from "../../utils/pathologistOptions";

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  caseId?: string | number;
  onBack?: () => void;
}

// Form values for onFinish: the case-level fields (saved via
// NongyneCytologyCaseService.update) plus everything NongyneDiagnosisUpdate
// covers (saved via NongyneDiagnosisService.update/create) — the form mixes
// both onto one antd <Form>, so onFinish receives the union.
type NongyneOnFinishValues = NongyneDiagnosisUpdate & {
  clinical_history?: string | null;
  specimen_type?: string;
  collection_site?: string | null;
  received_volume_ml?: string | null;
  has_malignancy?: boolean;
  has_critical?: boolean;
};

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
  const [submitting, setSubmitting] = useState(false);
  const [prevDiagnosis, setPrevDiagnosis] =
    useState<NongyneDiagnosisResponse | null>(null);
  const [isAddendumMode, setIsAddendumMode] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<NongyneCaseImage | null>(
    null,
  );
  const [slideQualityModalOpen, setSlideQualityModalOpen] = useState(false);
  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [consultHistoryKey, setConsultHistoryKey] = useState(0);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [grossTemplateDrawerOpen, setGrossTemplateDrawerOpen] = useState(false);
  const completedCasePopupShownRef = useRef(false);
  const [completedCasePopupOpen, setCompletedCasePopupOpen] = useState(false);
  const [completedReports, setCompletedReports] = useState<NongyneDiagnosisResponse[]>([]);
  const [completedReportsLoading, setCompletedReportsLoading] = useState(false);
  const [selectedPopupReportId, setSelectedPopupReportId] = useState<
    number | null
  >(null);

  const SIGNERS_PATH = useMemo(() => ["signers"], []);

  const {
    caseData,
    setCaseData,
    diagnosis,
    setDiagnosis,
    images,
    descMap,
    setDescMap,
    allUsers,
    currentUser,
    loading,
    setLoading,
    activeReportId,
    defaultSigners,
    fetchDiagnosis,
    fetchCaseData,
    fetchImages,
    saveDesc,
  } = useNongyneDiagnosisData(caseId, form);

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

  useEffect(() => {
    const current = form.getFieldValue("signers");
    if ((!current || current.length === 0) && defaultSigners.length > 0)
      form.setFieldValue("signers", defaultSigners);
  }, [loading, diagnosis, caseData, defaultSigners, form]);

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
        const first = reports[0];
        if (first) setSelectedPopupReportId(first.id);
      })
      .catch(() => {})
      .finally(() => setCompletedReportsLoading(false));
  }, [completedCasePopupOpen, caseId]);

  // Load PDF for selected report in popup
  const popupPdfFetchFn = useMemo(
    () =>
      selectedPopupReportId
        ? () => NongyneReportService.getReportPdf(selectedPopupReportId)
        : null,
    [selectedPopupReportId],
  );
  const { url: popupPdfUrl, loading: popupPdfLoading } = usePdfBlobUrl(popupPdfFetchFn, {
    onError: (err) => logger.error("Failed to load popup report PDF:", err),
  });

  const onFinish = async (values: NongyneOnFinishValues) => {
    try {
      setSubmitting(true);
      const {
        clinical_history,
        specimen_type,
        collection_site,
        received_volume_ml,
        has_malignancy,
        has_critical,
        signers: _signers,
        ...diagnosisValues
      } = values;

      await NongyneCytologyCaseService.update(Number(caseId), {
        clinical_history: clinical_history ?? null,
        specimen_type,
        collection_site: collection_site ?? null,
        received_volume_ml: received_volume_ml ?? null,
        has_malignancy: has_malignancy ?? false,
        has_critical: has_critical ?? false,
      });
      setCaseData((prev) => ({
        ...prev,
        clinical_history,
        specimen_type,
        collection_site,
        received_volume_ml,
        has_malignancy,
        has_critical,
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
      has_malignancy: caseData?.has_malignancy ?? false,
      has_critical: caseData?.has_critical ?? false,
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
      )) as { id: number; status: string };

      if (outLab) {
        message.success("Report signed off — flagged for Out-Lab Consult");
      } else if (publishedReport.status === "published") {
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
              {caseData?.has_critical && (
                <Tag
                  color="gold"
                  icon={<AlertOutlined />}
                  style={{ margin: 0 }}
                >
                  Critical
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
        {/* ── Out-Lab Consult PDF ───────────────────────────────────────── */}
        {caseData?.is_out_lab_consult && (
          <ConsultPdfPanel
            caseId={Number(caseId)}
            isOutLabConsult={!!caseData?.is_out_lab_consult}
            consultPdfPath={caseData?.consult_pdf_path}
            consultStatus={caseData?.consult_status}
            onUpload={NongyneCytologyCaseService.uploadConsultPdf}
            onDelete={NongyneCytologyCaseService.deleteConsultPdf}
            onGetBlob={NongyneCytologyCaseService.getConsultPdfBlob}
            onRefresh={fetchCaseData}
          />
        )}

        {/* ── Finalized read-only view ── */}
        {diagnosis && isFinalized && !isAddendumMode && diagnosis.diagnosis && (
          <NongyneFinalizedResultCard
            diagnosis={diagnosis}
            caseData={caseData}
            images={images}
            specimenColor={specimenColor}
          />
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
                <Col xs={24} sm={6}>
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
                <Col xs={24} sm={6}>
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
                <Col xs={24} sm={6}>
                  <Form.Item
                    name="received_volume_ml"
                    label="Volume (ml)"
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="e.g. 50" disabled={isEditorLocked} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item label="Number of Slides" style={{ marginBottom: 0 }}>
                    <Input value={caseData?.slide_count ?? "—"} disabled />
                  </Form.Item>
                </Col>
              </Row>
            </StyledCard>

            {/* Diagnostic Flags */}
            <StyledCard styles={{ body: { padding: "16px 24px" } }}>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "#fff1f0",
                      borderRadius: "8px",
                      border: "1px solid #ffa39e",
                    }}
                  >
                    <Space>
                      <ExclamationCircleOutlined style={{ color: "#cf1322" }} />
                      <Text strong style={{ color: "#cf1322", fontSize: "13px" }}>
                        Malignancy
                      </Text>
                    </Space>
                    <Form.Item
                      name="has_malignancy"
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                    >
                      <Switch
                        disabled={isEditorLocked}
                        checkedChildren="Yes"
                        unCheckedChildren="No"
                      />
                    </Form.Item>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "#fffbe6",
                      borderRadius: "8px",
                      border: "1px solid #ffe58f",
                    }}
                  >
                    <Space>
                      <AlertOutlined style={{ color: "#d48806" }} />
                      <Text strong style={{ color: "#d48806", fontSize: "13px" }}>
                        Critical Case
                      </Text>
                    </Space>
                    <Form.Item
                      name="has_critical"
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                    >
                      <Switch
                        disabled={isEditorLocked}
                        checkedChildren="Yes"
                        unCheckedChildren="No"
                      />
                    </Form.Item>
                  </div>
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
                      placeholder="Clinical history and relevant test results..."
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
                    <NongyneCytologyImageGrid
                      images={images}
                      descMap={descMap}
                      setDescMap={setDescMap}
                      saveDesc={saveDesc}
                      fetchImages={fetchImages}
                      disabled={isEditorLocked}
                      onEditImage={(img) => {
                        setEditingImage(img);
                        setImageCaptureOpen(true);
                      }}
                      onAddImage={() => {
                        setEditingImage(null);
                        setImageCaptureOpen(true);
                      }}
                    />
                  </div>
                </Col>
              </Row>
            </StyledCard>

            {/* IHC Panel */}
            {caseData?.is_cell_block && (
              <StyledCard styles={{ body: { padding: "24px" } }}>
                <NongyneIHCResultPanel
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
                  <PathologistDiagnosisManager
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
                  pathologists={toPathologistOptions(allUsers)}
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

      <NongyneCompletedCaseModal
        open={completedCasePopupOpen}
        onClose={() => setCompletedCasePopupOpen(false)}
        onBack={onBack}
        onAddNewReport={handleStartNewReport}
        caseData={caseData}
        completedReports={completedReports}
        completedReportsLoading={completedReportsLoading}
        selectedReportId={selectedPopupReportId}
        onSelectReport={setSelectedPopupReportId}
        pdfUrl={popupPdfUrl}
        pdfLoading={popupPdfLoading}
      />

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

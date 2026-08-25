import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Tag,
  Space,
  message,
  Spin,
  Typography,
  Row,
  Col,
  Checkbox,
  Badge,
  Tooltip,
  Switch,
  Modal,
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
  ExperimentOutlined,
  EyeOutlined,
  PictureOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { UserRole } from "../../constants/roles.constants";

import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NotificationRuleService from "../../services/notificationRuleService";
import SystemSettingService from "../../services/systemSettingService";
import NongyneReportService from "../../services/nongyneReportService";
import NongyneCaseImageService, {
  NongyneCaseImage,
} from "../../services/nongyneCaseImageService";
import UserService from "../../services/userService";
import { NongyneDiagnosisResponse, NongyneDiagnosisUpdate, NongyneSigner } from "../../types/nongyneDiagnosis";
import { NongyneCytologyCase, NongyneCytologyCaseUpdate } from "../../types/nongyne";
import { User } from "../../types/user";
import type { BadgeProps } from "antd";
import PatientInfoCard from "../../components/PatientInfoCard";
import PageContainer from "../../components/Layout/PageContainer";
import StyledCard from "../../components/Layout/StyledCard";
import ReportPreviewModal from "../../components/ReportPreviewModal";
import ConsultRequestModal from "../../components/InternalConsult/ConsultRequestModal";
import ConsultHistorySection from "../../components/InternalConsult/ConsultHistorySection";
import ConsultPdfPanel from "../../components/OutlabConsult/ConsultPdfPanel";
import NongyneIHCResultPanel from "./components/NongyneIHCResultPanel";
import NongyneCytologyImageCaptureModal from "./components/NongyneCytologyImageCaptureModal";
import NongyneFinalizedResultCard from "./components/NongyneFinalizedResultCard";
import NongyneCytologyImageGrid from "./components/NongyneCytologyImageGrid";
import logger from "../../utils/logger";
import CytoCorrelationManager from "../../components/CytoCorrelationManager";
import SimpleTiptapEditor from "../../components/Editors/SimpleTiptapEditor";
import DiagnosticTemplateSystem from "../Pathologist/SurgicalDiagnosticTemplate/DiagnosticTemplateSystem";
import GrossTemplateSystem from "../Gross/components/GrossTemplateSystem";
import { toPathologistOptions } from "../../utils/pathologistOptions";

const { TextArea } = Input;
const { Text } = Typography;

interface NongyneDiagnosisEntryPageProps {
  caseId?: string | number;
  onBack?: () => void;
}

// Form values for onFinish: the case-level fields (saved via
// NongyneCytologyCaseService.update) plus everything NongyneDiagnosisUpdate
// covers (saved via NongyneDiagnosisService.update/create) — the form mixes
// both onto one antd <Form>, so onFinish receives the union. Kept local
// (not imported from the Pathologist sibling, which has its own identical
// definition) — page-local shapes like this aren't centralized elsewhere in
// this codebase either.
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

// Specimen type → color
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

const NongyneDiagnosisEntryPage: React.FC<NongyneDiagnosisEntryPageProps> = (
  props,
) => {
  const { caseId: propsCaseId, onBack } = props;
  const caseId = propsCaseId;
  const [form] = Form.useForm();

  const [isPatientInfoExpanded, setIsPatientInfoExpanded] = useState(false);
  const [caseData, setCaseData] = useState<NongyneCytologyCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [diagnosis, setDiagnosis] = useState<NongyneDiagnosisResponse | null>(
    null,
  );
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const [images, setImages] = useState<NongyneCaseImage[]>([]);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<NongyneCaseImage | null>(
    null,
  );
  const [descMap, setDescMap] = useState<Record<number, string>>({});
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [consultHistoryKey, setConsultHistoryKey] = useState(0);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [grossTemplateDrawerOpen, setGrossTemplateDrawerOpen] = useState(false);
  const [pathologistPickerOpen, setPathologistPickerOpen] = useState(false);
  const [selectedPathologistId, setSelectedPathologistId] = useState<
    number | null
  >(null);
  const [slideDispatchEnabled, setSlideDispatchEnabled] = useState(true);

  const PATHO_ROLES: UserRole[] = [
    "pathologist",
    "senior_pathologist",
  ];

  const pathologistOptions = useMemo(
    () =>
      allUsers
        .filter((u) => u.roles?.some((r) => PATHO_ROLES.includes(r)))
        .map((u) => ({
          value: u.id,
          label: u.full_name ?? u.username ?? String(u.id),
        })),
    [allUsers],
  );

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
    SystemSettingService.getSettings()
      .then((s) => setSlideDispatchEnabled(s.nongyne_slide_dispatch_enabled ?? true))
      .catch(() => {});
    Promise.all([
      NongyneCytologyCaseService.getById(Number(caseId)),
      UserService.getUsers(),
      UserService.getCurrentUser(),
    ])
      .then(([caseRes, users, me]) => {
        setCaseData(caseRes);
        setAllUsers(users);
        setCurrentUser(me);
        form.setFieldsValue({
          clinical_history: caseRes.clinical_history,
          specimen_type: caseRes.specimen_type,
          collection_site: caseRes.collection_site,
          received_volume_ml: caseRes.received_volume_ml,
          has_malignancy: caseRes.has_malignancy ?? false,
          has_critical: caseRes.has_critical ?? false,
        });
      })
      .catch((e) => logger.error(e));
    fetchImages();
    NongyneReportService.getReportsByCase(Number(caseId))
      .then((reports) => {
        const active = reports.find((r) =>
          ["pending_approval", "published"].includes(r.status),
        );
        setActiveReportId(active?.id ?? null);
      })
      .catch((e) => logger.error(e));
  }, [caseId]);

  const refetchCaseData = useCallback(() => {
    if (!caseId) return;
    NongyneCytologyCaseService.getById(Number(caseId))
      .then(setCaseData)
      .catch((e) => logger.error(e));
  }, [caseId]);

  const fetchDiagnosis = async () => {
    if (!caseId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await NongyneDiagnosisService.getByCaseId(Number(caseId));
      if (data?.length > 0) {
        setDiagnosis(data[0]);
        form.setFieldsValue(data[0]);
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
  const isFormMode = !diagnosis || !isFinalized;
  const isFormLocked = isFinalized;

  // Shared by onFinish, handlePathologistPickerConfirm, and handlePreviewPdf
  // — all three save the same case-level fields + diagnosis update/create,
  // just with different extra case fields and different post-save behavior
  // (which stays visible at each call site, not hidden in here).
  const persistDraft = async (
    values: NongyneOnFinishValues,
    extraCaseFields: Partial<NongyneCytologyCaseUpdate> = {},
    // This page has no Signatories card, so the form never carries a signers
    // array (the destructure below drops it) — only the send-to-pathologist
    // hand-off passes one, to record the screener's own signature.
    signers?: NongyneSigner[],
  ) => {
    const {
      clinical_history,
      specimen_type,
      collection_site,
      received_volume_ml,
      has_malignancy,
      has_critical,
      signers: _s,
      ...diagnosisValues
    } = values;

    await NongyneCytologyCaseService.update(Number(caseId), {
      clinical_history: clinical_history ?? null,
      specimen_type,
      collection_site: collection_site ?? null,
      received_volume_ml: received_volume_ml ?? null,
      has_malignancy: has_malignancy ?? false,
      has_critical: has_critical ?? false,
      ...(currentUser?.id ? { cytotechnologist_id: currentUser.id } : {}),
      ...extraCaseFields,
    });

    const diagnosisPayload = signers
      ? { ...diagnosisValues, signers }
      : diagnosisValues;

    if (diagnosis) {
      await NongyneDiagnosisService.update(diagnosis.id, diagnosisPayload);
    } else {
      await NongyneDiagnosisService.create({
        ...diagnosisPayload,
        case_id: Number(caseId),
      });
    }

    return {
      clinical_history,
      specimen_type,
      collection_site,
      received_volume_ml,
      has_malignancy,
      has_critical,
    };
  };

  const onFinish = async (values: NongyneOnFinishValues) => {
    try {
      setSubmitting(true);
      const savedFields = await persistDraft(values);
      setCaseData((prev) => ({ ...prev, ...savedFields }));
      message.success("Draft saved.");
      fetchDiagnosis();
    } catch (err) {
      logger.error(err);
      message.error("Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendToPathologist = () => {
    const preselect = caseData?.pathologist?.id ?? caseData?.pathologist_id;
    setSelectedPathologistId(preselect ? Number(preselect) : null);
    setPathologistPickerOpen(true);
  };

  // Handing the case to a pathologist is the screener's sign-off, so it is
  // where their signature gets recorded. Without this the cytotechnologist's
  // signer entry stays signed_at=null forever: they'd show PENDING on a
  // published report, and "Require All Signatures (Non-Gyne)" could never be
  // satisfied. Re-sending keeps the original signature time rather than
  // re-stamping it, and re-picks the primary in case the pathologist changed.
  const buildScreeningSigners = (pathologistId: number): NongyneSigner[] => {
    const existing = diagnosis?.signers ?? [];
    const self = existing.find(
      (s) => Number(s.user_id) === Number(currentUser?.id),
    );
    const others = existing.filter(
      (s) =>
        s.role !== "primary" && Number(s.user_id) !== Number(currentUser?.id),
    );
    return [
      ...others,
      ...(currentUser?.id
        ? [
            {
              user_id: currentUser.id,
              role: self?.role ?? "cytotechnologist",
              signed_at: self?.signed_at ?? new Date().toISOString(),
            },
          ]
        : []),
      { user_id: pathologistId, role: "primary", signed_at: null },
    ];
  };

  const handlePathologistPickerConfirm = async () => {
    if (!selectedPathologistId) return;
    try {
      setSubmitting(true);

      // Save current form values as draft first
      const values = form.getFieldsValue();
      await persistDraft(
        values,
        {
          pathologist_id: selectedPathologistId,
          is_screened: true,
          ...(!slideDispatchEnabled ? { status: "slide sent" } : {}),
        },
        buildScreeningSigners(selectedPathologistId),
      );

      setPathologistPickerOpen(false);
      message.success("Case sent to pathologist successfully");
      if (onBack) setTimeout(onBack, 800);
    } catch (err) {
      logger.error(err);
      message.error("Failed to send to pathologist.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviewPdf = async () => {
    try {
      setLoading(true);
      // Auto-save current form values so PDF reflects latest edits
      const values = form.getFieldsValue();
      await persistDraft(values);
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
              {isFormLocked && (
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
              disabled={isFormLocked}
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

            {isFormMode && (
              <>
                {diagnosis && (
                  <Button
                    icon={<FileTextOutlined />}
                    onClick={handlePreviewPdf}
                  >
                    Preview PDF
                  </Button>
                )}

                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={submitting}
                  onClick={() => form.submit()}
                  style={{ background: "#52c41a", border: "none" }}
                >
                  Save Draft
                </Button>

                {!isFinalized && diagnosis && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={submitting}
                    onClick={handleSendToPathologist}
                    style={{ background: "#722ed1", border: "none" }}
                  >
                    Send to Pathologist
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
            onRefresh={refetchCaseData}
          />
        )}

        {/* ── Finalized read-only view ── */}
        {diagnosis && isFinalized && (
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
            {/* ── Card 1: Specimen fields ── */}
            <StyledCard styles={{ body: { padding: "24px" } }}>
              <Row gutter={16}>
                <Col xs={24} sm={6}>
                  <Form.Item
                    name="specimen_type"
                    label="Specimen Type"
                    rules={[{ required: true }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select disabled={isFormLocked}>
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
                      disabled={isFormLocked}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item
                    name="received_volume_ml"
                    label="Volume (ml)"
                    style={{ marginBottom: 0 }}
                  >
                    <Input placeholder="e.g. 50" disabled={isFormLocked} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item label="Number of Slides" style={{ marginBottom: 0 }}>
                    <Input value={caseData?.slide_count ?? "—"} disabled />
                  </Form.Item>
                </Col>
              </Row>
            </StyledCard>

            {/* ── Diagnostic Flags ── */}
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
                        disabled={isFormLocked}
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
                        disabled={isFormLocked}
                        checkedChildren="Yes"
                        unCheckedChildren="No"
                      />
                    </Form.Item>
                  </div>
                </Col>
              </Row>
            </StyledCard>

            {/* ── Clinical + Gross — 2 separate cards side by side ── */}
            <Row gutter={16} align="stretch">
              <Col xs={24} lg={12}>
                <StyledCard
                  styles={{ body: { padding: "24px" } }}
                  style={{ height: "100%" }}
                >
                  <section>
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
                  </section>
                </StyledCard>
              </Col>
              <Col xs={24} lg={12}>
                <StyledCard
                  styles={{ body: { padding: "24px" } }}
                  style={{ height: "100%" }}
                >
                  <section>
                    <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Space>
                        <EyeOutlined style={{ color: "#595959" }} />
                        <Text strong style={{ textTransform: "uppercase" }}>
                          Gross Description
                        </Text>
                      </Space>
                      {!isFormLocked && (
                        <Button size="small" icon={<FileTextOutlined />} onClick={() => setGrossTemplateDrawerOpen(true)}>
                          Templates
                        </Button>
                      )}
                    </div>
                    <Form.Item name="gross_description" noStyle>
                      <SimpleTiptapEditor
                        placeholder="Describe received specimen, fluid volume, color, turbidity, slides..."
                        disabled={isFormLocked}
                        style={{ minHeight: "90px" }}
                      />
                    </Form.Item>
                  </section>
                </StyledCard>
              </Col>
            </Row>

            {/* ── Card 2: Diagnosis + Microscopic ── */}
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
                        {!isFormLocked && (
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
                          disabled={isFormLocked}
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
                          disabled={isFormLocked}
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
                          disabled={isFormLocked}
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
                      disabled={isFormLocked}
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

            {/* ── Card 5: IHC Panel ── */}
            {caseData?.is_cell_block && (
              <StyledCard styles={{ body: { padding: "24px" } }}>
                <NongyneIHCResultPanel
                  caseId={Number(caseId)}
                  isLocked={isFormLocked}
                />
              </StyledCard>
            )}

            {/* Cyto-Histo Correlation */}
            <CytoCorrelationManager
              caseId={Number(caseId)}
              caseType="nongyne"
              diagnosisSnapshot={diagnosis?.diagnosis ?? undefined}
              isLocked={isFormLocked}
            />

            {/* ── Comment + Signatories — same row ── */}
            <Row gutter={16} align="stretch">
              <Col xs={24} lg={24}>
                <StyledCard
                  styles={{ body: { padding: "24px" } }}
                  style={{ height: "100%" }}
                >
                  <section>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong style={{ textTransform: "uppercase" }}>
                        Comment &amp; Notes
                      </Text>
                    </div>
                    <Form.Item name="comment" noStyle>
                      <TextArea
                        autoSize={{ minRows: 3 }}
                        placeholder="Additional comments or remarks..."
                        disabled={isFormLocked}
                      />
                    </Form.Item>
                  </section>
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

      {/* ── Pathologist Picker Modal ── */}
      <Modal
        open={pathologistPickerOpen}
        title={
          <Space>
            <UserOutlined style={{ color: "#722ed1" }} />
            <span>Select Responsible Pathologist</span>
          </Space>
        }
        okText="Confirm & Continue"
        cancelText="Cancel"
        okButtonProps={{ disabled: !selectedPathologistId, type: "primary" }}
        onCancel={() => setPathologistPickerOpen(false)}
        onOk={handlePathologistPickerConfirm}
        width={480}
        centered
      >
        <div style={{ padding: "12px 0 8px" }}>
          <Select
            style={{ width: "100%" }}
            placeholder="Select pathologist..."
            value={selectedPathologistId}
            onChange={setSelectedPathologistId}
            options={pathologistOptions}
            showSearch
          />
          {!selectedPathologistId && (
            <div style={{ marginTop: 8, color: "#ff4d4f", fontSize: 12 }}>
              Please select a pathologist before continuing
            </div>
          )}
        </div>
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

export default NongyneDiagnosisEntryPage;

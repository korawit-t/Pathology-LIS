import React, { useCallback, useEffect, useState, useMemo } from "react";
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
  CameraOutlined,
  DeleteOutlined,
  PlusOutlined,
  ExperimentOutlined,
  EyeOutlined,
  PictureOutlined,
  UserOutlined,
  EditOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NotificationRuleService from "../../services/notificationRuleService";
import SystemSettingService from "../../services/systemSettingService";
import NongyneReportService from "../../services/nongyneReportService";
import NongyneCaseImageService, {
  NongyneCaseImage,
} from "../../services/nongyneCaseImageService";
import { API_BASE_URL } from "../../services/httpClient";
import UserService from "../../services/userService";
import { NongyneDiagnosisResponse } from "../../types/nongyneDiagnosis";
import { NongyneCytologyCase } from "../../types/nongyne";
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
import logger from "../../utils/logger";
import SecureImage from "../../components/SecureImage";
import CytoCorrelationManager from "../../components/CytoCorrelationManager";
import SimpleTiptapEditor from "../../components/Editors/SimpleTiptapEditor";
import DiagnosticTemplateSystem from "../Pathologist/SurgicalDiagnosticTemplate/DiagnosticTemplateSystem";
import GrossTemplateSystem from "../Gross/components/GrossTemplateSystem";

const { TextArea } = Input;
const { Text } = Typography;

interface NongyneDiagnosisEntryPageProps {
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

  const PATHO_ROLES: import("../../constants/roles.constants").UserRole[] = [
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

  const onFinish = async (values: any) => {
    try {
      setSubmitting(true);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        ...(currentUser?.id ? { cytotechnologist_id: currentUser.id } : {}),
      });
      setCaseData((prev) => ({
        ...prev,
        clinical_history,
        specimen_type,
        collection_site,
        received_volume_ml,
      }));

      if (diagnosis) {
        await NongyneDiagnosisService.update(diagnosis.id, diagnosisValues);
        message.success("Draft saved.");
      } else {
        await NongyneDiagnosisService.create({
          ...diagnosisValues,
          case_id: Number(caseId),
        });
        message.success("Draft saved.");
      }
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

  const handlePathologistPickerConfirm = async () => {
    if (!selectedPathologistId) return;
    try {
      setSubmitting(true);

      // Save current form values as draft first
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
        pathologist_id: selectedPathologistId,
        ...(currentUser?.id ? { cytotechnologist_id: currentUser.id } : {}),
        is_screened: true,
        ...(!slideDispatchEnabled ? { status: "slide sent" } : {}),
      });

      if (diagnosis) {
        await NongyneDiagnosisService.update(diagnosis.id, diagnosisValues);
      } else {
        await NongyneDiagnosisService.create({
          ...diagnosisValues,
          case_id: Number(caseId),
        });
      }

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
        ...(currentUser?.id ? { cytotechnologist_id: currentUser.id } : {}),
      });
      if (diagnosis) {
        await NongyneDiagnosisService.update(diagnosis.id, diagnosisValues);
      } else {
        await NongyneDiagnosisService.create({
          ...diagnosisValues,
          case_id: Number(caseId),
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
            {images.length > 0 && (
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
                              disabled={isFormLocked}
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
                              {!isFormLocked && (
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
                      {!isFormLocked && (
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

            {/* ── Card 5: IHC Panel ── */}
            {caseData?.is_cell_block && (
              <StyledCard styles={{ body: { padding: "24px" } }}>
                <NongyneIHCResultPanel
                  form={form}
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
                  pathologists={allUsers.map((u) => ({
                    value: u.id,
                    label: u.full_name ?? u.username ?? String(u.id),
                  }))}
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

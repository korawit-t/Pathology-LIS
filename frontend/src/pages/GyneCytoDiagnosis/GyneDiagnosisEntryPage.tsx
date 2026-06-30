import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Form,
  Input,
  Button,
  Select,
  Tag,
  Space,
  App,
  Spin,
  Alert,
  Typography,
  Row,
  Col,
  Modal,
  Badge,
  Tooltip,
  Switch,
  Checkbox,
  Drawer,
  Timeline,
  Table,
} from "antd";
import {
  SaveOutlined,
  ArrowLeftOutlined,
  EditOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  CheckCircleFilled,
  UnlockOutlined,
  LockOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  FilePdfOutlined,
  FileAddOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { GyneDiagnosisResponse } from "../../types/gyne-diagnosis";
import ReportPreviewModal from "../../components/ReportPreviewModal";
import StyledCard from "../../components/Layout/StyledCard";
import GyneCytologyImageCaptureModal from "./components/GyneCytologyImageCaptureModal";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import NotificationRuleService from "../../services/notificationRuleService";
import PatientInfoCard from "../../components/PatientInfoCard";
import PageContainer from "../../components/Layout/PageContainer";
import GynePathologistDiagnosisManager from "./components/GynePathologistDiagnosisManager";
import ConsultRequestModal from "../../components/InternalConsult/ConsultRequestModal";
import ConsultHistorySection from "../../components/InternalConsult/ConsultHistorySection";
import CytoCorrelationManager from "../../components/CytoCorrelationManager";
import type { SurgicalCase } from "../../types/surgical";
import logger from "../../utils/logger";
import { useGyneDiagnosisData } from "./hooks/useGyneDiagnosisData";
import GyneClinicalInfoCard from "./components/GyneClinicalInfoCard";
import GyneReportedResult from "./components/GyneReportedResult";
import GyneCytologyImagesSection from "./components/GyneCytologyImagesSection";
import GyneQCReviewSection from "./components/GyneQCReviewSection";
import GyneSignOffPage from "./components/GyneSignOffPage";

const { TextArea } = Input;
const { Text, Title } = Typography;

interface GyneDiagnosisEntryPageProps {
  caseId?: string | number;
  onBack?: () => void;
}

// ── Status helpers ──────────────────────────────────────────────────────────
type BadgeStatus = "success" | "processing" | "error" | "default" | "warning";
type GyneSigner = { user_id: number; role: string; signed_at?: string | null };
const CASE_STATUS_CONFIG: Record<
  string,
  { color: BadgeStatus; label: string }
> = {
  pending: { color: "default", label: "Pending" },
  in_progress: { color: "processing", label: "In Progress" },
  pending_review: { color: "error", label: "Pending Review" },
  pending_approval: { color: "warning", label: "Pending Approval" },
  published: { color: "success", label: "Reported" },
  reported: { color: "success", label: "Reported" },
};

const GyneDiagnosisEntryPage: React.FC<GyneDiagnosisEntryPageProps> = (
  props,
) => {
  const { caseId: propsCaseId, onBack } = props;
  const caseId = propsCaseId;
  const { message, notification } = App.useApp();
  const [form] = Form.useForm();

  const {
    caseData,
    setCaseData,
    diagnosis,
    setDiagnosis,
    images,
    descMap,
    setDescMap,
    categories,
    pathologists,
    currentUser,
    systemSettings,
    loading,
    loadingMaster,
    activeReportId,
    mainCategories,
    adequacyOptions,
    zoneOptions,
    defaultSigners,
    fetchDiagnosis,
    fetchCaseData,
    fetchImages,
    saveDesc,
  } = useGyneDiagnosisData(caseId, form);

  const [isPatientInfoExpanded, setIsPatientInfoExpanded] = useState(false);
  const [isRevision, setIsRevision] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [forceEdit, setForceEdit] = useState(false);
  const [isAbnormal, setIsAbnormal] = useState(false);
  const [completingReview, setCompletingReview] = useState(false);
  const [sendToPathoModalOpen, setSendToPathoModalOpen] = useState(false);
  const [selectedPathoId, setSelectedPathoId] = useState<number | null>(null);
  const [slideQualityModalOpen, setSlideQualityModalOpen] = useState(false);
  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [consultHistoryKey, setConsultHistoryKey] = useState(0);
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<
    import("../../services/gyneCaseImageService").GyneCaseImage | null
  >(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<GyneDiagnosisResponse[]>([]);
  const [historyCount, setHistoryCount] = useState(0);

  const completedCasePopupShownRef = useRef(false);
  const [completedCasePopupOpen, setCompletedCasePopupOpen] = useState(false);
  const [completedReports, setCompletedReports] = useState<any[]>([]);
  const [completedReportsLoading, setCompletedReportsLoading] = useState(false);
  const [selectedPopupReportId, setSelectedPopupReportId] = useState<number | null>(null);
  const [popupPdfUrl, setPopupPdfUrl] = useState<string | null>(null);
  const [popupPdfLoading, setPopupPdfLoading] = useState(false);

  const selectedCat1 = Form.useWatch("category_1_id", form);
  const subCategories = useMemo(
    () =>
      selectedCat1
        ? categories.filter((c) => c.parent_id === selectedCat1)
        : [],
    [categories, selectedCat1],
  );

  const SIGNERS_PATH = useMemo(() => ["signers"], []);
  const managerSettings = useMemo(
    () => ({
      require_all_pathologists_sign: systemSettings?.require_all_gyne_sign,
    }),
    [systemSettings?.require_all_gyne_sign],
  );

  const isFinalized = useMemo(
    () =>
      (caseData?.status as string) === "pending_approval" ||
      (caseData?.status as string) === "pending_review" ||
      (caseData?.status as string) === "published",
    [caseData],
  );

  const isPathologist = useMemo(
    () =>
      !!currentUser?.roles?.includes("pathologist") ||
      !!currentUser?.roles?.includes("senior_pathologist"),
    [currentUser],
  );

  const isPendingReview = caseData?.status === "pending_review";

  // Set default signers when no diagnosis exists
  useEffect(() => {
    if (!loading && !diagnosis && caseData) {
      const current = form.getFieldValue("signers");
      if ((!current || current.length === 0) && defaultSigners.length > 0)
        form.setFieldValue("signers", defaultSigners);
    }
  }, [loading, diagnosis, caseData, defaultSigners, form]);

  // Add current user to signers on revision after disagree
  useEffect(() => {
    if (isRevision && caseData?.review_result === "disagree" && currentUser) {
      const current: GyneSigner[] = form.getFieldValue("signers") || [];
      const alreadyIn = current.some(
        (s) => Number(s.user_id) === Number(currentUser.id),
      );
      if (!alreadyIn) {
        form.setFieldValue("signers", [
          ...current,
          {
            user_id: currentUser.id,
            role: "co-sign pathologist",
            signed_at: null,
          },
        ]);
      }
    }
  }, [isRevision, caseData?.review_result, currentUser, form]);

  // Sync isAbnormal from selected category
  useEffect(() => {
    if (!selectedCat1) return;
    const cat = mainCategories.find((c) => c.id === selectedCat1);
    if (cat) {
      setIsAbnormal(cat.code?.startsWith("3") ?? false);
    }
  }, [selectedCat1, mainCategories]);

  useEffect(() => {
    if (!caseId || !diagnosis) return;
    GyneDiagnosisService.getHistory(Number(caseId))
      .then((data) => setHistoryCount(data.length))
      .catch(() => {});
  }, [caseId, diagnosis]);

  // Auto-show popup once when entering a finalized case
  useEffect(() => {
    if (caseData && isFinalized && !completedCasePopupShownRef.current) {
      completedCasePopupShownRef.current = true;
      setCompletedCasePopupOpen(true);
    }
  }, [caseData?.id, caseData?.status, isFinalized]);

  // Load report list when popup opens
  useEffect(() => {
    if (!completedCasePopupOpen || !caseId) return;
    setCompletedReportsLoading(true);
    GyneDiagnosisService.getReportsByCase(Number(caseId))
      .then((reports: any[]) => {
        setCompletedReports(reports);
        if (reports[0]) setSelectedPopupReportId(reports[0].id);
      })
      .catch(() => {})
      .finally(() => setCompletedReportsLoading(false));
  }, [completedCasePopupOpen, caseId]);

  // Load PDF when selected report changes
  useEffect(() => {
    if (!selectedPopupReportId) { setPopupPdfUrl(null); return; }
    let activeUrl: string | null = null;
    setPopupPdfLoading(true);
    GyneDiagnosisService.getReportPdf(selectedPopupReportId)
      .then((blob) => {
        activeUrl = URL.createObjectURL(blob);
        setPopupPdfUrl(activeUrl);
      })
      .catch(() => {})
      .finally(() => setPopupPdfLoading(false));
    return () => { if (activeUrl) URL.revokeObjectURL(activeUrl); };
  }, [selectedPopupReportId]);

  const handleToggleOutLabConsult = async (checked: boolean) => {
    if (!caseId) return;
    try {
      await GyneCytologyCaseService.update(Number(caseId), {
        is_out_lab_consult: checked,
      });
      setCaseData((prev) =>
        prev ? { ...prev, is_out_lab_consult: checked } : prev,
      );
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

  const sanitizeSigners = (values: any) => {
    if (values.signers) {
      values.signers = values.signers.map((s: any) => ({
        ...s,
        signed_at: s.signed_at || null,
      }));
    }
    return values;
  };

  const onFinish = async (values: any) => {
    try {
      setSubmitting(true);
      // Convert undefined → null so cleared fields are sent in the payload
      for (const key of Object.keys(values)) {
        if (values[key] === undefined) values[key] = null;
      }
      sanitizeSigners(values);
      const isRequireAllSign = systemSettings?.require_all_gyne_sign;

      if (isRequireAllSign && diagnosis && !isRevision) {
        const hasExistingSignatures = diagnosis.signers?.some(
          (s) => !!s.signed_at,
        );
        if (hasExistingSignatures && values.signers) {
          values.signers = (values.signers as GyneSigner[]).map((s) => ({
            ...s,
            signed_at: null,
          }));
        }
      }

      if (diagnosis && isRevision) {
        // Reset all signatures — revision starts unsigned
        values.signers = (values.signers || []).map((s: GyneSigner) => ({
          ...s,
          signed_at: null,
        }));

        if (caseData?.review_result === "disagree" && currentUser) {
          const signersList: GyneSigner[] = values.signers || [];
          const alreadyInList = signersList.some(
            (s) => Number(s.user_id) === Number(currentUser.id),
          );
          if (!alreadyInList) {
            values.signers = [
              ...signersList,
              {
                user_id: currentUser.id,
                role: "co-sign pathologist",
                signed_at: null,
              },
            ];
          }
        }
        await GyneDiagnosisService.reviseReport(diagnosis.id, values);
        message.success("Revised report saved successfully.");
        setIsRevision(false);
        await fetchCaseData();
      } else if (diagnosis) {
        await GyneDiagnosisService.updateDiagnosis(diagnosis.id, values);
        message.success("Draft saved.");
      } else {
        await GyneDiagnosisService.createInitial({
          ...values,
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

  const handlePreviewPDF = async () => {
    if (!caseId) return;
    try {
      if (diagnosis && !isRevision) {
        const values = form.getFieldsValue();
        sanitizeSigners(values);
        await GyneDiagnosisService.updateDiagnosis(diagnosis.id, values);
      }
      const blob = await GyneDiagnosisService.previewReportPdf(Number(caseId));
      setPdfUrl(URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch {
      message.error("Failed to generate PDF preview.");
    }
  };

  const handleOpenHistory = async () => {
    if (!caseId) return;
    try {
      const data = await GyneDiagnosisService.getHistory(Number(caseId));
      setHistoryList(data);
      setHistoryCount(data.length);
      setHistoryOpen(true);
    } catch {
      message.error("Failed to load history.");
    }
  };

  const handleViewFinalPDF = async () => {
    if (!diagnosis || !isFinalized) return;
    try {
      const reports = (await GyneDiagnosisService.getReportsByCase(
        Number(caseId),
      )) as { id: number }[];
      if (reports[0]) {
        const blob = await GyneDiagnosisService.getReportPdf(reports[0].id);
        setPdfUrl(URL.createObjectURL(blob));
        setPreviewOpen(true);
      }
    } catch {
      message.error("Failed to load report.");
    }
  };

  const handleFinalizeClick = () => {
    setSlideQualityModalOpen(true);
  };

  const handleFinalize = async (
    sq: string | null = null,
    stq: string | null = null,
  ) => {
    if (!caseId || !currentUser) return;
    try {
      setFinalizing(true);
      const signers: GyneSigner[] = form.getFieldValue("signers") || [];
      const isRequireAllSign = systemSettings?.require_all_gyne_sign ?? false;
      const now = new Date().toISOString();
      let updatedSigners: GyneSigner[] = [...signers];
      let allSigned = true;

      if (isRequireAllSign) {
        let userFound = false;
        updatedSigners = updatedSigners.map((s) => {
          if (Number(s.user_id) === Number(currentUser?.id)) {
            userFound = true;
            if (!s.signed_at) return { ...s, signed_at: now };
          } else if (forceEdit) {
            return { ...s, signed_at: null };
          }
          return s;
        });
        if (!userFound) {
          message.warning(
            "You are not in the signers list. Please add yourself before finalizing.",
          );
          setFinalizing(false);
          return;
        }
        allSigned = updatedSigners.every((s) => !!s.signed_at);
      } else {
        updatedSigners = updatedSigners.map((s) => ({
          ...s,
          signed_at: s.signed_at || now,
        }));
        allSigned = true;
      }

      form.setFieldValue("signers", updatedSigners);
      await GyneCytologyCaseService.update(Number(caseId), {
        slide_quality: sq ?? undefined,
        stain_quality: stq ?? undefined,
      });
      if (diagnosis) {
        await GyneDiagnosisService.updateDiagnosis(diagnosis.id, {
          signers: updatedSigners,
        });
        setDiagnosis({ ...diagnosis, signers: updatedSigners });
      }

      if (allSigned) {
        const result = await GyneDiagnosisService.publishReport(
          Number(caseId),
          updatedSigners,
          isAbnormal,
        );
        if (result.status === "published") {
          notification.success({
            title: "NILM — Report Published",
            description:
              "Report has been published directly. No pathologist review required.",
            placement: "topRight",
          });
        } else {
          notification.warning({
            title: "Awaiting Pathologist Review",
            description:
              "This case has been randomly selected for QC — please collect the slide and send for review before publishing.",
            placement: "topRight",
            duration: 0,
          });
        }

      } else {
        message.success("Signed. Waiting for other co-signers.");
      }

      fetchDiagnosis();
      if (onBack) onBack();
    } catch (err) {
      logger.error(err);
      message.error("Failed to finalize report.");
    } finally {
      setFinalizing(false);
    }
  };

  const handleUnlockAndReset = () => {
    Modal.confirm({
      title: "Unlock & Edit Report",
      content: (
        <div>
          <p>
            Unlocking will <b>reset all signatures</b>.
          </p>
          <p style={{ color: "#ff4d4f" }}>
            All signers will need to sign again.
          </p>
        </div>
      ),
      okText: "Unlock & Reset",
      okType: "danger",
      onOk: () => {
        const resetSigners = (form.getFieldValue("signers") || []).map((s) => ({
          ...s,
          signed_at: null,
        }));
        form.setFieldValue("signers", resetSigners);
        setForceEdit(true);
        message.info("Report unlocked. All signatures have been reset.");
      },
    });
  };

  const handleSendToPathologistClick = () => {
    const signers: GyneSigner[] = form.getFieldValue("signers") || [];
    const existing = signers.find((s) => s.role === "pathologist");
    setSelectedPathoId(existing?.user_id ?? null);
    setSendToPathoModalOpen(true);
  };

  const handleSendToPathoConfirm = () => {
    if (!selectedPathoId) {
      message.warning("Please select a pathologist.");
      return;
    }
    const current: GyneSigner[] = form.getFieldValue("signers") || [];
    const alreadyIn = current.some((s) => s.user_id === selectedPathoId);
    if (!alreadyIn) {
      const withoutOtherPatho = current.filter((s) => s.role !== "pathologist");
      form.setFieldValue("signers", [
        ...withoutOtherPatho,
        { user_id: selectedPathoId, role: "pathologist", signed_at: null },
      ]);
    }
    setSendToPathoModalOpen(false);
    handleFinalize(null, null);
  };

  const handleCompleteReview = async (
    result: "agree" | "disagree",
    note?: string,
    level?: "minor" | "major" | null,
  ) => {
    if (!caseId) return;
    try {
      setCompletingReview(true);
      await GyneDiagnosisService.completeReview(
        Number(caseId),
        result,
        note,
        level ?? undefined,
      );
      message.success(
        result === "agree"
          ? "Agreed — case published."
          : "Discordance recorded — case returned to cytotechnologist.",
      );
      const updated = await GyneCytologyCaseService.getById(Number(caseId));
      setCaseData(updated);
      if (result === "agree" && onBack) onBack();
      if (result === "disagree") {
        setIsRevision(true);
      }
    } catch {
      message.error("Failed to complete review.");
    } finally {
      setCompletingReview(false);
    }
  };

  const isPrimary = useMemo(() => {
    if (!diagnosis || !currentUser) return true;
    const primary = diagnosis.signers?.find((s) => s.role === "pathologist");
    return primary?.user_id === currentUser.id;
  }, [diagnosis, currentUser]);

  const isCoSigner = useMemo(() => {
    if (!diagnosis || !currentUser) return false;
    return diagnosis.signers?.some(
      (s) => s.user_id === currentUser.id && s.role.startsWith("co-sign"),
    );
  }, [diagnosis, currentUser]);

  const isFormMode = !diagnosis || isRevision || !isFinalized;
  const isFormLocked =
    (isFinalized && !isRevision) || (isCoSigner && !forceEdit);

  const isPrimarySigned = useMemo(() => {
    if (!diagnosis?.signers) return false;
    const patho = diagnosis.signers.find((s) => s.role === "pathologist");
    const cyto = diagnosis.signers.find((s) => s.role === "cytotechnologist");
    if (patho) return !!patho.signed_at;
    if (cyto) return !!cyto.signed_at;
    return false;
  }, [diagnosis]);

  const isCurrentUserSigned = useMemo(() => {
    if (!diagnosis || !currentUser) return false;
    return !!diagnosis.signers?.find((s) => s.user_id === currentUser.id)
      ?.signed_at;
  }, [diagnosis, currentUser]);

  const canCoSignConfirm = useMemo(
    () => isCoSigner && isPrimarySigned && !isCurrentUserSigned,
    [isCoSigner, isPrimarySigned, isCurrentUserSigned],
  );

  const caseStatus = caseData?.status;
  const statusConfig = CASE_STATUS_CONFIG[caseStatus] ?? {
    color: "default",
    label: caseStatus,
  };

  if (loading || loadingMaster)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" tip="Loading..." />
      </div>
    );

  return (
    <PageContainer withCard>
      {/* ── Sticky Toolbar ───────────────────────────────────────────── */}
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
                status={statusConfig.color}
                text={
                  <Text style={{ fontSize: 13 }}>{statusConfig.label}</Text>
                }
              />
              {isRevision && <Tag color="orange">Revision Mode</Tag>}
              {isFormLocked && (
                <Tooltip title="Form is locked">
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
              disabled={isFormLocked && !isRevision}
            >
              Out-Lab Consult
            </Checkbox>

            {isPendingReview &&
              isPathologist &&
              caseData?.review_reason === "abnormal" && (
                <Button
                  type="primary"
                  icon={<CheckCircleFilled />}
                  loading={completingReview}
                  onClick={() => handleCompleteReview("agree")}
                  style={{ background: "#722ed1", border: "none" }}
                >
                  Mark as Reviewed
                </Button>
              )}

            {diagnosis && historyCount > 0 && (
              <Badge count={historyCount} size="small">
                <Button icon={<HistoryOutlined />} onClick={handleOpenHistory}>
                  History
                </Button>
              </Badge>
            )}

            {diagnosis && isFinalized && !isRevision && (
              <>
                <Button
                  icon={<FileTextOutlined />}
                  onClick={handleViewFinalPDF}
                >
                  View Report
                </Button>
                {!isPendingReview && (
                  <Button
                    danger
                    icon={<EditOutlined />}
                    onClick={() => {
                      form.setFieldValue("revised_reason", undefined);
                      setIsRevision(true);
                    }}
                  >
                    Revise
                  </Button>
                )}
              </>
            )}

            {isFormMode && (
              <>
                {!isCurrentUserSigned || forceEdit || isRevision ? (
                  <>
                    {diagnosis && (
                      <Button
                        icon={<FileTextOutlined />}
                        onClick={handlePreviewPDF}
                      >
                        Preview PDF
                      </Button>
                    )}

                    {canCoSignConfirm ? (
                      <Button
                        type="primary"
                        icon={<CheckCircleFilled />}
                        loading={finalizing}
                        onClick={handleFinalizeClick}
                        style={{ background: "#52c41a", border: "none" }}
                      >
                        Confirm & Sign
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="primary"
                          icon={<SaveOutlined />}
                          loading={submitting}
                          disabled={finalizing}
                          onClick={() => form.submit()}
                          style={{ background: "#52c41a", border: "none" }}
                        >
                          {isRevision ? "Save Draft Revision" : "Save Draft"}
                        </Button>
                        {(!isFinalized || isRevision) && diagnosis && (
                          <Button
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            loading={finalizing}
                            onClick={
                              isAbnormal
                                ? handleSendToPathologistClick
                                : handleFinalizeClick
                            }
                            disabled={
                              submitting || (isCoSigner && !isPrimarySigned)
                            }
                            style={{
                              background: isAbnormal ? "#fa8c16" : "#cf1322",
                              border: "none",
                            }}
                          >
                            {isAbnormal
                              ? "Send to Pathologist"
                              : isPrimary
                                ? "Sign-off"
                                : "Confirm & Sign-off"}
                          </Button>
                        )}
                      </>
                    )}
                  </>
                ) : null}
              </>
            )}
          </Space>
        </div>
      </div>

      {/* ── Patient Info ─────────────────────────────────────────────── */}
      <div style={{ padding: "0 24px 8px" }}>
        <PatientInfoCard
          activeCase={caseData as unknown as SurgicalCase}
          activeCaseType="gyne"
          activeCaseId={caseId ? Number(caseId) : undefined}
          isExpanded={isPatientInfoExpanded}
          onToggle={(state) => setIsPatientInfoExpanded(state)}
        />
      </div>

      {/* ── Gyne Clinical Info ───────────────────────────────────────── */}
      {caseData && <GyneClinicalInfoCard caseData={caseData} />}

      <div style={{ padding: "0 24px 32px" }}>
        {/* ── QC Review Banner + Discordance Banner ────────────────────── */}
        <GyneQCReviewSection
          caseData={caseData}
          isPendingReview={isPendingReview}
          isPathologist={isPathologist}
          completingReview={completingReview}
          onAgree={() => handleCompleteReview("agree")}
          onDisagree={(note, level) =>
            handleCompleteReview("disagree", note, level)
          }
        />

        {/* ── Finalized view ───────────────────────────────────────────── */}
        {diagnosis && isFinalized && !isRevision && (
          <GyneReportedResult diagnosis={diagnosis} images={images} />
        )}

        {/* ── Edit / Create Form ───────────────────────────────────────── */}
        {isFormMode && (
          <Form
            form={form}
            layout="vertical"
            disabled={isCurrentUserSigned && !forceEdit && !isRevision}
            onFinish={onFinish}
          >
            {/* Alert banners */}
            {isRevision && (
              <Alert
                icon={<ExclamationCircleOutlined />}
                message="Revision Mode — A new version will be created. The original is preserved."
                type="warning"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}
            {isCurrentUserSigned && !forceEdit && !isRevision && (
              <Alert
                message="You have already signed this report."
                description="Editing will reset all signatures and require re-signing."
                type="success"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
                action={
                  <Button
                    size="small"
                    danger
                    disabled={false}
                    onClick={() => setForceEdit(true)}
                  >
                    Unlock & Edit
                  </Button>
                }
              />
            )}

            <Row gutter={16} align="stretch" style={{ marginBottom: 16 }}>
              {/* ── Specimen Adequacy ── */}
              <Col
                xs={24}
                lg={12}
                style={{ display: "flex", flexDirection: "column" }}
              >
                <StyledCard
                  size="small"
                  title={
                    <Title
                      level={5}
                      style={{
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "1.2px",
                        fontWeight: 600,
                      }}
                    >
                      Specimen Adequacy
                    </Title>
                  }
                  style={{ flex: 1 }}
                >
                  <Form.Item
                    name="adequacy_id"
                    label="Adequacy"
                    rules={[{ required: true, message: "Required" }]}
                  >
                    <Select
                      placeholder="Select adequacy"
                      allowClear
                      size="large"
                    >
                      {adequacyOptions.map((opt) => (
                        <Select.Option key={opt.id} value={opt.id}>
                          {opt.code ? `(${opt.code}) ` : ""}
                          {opt.text}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="endocervical_status_id"
                    label="Endocervical / Transformation Zone"
                  >
                    <Select placeholder="Select status" allowClear size="large">
                      {zoneOptions.map((opt) => (
                        <Select.Option key={opt.id} value={opt.id}>
                          {opt.code ? `(${opt.code}) ` : ""}
                          {opt.text}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </StyledCard>
              </Col>

              {/* ── Diagnosis Category ── */}
              <Col
                xs={24}
                lg={12}
                style={{ display: "flex", flexDirection: "column" }}
              >
                <StyledCard
                  size="small"
                  title={
                    <Title
                      level={5}
                      style={{
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "1.2px",
                        fontWeight: 600,
                      }}
                    >
                      Diagnosis Category
                    </Title>
                  }
                  style={{ flex: 1 }}
                >
                  <Form.Item
                    name="category_1_id"
                    label="Main Category"
                  >
                    <Select
                      placeholder="Select main category"
                      onChange={() => form.setFieldValue("category_2_id", null)}
                      disabled={isFormLocked}
                      allowClear
                      size="large"
                    >
                      {mainCategories.map((c) => (
                        <Select.Option key={c.id} value={c.id}>
                          <b>{c.code}</b> — {c.text}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="category_2_id"
                    label="Sub Category"
                    dependencies={["category_1_id"]}
                  >
                    <Select
                      placeholder="Select sub category (optional)"
                      allowClear
                      disabled={!selectedCat1 || isFormLocked}
                      size="large"
                    >
                      {subCategories.map((c) => (
                        <Select.Option key={c.id} value={c.id}>
                          <b>{c.code}</b> — {c.text}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>

                  {!isCoSigner && !isRevision && (
                    <Form.Item label="Result Type">
                      <Space>
                        <Switch
                          checked={isAbnormal}
                          onChange={setIsAbnormal}
                          checkedChildren="Abnormal"
                          unCheckedChildren="NILM"
                          disabled={isFormLocked}
                          style={{
                            background: isAbnormal ? "#fa8c16" : undefined,
                          }}
                        />
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                        >
                          {isAbnormal
                            ? "Will route to pathologist for review"
                            : "Normal result — will finalize after sign-off"}
                        </Typography.Text>
                      </Space>
                    </Form.Item>
                  )}

                  <Form.Item name="interpretation" label="Interpretation">
                    <TextArea
                      rows={2}
                      placeholder="Additional diagnostic details..."
                      disabled={isFormLocked}
                    />
                  </Form.Item>
                </StyledCard>
              </Col>
            </Row>

            {/* ── Notes ── */}
            <StyledCard
              size="small"
              title={
                <Title
                  level={5}
                  style={{
                    margin: 0,
                    textTransform: "uppercase",
                    letterSpacing: "1.2px",
                    fontWeight: 600,
                  }}
                >
                  Notes & Recommendation
                </Title>
              }
              style={{ marginBottom: 16 }}
            >
              <Row gutter={16}>
                <Col xs={24} lg={isRevision ? 12 : 24}>
                  <Form.Item
                    name="note"
                    label="Additional Notes / Recommendation"
                  >
                    <TextArea
                      rows={3}
                      placeholder="Recommendations or remarks..."
                      disabled={isFormLocked}
                    />
                  </Form.Item>
                </Col>
                {isRevision && (
                  <Col xs={24} lg={12}>
                    <Form.Item
                      name="revised_reason"
                      label="Reason for Revision"
                      rules={[
                        {
                          required: true,
                          message: "Please specify the reason for revision.",
                        },
                        {
                          min: 5,
                          message: "Reason must be at least 5 characters.",
                        },
                      ]}
                    >
                      <TextArea
                        rows={3}
                        placeholder="Explain why this report is being revised..."
                      />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            </StyledCard>

            {/* ── Cytology Images ── */}
            <GyneCytologyImagesSection
              images={images}
              descMap={descMap}
              isFormLocked={isFormLocked}
              onDescChange={(imgId, value) =>
                setDescMap((prev) => ({ ...prev, [imgId]: value }))
              }
              onDescSave={saveDesc}
              onRefresh={fetchImages}
              onEdit={(img) => {
                setEditingImage(img);
                setImageCaptureOpen(true);
              }}
              onCapture={() => {
                setEditingImage(null);
                setImageCaptureOpen(true);
              }}
            />

            {/* ── Signers ── */}
            {isCoSigner && !forceEdit && !isCurrentUserSigned && (
              <Button
                icon={<UnlockOutlined />}
                onClick={handleUnlockAndReset}
                style={{ marginBottom: 12 }}
              >
                Unlock & Edit
              </Button>
            )}
            <GynePathologistDiagnosisManager
              form={form}
              pathologists={pathologists}
              defaultSigners={defaultSigners}
              isLocked={isFormLocked}
              namePath={SIGNERS_PATH}
              settings={managerSettings}
              hideCT={isCoSigner}
            />

            <CytoCorrelationManager
              caseId={Number(caseId)}
              caseType="gyne"
              diagnosisSnapshot={diagnosis?.interpretation ?? undefined}
              isLocked={isFormLocked}
            />

            {activeReportId && (
              <>
                <Button
                  size="small"
                  style={{ marginTop: 10 }}
                  onClick={() => setConsultModalOpen(true)}
                >
                  Request Internal Consult
                </Button>
                <ConsultHistorySection
                  caseType="gyne"
                  reportId={activeReportId}
                  currentUserId={currentUser?.id}
                  refreshKey={consultHistoryKey}
                />
                <ConsultRequestModal
                  open={consultModalOpen}
                  onClose={() => setConsultModalOpen(false)}
                  onSuccess={() => setConsultHistoryKey((k) => k + 1)}
                  caseType="gyne"
                  reportId={activeReportId}
                  pathologists={pathologists.map((p: any) => ({
                    value: p.id ?? p.value,
                    label: p.full_name ?? p.label,
                  }))}
                />
              </>
            )}

            {/* ── Revision cancel ── */}
            {isRevision && (
              <div style={{ textAlign: "right" }}>
                <Button onClick={() => setIsRevision(false)}>
                  Cancel Revision
                </Button>
              </div>
            )}
          </Form>
        )}
      </div>

      {/* ── Send to Pathologist Modal ── */}
      <Modal
        title="Send to Pathologist"
        open={sendToPathoModalOpen}
        onCancel={() => setSendToPathoModalOpen(false)}
        onOk={handleSendToPathoConfirm}
        okText="Confirm & Send"
        okButtonProps={{ style: { background: "#fa8c16", border: "none" } }}
        confirmLoading={finalizing}
      >
        <p style={{ marginBottom: 16, color: "#595959" }}>
          This case is flagged as <b style={{ color: "#fa8c16" }}>abnormal</b>.
          Select a pathologist to assign for review.
        </p>
        <Select
          showSearch
          placeholder="Select pathologist"
          style={{ width: "100%" }}
          value={selectedPathoId}
          onChange={(val) => setSelectedPathoId(val)}
          options={pathologists
            .filter((p) =>
              p.roles?.some(
                (r) => r === "pathologist" || r === "senior_pathologist",
              ),
            )
            .map((p) => ({
              value: p.id,
              label: p.full_name ?? `User #${p.id}`,
            }))}
        />
      </Modal>

      {/* ── Slide Quality Modal ── */}
      <GyneSignOffPage
        open={slideQualityModalOpen}
        caseId={caseId}
        caseData={caseData}
        finalizing={finalizing}
        onClose={() => setSlideQualityModalOpen(false)}
        onFinalize={handleFinalize}
      />

      <ReportPreviewModal
        open={previewOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setPreviewOpen(false)}
      />

      <GyneCytologyImageCaptureModal
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

      {/* ── Case Already Signed Off popup ── */}
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
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <Typography.Text strong style={{ fontSize: 15 }}>
                  {caseData?.accession_no}
                </Typography.Text>
                <Tag color="green" style={{ margin: 0 }}>SIGNED</Tag>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {[caseData?.patient?.title?.title, caseData?.patient?.name, caseData?.patient?.ln]
                  .filter(Boolean).join(" ") || "—"}
              </div>
              <div style={{ fontSize: 12, color: "#595959", marginTop: 2 }}>
                HN: {caseData?.patient?.hn || "—"}
              </div>
            </div>

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
                  danger
                  onClick={() => {
                    form.setFieldValue("revised_reason", undefined);
                    setIsRevision(true);
                    setCompletedCasePopupOpen(false);
                  }}
                >
                  Revise Report
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
                  background: selectedPopupReportId === record.id ? "#e6f4ff" : undefined,
                },
              })}
              columns={[
                {
                  title: "Ver.",
                  dataIndex: "version_no",
                  width: 50,
                  render: (_: any, __: any, idx: number) => `#${idx + 1}`,
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  width: 100,
                  render: (s: string) => (
                    <Tag
                      color={s === "published" ? "green" : s === "pending_approval" ? "orange" : "default"}
                      style={{ margin: 0 }}
                    >
                      {s?.replace("_", " ").toUpperCase()}
                    </Tag>
                  ),
                },
                {
                  title: "Date",
                  dataIndex: "created_at",
                  render: (d: string) => d ? dayjs(d).format("DD/MM/YY HH:mm") : "—",
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
                <iframe src={popupPdfUrl} width="100%" height="100%" style={{ border: "none" }} title="Report PDF" />
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
        title="Diagnosis History"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={480}
      >
        <Timeline
          items={historyList.map((h) => ({
            color: h.is_current ? "green" : "gray",
            children: (
              <div>
                <Space>
                  <Text strong>Version {h.version}</Text>
                  {h.is_current && <Tag color="green">Current</Tag>}
                </Space>
                <div style={{ color: "#595959", fontSize: 12, marginTop: 2 }}>
                  {h.updated_at
                    ? new Date(h.updated_at).toLocaleString()
                    : new Date(h.created_at).toLocaleString()}
                </div>
                {h.revised_reason && (
                  <div style={{ marginTop: 4, color: "#fa8c16", fontSize: 12 }}>
                    Reason: {h.revised_reason}
                  </div>
                )}
                {h.adequacy_obj && (
                  <div style={{ fontSize: 12, marginTop: 2, color: "#434343" }}>
                    Adequacy: {h.adequacy_obj.text}
                  </div>
                )}
                {h.category_1_obj && (
                  <div style={{ fontSize: 12, color: "#434343" }}>
                    Category: {h.category_1_obj.code} — {h.category_1_obj.text}
                  </div>
                )}
              </div>
            ),
          }))}
        />
      </Drawer>
    </PageContainer>
  );
};

export default GyneDiagnosisEntryPage;

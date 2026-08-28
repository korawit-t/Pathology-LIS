import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Form,
  Input,
  Button,
  message,
  Spin,
  Alert,
  Typography,
  Row,
  Col,
  Drawer,
} from "antd";
import { ExclamationCircleOutlined, AlertOutlined } from "@ant-design/icons";

import NongyneDiagnosisService from "../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../services/nongyneCytoCaseService";
import NotificationRuleService from "../../services/notificationRuleService";
import NongyneReportService from "../../services/nongyneReportService";
import type { NongyneCaseImage } from "../../services/nongyneCaseImageService";
import { NongyneDiagnosisResponse } from "../../types/nongyneDiagnosis";
import { NongyneCytologyCase } from "../../types/nongyne";
import type { BadgeProps } from "antd";
import {
  useNongyneDiagnosisData,
  type NongyneOnFinishValues,
} from "./hooks/useNongyneDiagnosisData";
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
import DiagnosticFlagToggle from "./components/DiagnosticFlagToggle";
import NongyneSpecimenFieldsCard from "./components/NongyneSpecimenFieldsCard";
import NongyneClinicalGrossSection from "./components/NongyneClinicalGrossSection";
import NongynePreviousReportCard from "./components/NongynePreviousReportCard";
import NongyneDiagnosisFormSection from "./components/NongyneDiagnosisFormSection";
import NongyneDiagnosisToolbar from "./components/NongyneDiagnosisToolbar";
import NongyneCompletedCaseModal from "./components/NongyneCompletedCaseModal";
import NongyneFinalizedResultCard from "./components/NongyneFinalizedResultCard";
import NongyneCytologyImageCaptureModal from "./components/NongyneCytologyImageCaptureModal";
import logger from "../../utils/logger";
import CytoCorrelationManager from "../../components/CytoCorrelationManager";
import CytoPathConcordanceCard from "../../components/CytoPathConcordanceCard";
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
    submitting,
    setSubmitting,
    activeReportId,
    defaultSigners,
    fetchDiagnosis,
    fetchCaseData,
    fetchImages,
    saveDesc,
    saveDraft,
    finalize,
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
      const { isCreate } = await saveDraft(values, { isAddendumMode, prevDiagnosis });
      message.success("Draft saved.");
      fetchDiagnosis(isCreate);
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

  const handleCancelAddendum = () => {
    setIsAddendumMode(false);
    setPrevDiagnosis(null);
    fetchDiagnosis();
  };

  // Sign-off saves the draft first, so the signed report always reflects
  // what's on screen — the pathologist no longer has to remember to press
  // Save Draft before Sign-off. Mirrors Surgical's handleOpenFinalizeModal,
  // which already awaits its save before opening the finalize page.
  // validateFields (not getFieldsValue) so this goes through the exact same
  // required-field gate as the Save Draft button's form.submit().
  const handleFinalizeClick = async () => {
    let values: NongyneOnFinishValues;
    try {
      values = await form.validateFields();
    } catch (errInfo) {
      // The diagnosis Form.Item is noStyle, so it renders no inline error of
      // its own — surface the rule's message and scroll to the offending
      // field, or a blocked click just looks like a dead button.
      const { errorFields } = (errInfo ?? {}) as {
        errorFields?: { name: (string | number)[]; errors: string[] }[];
      };
      const firstError = errorFields?.[0];
      if (firstError) form.scrollToField(firstError.name);
      message.error(
        firstError?.errors?.[0] ??
          "Please complete the required fields before signing off.",
      );
      return;
    }
    try {
      setSubmitting(true);
      const { isCreate } = await saveDraft(values, { isAddendumMode, prevDiagnosis });
      // Awaited (unlike onFinish's fire-and-forget) so `diagnosis` is in
      // state before the sign-off page opens — finalize() bails out without
      // it, which would silently no-op a freshly created addendum.
      await fetchDiagnosis(isCreate);
    } catch (err) {
      logger.error(err);
      message.error("Failed to save the draft — sign-off cancelled.");
      return;
    } finally {
      setSubmitting(false);
    }
    setSlideQualityModalOpen(true);
  };

  const handleFinalize = async (
    slideQuality: string | null,
    stainQuality: string | null,
    qualityComment: string,
    isCasePending: boolean,
    pendingReason: string,
  ) => {
    const ok = await finalize(
      currentUser?.id,
      slideQuality,
      stainQuality,
      qualityComment,
      isCasePending,
      pendingReason,
    );
    if (ok && onBack) setTimeout(onBack, 800);
  };

  const handleOutLabConsult = async (
    reason: string,
    slideQuality: string,
    stainQuality: string,
    qualityComment: string,
  ) => {
    const ok = await finalize(
      currentUser?.id,
      slideQuality,
      stainQuality,
      qualityComment,
      true,
      "Out-Lab Consult — awaiting results",
      { reason },
    );
    if (ok && onBack) setTimeout(onBack, 800);
  };

  // Both Preview PDF and View Report render regardless of
  // isPreviewModalVisible, so a second click before closing the modal
  // would otherwise overwrite previewPdfUrl without revoking the URL it
  // replaces — a real, if minor, leak.
  const showPreviewPdf = (blob: Blob) => {
    setPreviewPdfUrl((prev) => {
      if (prev) window.URL.revokeObjectURL(prev);
      return window.URL.createObjectURL(blob);
    });
    setIsPreviewModalVisible(true);
  };

  const handlePreviewPdf = async () => {
    try {
      setLoading(true);
      const values = form.getFieldsValue();
      await saveDraft(values, { isAddendumMode, prevDiagnosis });
      const blob = await NongyneDiagnosisService.previewReportPdf(
        Number(caseId),
      );
      showPreviewPdf(blob);
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
      showPreviewPdf(blob);
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
      <NongyneDiagnosisToolbar
        caseId={caseId}
        caseData={caseData}
        statusConfig={statusConfig}
        isAddendumMode={isAddendumMode}
        isEditorLocked={isEditorLocked}
        isConsultEditorLocked={isConsultEditorLocked}
        isFinalized={isFinalized}
        isFormMode={isFormMode}
        isFinalizeLocked={isFinalizeLocked}
        hasDiagnosis={!!diagnosis}
        activeReportId={activeReportId}
        submitting={submitting}
        onBack={onBack}
        onToggleOutLabConsult={handleToggleOutLabConsult}
        onRequestConsult={() => setConsultModalOpen(true)}
        onViewFinalPdf={handleViewFinalPdf}
        onOpenCompletedPopup={() => setCompletedCasePopupOpen(true)}
        onCancelAddendum={handleCancelAddendum}
        onPreviewPdf={handlePreviewPdf}
        onSaveDraft={() => form.submit()}
        onFinalizeClick={handleFinalizeClick}
      />

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
              <NongynePreviousReportCard prevDiagnosis={prevDiagnosis} />
            )}

            {/* Specimen fields */}
            <NongyneSpecimenFieldsCard
              isEditorLocked={isEditorLocked}
              slideCount={caseData?.slide_count}
            />

            {/* Diagnostic Flags */}
            <StyledCard styles={{ body: { padding: "16px 24px" } }}>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <DiagnosticFlagToggle
                    icon={<ExclamationCircleOutlined style={{ color: "#cf1322" }} />}
                    color="#cf1322"
                    background="#fff1f0"
                    border="#ffa39e"
                    label="Malignancy"
                    fieldName="has_malignancy"
                    disabled={isEditorLocked}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <DiagnosticFlagToggle
                    icon={<AlertOutlined style={{ color: "#d48806" }} />}
                    color="#d48806"
                    background="#fffbe6"
                    border="#ffe58f"
                    label="Critical Case"
                    fieldName="has_critical"
                    disabled={isEditorLocked}
                  />
                </Col>
              </Row>
            </StyledCard>

            {/* Clinical + Gross */}
            <NongyneClinicalGrossSection
              isEditorLocked={isEditorLocked}
              onOpenGrossTemplates={() => setGrossTemplateDrawerOpen(true)}
            />

            {/* Diagnosis + Microscopic */}
            <NongyneDiagnosisFormSection
              isEditorLocked={isEditorLocked}
              caseData={caseData}
              onOpenDiagnosisTemplates={() => setTemplateDrawerOpen(true)}
              onToggleCellBlock={handleToggleCellBlock}
              images={images}
              descMap={descMap}
              setDescMap={setDescMap}
              saveDesc={saveDesc}
              fetchImages={fetchImages}
              onEditImage={(img: NongyneCaseImage) => {
                setEditingImage(img);
                setImageCaptureOpen(true);
              }}
              onAddImage={() => {
                setEditingImage(null);
                setImageCaptureOpen(true);
              }}
            />

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

            {/* Cytotech screening vs this signed-out result */}
            <CytoPathConcordanceCard caseId={Number(caseId)} caseType="nongyne" />

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
                <Button onClick={handleCancelAddendum}>Cancel Revision</Button>
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
        initialQualityComment={caseData?.quality_comment ?? null}
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

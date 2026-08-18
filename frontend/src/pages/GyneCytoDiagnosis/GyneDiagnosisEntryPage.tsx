import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Form,
  Button,
  App,
  Spin,
  Alert,
  Row,
} from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import type { GyneDiagnosisResponse, GyneDiagnosisUpdate } from "../../types/gyne-diagnosis";
import ReportPreviewModal from "../../components/ReportPreviewModal";
import GyneCytologyImageCaptureModal from "./components/GyneCytologyImageCaptureModal";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import PatientInfoCard from "../../components/PatientInfoCard";
import PageContainer from "../../components/Layout/PageContainer";
import PathologistDiagnosisManager from "../../components/PathologistDiagnosis/PathologistDiagnosisManager";
import ConsultRequestModal from "../../components/InternalConsult/ConsultRequestModal";
import ConsultHistorySection from "../../components/InternalConsult/ConsultHistorySection";
import ConsultPdfPanel from "../../components/OutlabConsult/ConsultPdfPanel";
import CytoCorrelationManager from "../../components/CytoCorrelationManager";
import type { SurgicalCase } from "../../types/surgical";
import logger from "../../utils/logger";
import { useGyneDiagnosisData } from "./hooks/useGyneDiagnosisData";
import GyneClinicalInfoCard from "./components/GyneClinicalInfoCard";
import GyneAdequacyCard from "./components/GyneAdequacyCard";
import GyneCategoryCard from "./components/GyneCategoryCard";
import GyneNotesCard from "./components/GyneNotesCard";
import GyneSendToPathologistModal from "./components/GyneSendToPathologistModal";
import GyneDiagnosisToolbar from "./components/GyneDiagnosisToolbar";
import GyneReportedResult from "./components/GyneReportedResult";
import GyneCytologyImagesSection from "./components/GyneCytologyImagesSection";
import GyneQCReviewSection from "./components/GyneQCReviewSection";
import GyneSignOffPage from "./components/GyneSignOffPage";
import { getConsultLockState } from "../Pathologist/utils/consultLockState";
import { toPathologistOptions } from "../../utils/pathologistOptions";
import GyneCompletedCaseModal, { CompletedReportSummary } from "./components/GyneCompletedCaseModal";
import GyneDiagnosisHistoryDrawer from "./components/GyneDiagnosisHistoryDrawer";

interface GyneDiagnosisEntryPageProps {
  caseId?: string | number;
  onBack?: () => void;
}

// ── Status helpers ──────────────────────────────────────────────────────────
type BadgeStatus = "success" | "processing" | "error" | "default" | "warning";
type GyneSigner = {
  user_id: number;
  role: "primary" | "cytotechnologist" | "co-sign pathologist" | "co-sign cytotechnologist";
  signed_at?: string | null;
};
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
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const {
    caseData,
    diagnosis,
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
    qualityOptions,
    defaultSigners,
    fetchDiagnosis,
    fetchCaseData,
    fetchImages,
    saveDesc,
    submitting,
    setSubmitting,
    finalizing,
    completingReview,
    saveDraft,
    persistDraftForPreview,
    finalize,
    completeReview,
    toggleOutLabConsult,
  } = useGyneDiagnosisData(caseId, form);

  const [isPatientInfoExpanded, setIsPatientInfoExpanded] = useState(false);
  const [isRevision, setIsRevision] = useState(false);
  const [forceEdit, setForceEdit] = useState(false);
  const [isAbnormal, setIsAbnormal] = useState(false);
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
  const [completedReports, setCompletedReports] = useState<CompletedReportSummary[]>([]);
  const [completedReportsLoading, setCompletedReportsLoading] = useState(false);
  const [selectedPopupReportId, setSelectedPopupReportId] = useState<number | null>(null);
  const [popupPdfUrl, setPopupPdfUrl] = useState<string | null>(null);
  const [popupPdfLoading, setPopupPdfLoading] = useState(false);

  const selectedAdequacyId = Form.useWatch("adequacy_id", form);
  const selectedAdequacyText = useMemo(
    () => adequacyOptions.find((o) => o.id === selectedAdequacyId)?.text ?? "",
    [adequacyOptions, selectedAdequacyId],
  );
  const isUnsatisfactoryAdequacy = /unsatisfactory/i.test(selectedAdequacyText);
  const isLimitedAdequacy = /limited by/i.test(selectedAdequacyText);
  const showZoneField = !isUnsatisfactoryAdequacy;
  const showQualityField = isUnsatisfactoryAdequacy || isLimitedAdequacy;
  // Unsatisfactory specimens force the same pathologist-review routing as an
  // abnormal category, but shouldn't visually flip the "Abnormal" switch —
  // that switch reflects the diagnostic category only. This is what every
  // actual enforcement path (signer completion, publish payload, button
  // routing/label) should read instead of the raw switch state.
  const requiresPathologistReview = isAbnormal || isUnsatisfactoryAdequacy;

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

  const { isConsultEditorLocked, isConsultFinalizeLocked, isEditorLocked, isFinalizeLocked } =
    getConsultLockState({
      isLocked: isFinalized && !isRevision,
      isAddendumMode: isRevision,
      isAwaitingApproval: false,
      isOutLabConsult: !!caseData?.is_out_lab_consult,
      consultStatus: caseData?.consult_status,
      consultPdfPath: caseData?.consult_pdf_path,
    });

  const isPendingReview = caseData?.status === "pending_review";

  // Set default signers when no diagnosis exists
  useEffect(() => {
    if (!loading && !diagnosis && caseData) {
      const current = form.getFieldValue("signers");
      if ((!current || current.length === 0) && defaultSigners.length > 0)
        form.setFieldValue("signers", defaultSigners);
    }
  }, [loading, diagnosis, caseData, defaultSigners, form]);

  // Sync the "Abnormal" switch from the selected category only — Unsatisfactory
  // adequacy still forces pathologist review (see requiresPathologistReview
  // above), it just doesn't flip this switch, since it isn't the same thing
  // as an abnormal diagnostic category.
  useEffect(() => {
    const cat = mainCategories.find((c) => c.id === selectedCat1);
    setIsAbnormal(cat?.code?.startsWith("3") ?? false);
  }, [selectedCat1, mainCategories]);

  useEffect(() => {
    if (!caseId || !diagnosis) return;
    GyneDiagnosisService.getHistory(Number(caseId))
      .then((data) => setHistoryCount(data.length))
      .catch(() => {});
  }, [caseId, diagnosis]);

  // Auto-show popup once when entering a finalized case.
  // Skip pending_review — that status means the case is awaiting the
  // pathologist's QC decision (see GyneQCReviewSection), not that it's
  // already signed off. Also suppressed while a consult round is actively
  // awaiting the pathologist's attention, so it doesn't cover up the
  // now-reachable Sign-off button (mirrors the same fix applied to
  // Surgical/NonGyne's equivalent popup).
  useEffect(() => {
    if (
      caseData &&
      isFinalized &&
      caseData.status !== "pending_review" &&
      !isConsultEditorLocked &&
      !completedCasePopupShownRef.current
    ) {
      completedCasePopupShownRef.current = true;
      setCompletedCasePopupOpen(true);
    }
  }, [caseData?.id, caseData?.status, isFinalized, isConsultEditorLocked]);

  // Load report list when popup opens
  useEffect(() => {
    if (!completedCasePopupOpen || !caseId) return;
    setCompletedReportsLoading(true);
    GyneDiagnosisService.getReportsByCase(Number(caseId))
      .then((reports) => {
        const typed = reports as CompletedReportSummary[];
        setCompletedReports(typed);
        if (typed[0]) setSelectedPopupReportId(typed[0].id);
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

  const onFinish = async (values: GyneDiagnosisUpdate) => {
    try {
      setSubmitting(true);
      const { mode } = await saveDraft(values, { isRevision });
      if (mode === "revise") {
        message.success("Revised report saved successfully.");
        setIsRevision(false);
        await fetchCaseData();
      } else {
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
      await persistDraftForPreview(form.getFieldsValue(), isRevision);
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
    comment: string | null = null,
  ) => {
    await finalize(sq, stq, comment, undefined, {
      forceEdit,
      requiresPathologistReview,
      signOnlyCurrentUser: requiresPathologistReview,
    });
    if (onBack) onBack();
  };

  const handleOutLabConsult = async (
    reason: string,
    sq: string,
    stq: string,
    comment: string,
  ) => {
    await finalize(sq, stq, comment, { reason }, {
      forceEdit,
      requiresPathologistReview,
      signOnlyCurrentUser: requiresPathologistReview,
    });
    if (onBack) onBack();
  };

  const handleSendToPathologistClick = () => {
    const signers: GyneSigner[] = form.getFieldValue("signers") || [];
    const existing = signers.find((s) => s.role === "primary");
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
      const withoutOtherPatho = current.filter((s) => s.role !== "primary");
      form.setFieldValue("signers", [
        ...withoutOtherPatho,
        { user_id: selectedPathoId, role: "primary", signed_at: null },
      ]);
    }
    setSendToPathoModalOpen(false);
    handleFinalize(null, null);
  };

  const handleCompleteReview = async (
    result: "agree" | "disagree",
    note?: string,
    level?: "minor" | "major" | null,
    outLab?: { reason: string },
  ) => {
    const outcome = await completeReview(result, note, level, outLab);
    if (outcome === "agree" && onBack) onBack();
    if (outcome === "disagree") setIsRevision(true);
  };

  const handleAgreeWithOutLabConsult = (reason: string) =>
    handleCompleteReview("agree", undefined, undefined, { reason });

  const isFormMode = !diagnosis || isRevision || !isFinalized || isConsultEditorLocked;

  const isCurrentUserSigned = useMemo(() => {
    if (!diagnosis || !currentUser) return false;
    return !!diagnosis.signers?.find((s) => s.user_id === currentUser.id)
      ?.signed_at;
  }, [diagnosis, currentUser]);

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
      <GyneDiagnosisToolbar
        caseId={caseId}
        caseData={caseData}
        statusConfig={statusConfig}
        isRevision={isRevision}
        isEditorLocked={isEditorLocked}
        isConsultEditorLocked={isConsultEditorLocked}
        isFinalized={isFinalized}
        isPendingReview={isPendingReview}
        isFormMode={isFormMode}
        isFinalizeLocked={isFinalizeLocked}
        hasDiagnosis={!!diagnosis}
        historyCount={historyCount}
        isCurrentUserSigned={isCurrentUserSigned}
        forceEdit={forceEdit}
        submitting={submitting}
        finalizing={finalizing}
        requiresPathologistReview={requiresPathologistReview}
        onBack={onBack}
        onToggleOutLabConsult={toggleOutLabConsult}
        onOpenHistory={handleOpenHistory}
        onViewFinalPDF={handleViewFinalPDF}
        onStartRevision={() => {
          form.setFieldValue("revised_reason", undefined);
          setIsRevision(true);
        }}
        onPreviewPDF={handlePreviewPDF}
        onSaveDraft={() => form.submit()}
        onSendToPathologistClick={handleSendToPathologistClick}
        onFinalizeClick={handleFinalizeClick}
      />

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
        {/* ── Out-Lab Consult PDF ───────────────────────────────────────── */}
        {caseData?.is_out_lab_consult && (
          <div style={{ marginBottom: 16 }}>
            <ConsultPdfPanel
              caseId={Number(caseId)}
              isOutLabConsult={!!caseData?.is_out_lab_consult}
              consultPdfPath={caseData?.consult_pdf_path}
              consultStatus={caseData?.consult_status}
              onUpload={GyneCytologyCaseService.uploadConsultPdf}
              onDelete={GyneCytologyCaseService.deleteConsultPdf}
              onGetBlob={GyneCytologyCaseService.getConsultPdfBlob}
              onRefresh={fetchCaseData}
            />
          </div>
        )}

        {/* ── QC Review Banner (read-only here — Agree/Disagree happen on
             the pathologist's own review page) + Discordance Banner ──────── */}
        <GyneQCReviewSection
          caseData={caseData}
          isPendingReview={isPendingReview}
          isPathologist={false}
          completingReview={completingReview}
          onAgree={() => handleCompleteReview("agree")}
          onDisagree={(note, level) =>
            handleCompleteReview("disagree", note, level)
          }
          onAgreeWithOutLab={handleAgreeWithOutLabConsult}
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
              <GyneAdequacyCard
                adequacyOptions={adequacyOptions}
                zoneOptions={zoneOptions}
                qualityOptions={qualityOptions}
                showZoneField={showZoneField}
                showQualityField={showQualityField}
              />

              {/* ── Diagnosis Category ── */}
              <GyneCategoryCard
                mainCategories={mainCategories}
                subCategories={subCategories}
                selectedCat1={selectedCat1}
                isEditorLocked={isEditorLocked}
                isRevision={isRevision}
                isAbnormal={isAbnormal}
                setIsAbnormal={setIsAbnormal}
                requiresPathologistReview={requiresPathologistReview}
              />
            </Row>

            {/* ── Notes ── */}
            <GyneNotesCard isRevision={isRevision} isEditorLocked={isEditorLocked} />

            {/* ── Cytology Images ── */}
            <GyneCytologyImagesSection
              images={images}
              descMap={descMap}
              isFormLocked={isEditorLocked}
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
            <PathologistDiagnosisManager
              pathologists={pathologists}
              defaultSigners={defaultSigners}
              isLocked={isEditorLocked}
              namePath={SIGNERS_PATH}
              settings={managerSettings}
            />

            <CytoCorrelationManager
              caseId={Number(caseId)}
              caseType="gyne"
              diagnosisSnapshot={diagnosis?.interpretation ?? undefined}
              isLocked={isEditorLocked}
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
                  pathologists={toPathologistOptions(pathologists)}
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
      <GyneSendToPathologistModal
        open={sendToPathoModalOpen}
        onCancel={() => setSendToPathoModalOpen(false)}
        onConfirm={handleSendToPathoConfirm}
        confirmLoading={finalizing}
        pathologists={pathologists}
        selectedPathoId={selectedPathoId}
        onSelectPatho={setSelectedPathoId}
      />

      {/* ── Slide Quality Modal ── */}
      <GyneSignOffPage
        open={slideQualityModalOpen}
        caseId={caseId}
        caseData={caseData}
        finalizing={finalizing}
        onClose={() => setSlideQualityModalOpen(false)}
        onFinalize={handleFinalize}
        onConfirmAndOutLab={handleOutLabConsult}
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

      <GyneCompletedCaseModal
        open={completedCasePopupOpen}
        onClose={() => setCompletedCasePopupOpen(false)}
        onBack={onBack}
        onReviseReport={() => {
          form.setFieldValue("revised_reason", undefined);
          setIsRevision(true);
          setCompletedCasePopupOpen(false);
        }}
        caseData={caseData}
        completedReports={completedReports}
        completedReportsLoading={completedReportsLoading}
        selectedReportId={selectedPopupReportId}
        onSelectReport={setSelectedPopupReportId}
        pdfUrl={popupPdfUrl}
        pdfLoading={popupPdfLoading}
      />

      <GyneDiagnosisHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        historyList={historyList}
      />
    </PageContainer>
  );
};

export default GyneDiagnosisEntryPage;

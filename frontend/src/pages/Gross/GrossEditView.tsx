import React, { useEffect, useRef, useState } from "react";
import {
  App,
  Anchor,
  Button,
  Col,
  Form,
  Modal,
  Row,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  CameraOutlined,
  DatabaseOutlined,
  EditOutlined,
  FileTextOutlined,
  MedicineBoxOutlined,
  RobotOutlined,
  SaveOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/th";
import buddhistEra from "dayjs/plugin/buddhistEra";

import GrossExaminationService from "../../services/grossExaminationService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import SurgicalSpecimenService from "../../services/surgicalSpecimenService";
import { CASE_STATUS, STATUS_OPTIONS } from "../../constants/lab.constants";
import type { SurgicalCase } from "../../types/surgical";
import type { SystemSetting } from "../../types/system";
import type { User } from "../../types/user";

import ClinicalInfoSection from "../../components/ClinicalInfoSection";
import { useAuth } from "../../hooks/useAuth";
import GrossImageCaptureModal from "./components/GrossImageCaptureModal";
import GrossImageGallery from "./components/GrossImageGallery";
import PatientInfoCard from "../../components/PatientInfoCard";
import SpecimenManagerSection from "../../components/SpecimenManagerSection/SpecimenManagerSection";
import GrossFinalizeSection from "./components/GrossFinalizeSection";
import GrossDescriptionSection from "../../components/GrossDescription/GrossDescriptionSection";
import GrossingAssistModal from "./components/GrossingAssistModal";
import PageContainer from "../../components/Layout/PageContainer";
import StyledCard from "../../components/Layout/StyledCard";
import styles from "../../styles/LayoutWidget.module.css";

import { useGrossImages } from "./hooks/useGrossImages";
import { prepareGrossInitialValues } from "./utils/formHelpers";
import { useTheme } from "../../contexts/ThemeContext";
import logger from "../../utils/logger";
import { stripHtmlToText } from "../../utils/sanitize";

dayjs.extend(buddhistEra);
dayjs.locale("th");

const { Title, Text } = Typography;

const GROSS_STAGE_STATUSES: string[] = [
  CASE_STATUS.REGISTERED,
  CASE_STATUS.FORMALIN_FIXING,
  CASE_STATUS.GROSS_IN_PROGRESS,
  CASE_STATUS.GROSSED,
];

// Statuses that should be bumped to GROSS_IN_PROGRESS on draft save.
// GROSSED is intentionally excluded: re-opening an already-completed case
// (e.g. to fix a typo) must not revert it to "in progress".
const DRAFT_ADVANCE_STATUSES: string[] = [
  CASE_STATUS.REGISTERED,
  CASE_STATUS.FORMALIN_FIXING,
  CASE_STATUS.GROSS_IN_PROGRESS,
];

interface Props {
  activeCase: SurgicalCase;
  onBack: () => void;
  onCaseSaved: () => void;
  users: User[];
  settings: SystemSetting | null;
  isSidebarCollapsed?: boolean;
  isSideLayout?: boolean;
}

const GrossEditView: React.FC<Props> = ({
  activeCase,
  onBack,
  onCaseSaved,
  users,
  settings,
  isSidebarCollapsed,
  isSideLayout,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { isDarkMode } = useTheme();
  const { updateUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [editorUpdateKey, setEditorUpdateKey] = useState(0);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isAssistModalOpen, setIsAssistModalOpen] = useState(false);
  const [currentSpecimens, setCurrentSpecimens] = useState<any[]>([]);

  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveDraftRef = useRef<() => Promise<void>>(async () => {});

  const {
    grossImages,
    fetchImagesAllSpecimens,
    handleCaptureAndUpload,
    handleDeleteImage,
  } = useGrossImages(activeCase);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const currentUserId = currentUser?.id || null;

  const [isPatientInfoExpanded, setIsPatientInfoExpanded] = useState<boolean>(
    currentUser?.preferences?.patient_info_expanded ?? true
  );
  const [isNavSettingsOpen, setIsNavSettingsOpen] = useState(false);
  const [isNavigatorVisible, setIsNavigatorVisible] = useState<boolean>(
    (currentUser?.preferences?.gross_navigator_visible as boolean) ?? true
  );

  const showTopAnchor = isSideLayout ? !isSidebarCollapsed : false;
  const showNavigator = (isSideLayout ? isSidebarCollapsed : true) && isNavigatorVisible;

  useEffect(() => {
    const specs = activeCase.specimens || [];
    setCurrentSpecimens(specs);
    form.setFieldsValue(prepareGrossInitialValues(activeCase, currentUserId));
    if (specs.length > 0) {
      fetchImagesAllSpecimens(specs);
    }
  }, []);

  useEffect(() => { handleSaveDraftRef.current = handleSaveDraft; });

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, []);

  const scheduleAutosave = () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { handleSaveDraftRef.current(); }, 60_000);
  };

  const markDirty = () => {
    setIsDirty(true);
    scheduleAutosave();
  };

  const markClean = () => {
    setIsDirty(false);
    setLastSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  };

  const handleBackGuarded = () => {
    if (isDirty) {
      Modal.confirm({
        title: "Unsaved changes",
        content: "You have unsaved changes. Leave without saving?",
        okText: "Leave",
        okButtonProps: { danger: true },
        cancelText: "Stay",
        onOk: onBack,
      });
    } else {
      onBack();
    }
  };

  const handleTemplateUpdate = (newText: string, mode: "replace" | "append", specimenId: number) => {
    const currentDescriptions = form.getFieldValue("gross_descriptions") || {};
    const currentHTML = currentDescriptions[specimenId] || "";
    const finalHTML =
      mode === "replace"
        ? `<p>${newText}</p>`
        : currentHTML + `<p>${newText}</p>`;
    form.setFieldsValue({
      gross_descriptions: { ...currentDescriptions, [specimenId]: finalHTML },
    });
    setEditorUpdateKey((prev) => prev + 1);
  };

  const handleUpdatePatientInfoPreference = async (expanded: boolean) => {
    setIsPatientInfoExpanded(expanded);
    try {
      import("../../services/userService").then(async ({ default: UserService }) => {
        await UserService.updateMyPreferences({ patient_info_expanded: expanded });
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        if (user.preferences) {
          user.preferences.patient_info_expanded = expanded;
        } else {
          user.preferences = { patient_info_expanded: expanded };
        }
        localStorage.setItem("user", JSON.stringify(user));
        updateUser(user);
      });
    } catch (error) {
      logger.error("Failed to update preferences:", error);
    }
  };

  const handleNavVisibleChange = async (visible: boolean) => {
    setIsNavigatorVisible(visible);
    try {
      const { default: UserService } = await import("../../services/userService");
      await UserService.updateMyPreferences({ gross_navigator_visible: visible });
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      user.preferences = { ...(user.preferences || {}), gross_navigator_visible: visible };
      localStorage.setItem("user", JSON.stringify(user));
      updateUser(user);
    } catch (error) {
      logger.error("Failed to update nav preferences:", error);
    }
  };

  const handleSave = async (values: any) => {
    setLoading(true);
    try {
      const freshCase = await SurgicalCaseService.getCaseById(activeCase.id);
      const freshSpecimens = freshCase.specimens ?? [];

      const specimensWithoutBlocks = freshSpecimens.filter(
        (s) => !s.blocks || s.blocks.length === 0,
      );
      if (specimensWithoutBlocks.length > 0) {
        const labels = specimensWithoutBlocks.map((s) => s.specimen_label).join(", ");
        message.error(`Cannot save: Specimen [${labels}] has no blocks created.`);
        setLoading(false);
        return;
      }

      const grossDescriptions = values.gross_descriptions || {};
      const stripHtml = (html: string) => stripHtmlToText(html).trim();

      const specimensWithoutDesc = freshSpecimens.filter((s) => {
        const desc = grossDescriptions[s.id.toString()] || "";
        return stripHtml(desc).length === 0;
      });
      if (specimensWithoutDesc.length > 0) {
        const labels = specimensWithoutDesc.map((s) => s.specimen_label).join(", ");
        message.error(`Cannot save: Specimen [${labels}] is missing a Gross Description.`);
        setLoading(false);
        return;
      }

      const blocksWithoutCount: { blockCode: string }[] = [];
      for (const s of freshSpecimens) {
        for (const b of s.blocks ?? []) {
          if (!b.is_tissue_uncountable && b.tissue_count == null) {
            blocksWithoutCount.push({ blockCode: b.block_code });
          }
        }
      }
      if (blocksWithoutCount.length > 0) {
        setLoading(false);
        Modal.error({
          title: "Tissue Count Required",
          content: (
            <div>
              <p>The following blocks are missing Tissue Count:</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {blocksWithoutCount.map((b) => (
                  <li key={b.blockCode}>Block <b>{b.blockCode}</b></li>
                ))}
              </ul>
            </div>
          ),
          okText: "OK",
        });
        return;
      }

      const formattedCaseValues = {
        clinical_diagnosis: values.clinical_diagnosis,
        gross_at: values.gross_at ? dayjs(values.gross_at).toISOString() : dayjs().toISOString(),
        gross_examiner_id: values.gross_examiner_id,
        gross_assistant_id: values.gross_assistant_id,
        pathologist_id: values.pathologist_id,
        is_grossed: true,
        status: GROSS_STAGE_STATUSES.includes(freshCase.status) ? CASE_STATUS.GROSSED : freshCase.status,
      };

      const validIds = freshSpecimens.map((s) => s.id.toString());
      const specimenIds = Object.keys(values.gross_descriptions || {}).filter(
        (id) => validIds.includes(id),
      );
      const updatePromises = specimenIds.map((id) =>
        SurgicalSpecimenService.updateGrossDescription(id, {
          gross_description: values.gross_descriptions[id],
        }),
      );

      await Promise.all([
        GrossExaminationService.updateCase(activeCase.id, formattedCaseValues),
        ...updatePromises,
      ]);

      message.success("บันทึกข้อมูลและยืนยันการทำ Gross สำเร็จ");
      markClean();
      onCaseSaved();
      onBack();
    } catch (err) {
      logger.error("Save Error:", err);
      message.error("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const formValues = form.getFieldsValue();
      const freshCase = await SurgicalCaseService.getCaseById(activeCase.id);
      const freshSpecimens = freshCase.specimens ?? [];

      const formattedCaseValues = {
        clinical_diagnosis: formValues.clinical_diagnosis,
        gross_at: formValues.gross_at ? dayjs(formValues.gross_at).toISOString() : dayjs().toISOString(),
        gross_examiner_id: formValues.gross_examiner_id,
        gross_assistant_id: formValues.gross_assistant_id,
        pathologist_id: formValues.pathologist_id,
        status: DRAFT_ADVANCE_STATUSES.includes(freshCase.status) ? CASE_STATUS.GROSS_IN_PROGRESS : freshCase.status,
      };

      const validIds = freshSpecimens.map((s) => s.id.toString());
      const specimenIds = Object.keys(formValues.gross_descriptions || {}).filter(
        (id) => validIds.includes(id),
      );
      const updatePromises = specimenIds.map((id) =>
        SurgicalSpecimenService.saveGrossDescriptionDraft(id, {
          gross_description: formValues.gross_descriptions[id],
        }),
      );

      await Promise.all([
        GrossExaminationService.updateCase(activeCase.id, formattedCaseValues),
        ...updatePromises,
      ]);

      const updatedCase = await SurgicalCaseService.getCaseById(activeCase.id);
      const updatedSpecs = updatedCase.specimens ?? [];
      setCurrentSpecimens(updatedSpecs);
      form.setFieldsValue(prepareGrossInitialValues(updatedCase, currentUserId));
      setEditorUpdateKey((prev) => prev + 1);

      markClean();
      onCaseSaved();
      message.success("บันทึกฉบับร่าง (Save Draft) สำเร็จ");
    } catch (err) {
      logger.error("Save Draft Error:", err);
      message.error("บันทึกฉบับร่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  const grossingTabsItems = [
    {
      key: "description",
      label: "Gross Description & Blocks",
      icon: <FileTextOutlined />,
      children: (
        <GrossDescriptionSection
          specimens={currentSpecimens}
          editorUpdateKey={editorUpdateKey}
          onTemplateUpdate={handleTemplateUpdate}
          users={users}
        />
      ),
    },
    {
      key: "images",
      label: "Gross Images",
      icon: <CameraOutlined />,
      children: (
        <GrossImageGallery
          images={grossImages}
          specimens={currentSpecimens}
          onOpenCapture={() => setIsCaptureModalOpen(true)}
          onDeleteImage={handleDeleteImage}
          onRefresh={() => fetchImagesAllSpecimens(currentSpecimens)}
        />
      ),
    },
  ];

  return (
    <div>
      {/* Sticky Top Bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          background: isDarkMode ? "rgba(20, 20, 20, 0.85)" : "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: isDarkMode ? "1px solid #303030" : "1px solid #f0f0f0",
          boxShadow: isDarkMode ? "0 4px 15px rgba(0, 0, 0, 0.4)" : "0 2px 8px rgba(0, 0, 0, 0.06)",
          padding: "12px 24px",
          transition: "all 0.3s ease",
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Space size="large">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={handleBackGuarded}
              type="text"
              style={{ color: isDarkMode ? "rgba(255, 255, 255, 0.65)" : undefined }}
            />
            <Title level={4} style={{ margin: 0, color: isDarkMode ? "#fff" : undefined }}>
              Case:{" "}
              <span style={{ color: isDarkMode ? "#40a9ff" : "#1890ff" }}>
                {activeCase.accession_no}
              </span>
            </Title>
            {isDirty && <Tag color="orange" style={{ margin: 0 }}>● Unsaved</Tag>}
            {!isDirty && lastSavedAt && (
              <Text type="secondary" style={{ fontSize: 12 }}>Saved {lastSavedAt}</Text>
            )}
            {showTopAnchor && (
              <Anchor
                direction="horizontal"
                targetOffset={100}
                style={{ marginLeft: 24, background: "transparent" }}
                items={[
                  { key: "1", href: "#patient-info", title: "Patient" },
                  { key: "2", href: "#clinical-info", title: "Clinical" },
                  { key: "3", href: "#specimen-manager", title: "Specimens" },
                  { key: "4", href: "#gross-findings", title: "Gross" },
                  { key: "5", href: "#finalize-section", title: "Sign-off" },
                ]}
              />
            )}
          </Space>
          <Space>
            <Button
              icon={<SettingOutlined />}
              onClick={() => setIsNavSettingsOpen(true)}
              style={{
                background: isDarkMode ? "transparent" : "#fff",
                color: isDarkMode ? "rgba(255,255,255,0.65)" : "#595959",
                border: isDarkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid #d9d9d9",
              }}
              title="Navigator settings"
            />
            <Button
              icon={<SaveOutlined />}
              onClick={handleSaveDraft}
              loading={loading}
              style={{
                background: isDarkMode ? "transparent" : "#fff",
                color: "#1890ff",
                border: "1px dashed #1890ff",
              }}
            >
              Save Draft
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={loading}
              onClick={() => form.submit()}
              style={{
                background: isDarkMode
                  ? "linear-gradient(135deg, #389e0d 0%, #52c41a 100%)"
                  : "linear-gradient(135deg, #52c41a 0%, #73d13d 100%)",
                border: "none",
                boxShadow: isDarkMode
                  ? "0 4px 12px rgba(82, 196, 26, 0.3)"
                  : "0 4px 10px rgba(82, 196, 26, 0.2)",
              }}
            >
              Finalize
            </Button>
          </Space>
        </div>
      </div>

      <PageContainer>
        <Row gutter={[24, 0]} wrap={false}>
          {showNavigator && (
            <Col flex="180px" className={styles.navigatorContainer}>
              <div style={{ position: "sticky", top: "100px", height: "fit-content", zIndex: 10 }}>
                <StyledCard size="small" bodyStyle={{ padding: "16px 12px" }}>
                  <div style={{ textAlign: "center", marginBottom: "16px" }}>
                    <Text
                      type="secondary"
                      strong
                      style={{
                        fontSize: "10px",
                        letterSpacing: "1.5px",
                        color: isDarkMode ? "rgba(255,255,255,0.45)" : "#8c8c8c",
                        display: "block",
                        borderBottom: isDarkMode ? "1px solid #303030" : "1px solid #f0f0f0",
                        paddingBottom: "8px",
                      }}
                    >
                      NAVIGATOR
                    </Text>
                  </div>
                  <Anchor
                    affix={false}
                    targetOffset={120}
                    className={isDarkMode ? "dark-anchor" : ""}
                    style={{ background: "transparent" }}
                    items={[
                      {
                        key: "1",
                        href: "#patient-info",
                        title: <span><MedicineBoxOutlined style={{ marginRight: 8 }} /> Patient</span>,
                      },
                      {
                        key: "2",
                        href: "#clinical-info",
                        title: <span><DatabaseOutlined style={{ marginRight: 8 }} /> Clinical</span>,
                      },
                      {
                        key: "3",
                        href: "#specimen-manager",
                        title: <span><DatabaseOutlined style={{ marginRight: 8 }} /> Specimens</span>,
                      },
                      {
                        key: "4",
                        href: "#gross-findings",
                        title: <span><EditOutlined style={{ marginRight: 8 }} /> Gross</span>,
                        children: [...currentSpecimens]
                          .sort((a, b) =>
                            a.specimen_label.localeCompare(b.specimen_label, undefined, { numeric: true, sensitivity: "base" })
                          )
                          .map((spec) => ({
                            key: `gross-spec-${spec.id}`,
                            href: `#gross-spec-${spec.id}`,
                            title: (
                              <span style={{ fontSize: 12 }}>
                                {spec.specimen_label}
                                {spec.specimen_name ? ` · ${spec.specimen_name.slice(0, 14)}${spec.specimen_name.length > 14 ? "…" : ""}` : ""}
                              </span>
                            ),
                          })),
                      },
                      {
                        key: "5",
                        href: "#finalize-section",
                        title: <span><FileTextOutlined style={{ marginRight: 8 }} /> Sign-off</span>,
                      },
                    ]}
                  />
                </StyledCard>
              </div>
            </Col>
          )}

          <Col flex="auto" style={{ minWidth: 0 }}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              onValuesChange={markDirty}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
                  e.preventDefault();
                }
              }}
            >
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <div id="patient-info">
                  <PatientInfoCard
                    activeCase={activeCase}
                    activeCaseType="surgical"
                    isExpanded={isPatientInfoExpanded}
                    onToggle={handleUpdatePatientInfoPreference}
                    hideMarkRelated
                  />
                </div>

                <div id="clinical-info" style={{ scrollMarginTop: "100px" }}>
                  <ClinicalInfoSection />
                </div>

                <div id="specimen-manager">
                  <SpecimenManagerSection
                    activeCaseId={activeCase?.id}
                    specimens={currentSpecimens}
                    isExtendedFix={activeCase?.is_extended_fix}
                    onSpecimensChange={(newList) => setCurrentSpecimens(newList)}
                    canAddDelete={true}
                    isLocked={false}
                    showSpecimenName={settings?.show_specimen_name}
                  />
                </div>

                <StyledCard
                  id="gross-findings"
                  style={{ scrollMarginTop: "80px" }}
                  bodyStyle={{ padding: "16px 20px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingBottom: "12px",
                      marginBottom: 16,
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <Space size="middle">
                      <EditOutlined style={{ color: "#1890ff", fontSize: "18px" }} />
                      <Title
                        level={5}
                        style={{ margin: 0, textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600 }}
                      >
                        Gross Findings
                      </Title>
                    </Space>
                    <Space size="middle">
                      {settings?.grossing_assist_enabled && (
                        <Button
                          size="small"
                          icon={<RobotOutlined />}
                          onClick={() => setIsAssistModalOpen(true)}
                        >
                          AI Grossing Assistant
                        </Button>
                      )}
                      {(() => {
                        const opt = STATUS_OPTIONS.find((o) => o.value === activeCase?.status);
                        return (
                          <Tag color={opt?.color ?? "default"} style={{ borderRadius: "4px", border: "none" }}>
                            {opt?.label ?? activeCase?.status ?? "—"}
                          </Tag>
                        );
                      })()}
                    </Space>
                  </div>
                  <div style={{ paddingLeft: 0 }}>
                    <Tabs
                      defaultActiveKey="description"
                      items={grossingTabsItems}
                      type="line"
                      tabBarStyle={{
                        background: "#fafafa",
                        padding: "0 20px",
                        margin: 0,
                        borderBottom: "1px solid #f0f0f0",
                      }}
                      renderTabBar={(props, DefaultTabBar) => (
                        <DefaultTabBar {...props} style={{ marginBottom: 0 }} />
                      )}
                    />
                  </div>
                </StyledCard>

                <StyledCard
                  id="finalize-section"
                  style={{ scrollMarginTop: "80px" }}
                  bodyStyle={{ padding: "16px 20px" }}
                >
                  <GrossFinalizeSection users={users} onSaveDraft={handleSaveDraft} />
                </StyledCard>
              </Space>
            </Form>
          </Col>
        </Row>
      </PageContainer>

      <GrossImageCaptureModal
        open={isCaptureModalOpen}
        onClose={() => setIsCaptureModalOpen(false)}
        specimens={currentSpecimens}
        onCaptureAndUpload={(src, id) => handleCaptureAndUpload(src, id, currentSpecimens)}
      />

      <GrossingAssistModal
        open={isAssistModalOpen}
        onClose={() => setIsAssistModalOpen(false)}
        caseId={activeCase.id}
      />

      <Modal
        title={<Space><SettingOutlined /> Navigator</Space>}
        open={isNavSettingsOpen}
        onCancel={() => setIsNavSettingsOpen(false)}
        footer={null}
        width={280}
      >
        <div style={{ padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Show Navigator</span>
          <Switch checked={isNavigatorVisible} onChange={handleNavVisibleChange} />
        </div>
      </Modal>
    </div>
  );
};

export default GrossEditView;

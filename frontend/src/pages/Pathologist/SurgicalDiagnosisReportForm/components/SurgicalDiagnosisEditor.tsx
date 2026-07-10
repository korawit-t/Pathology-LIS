import React, { useState, useRef, useEffect } from "react";
import {
  Form,
  Typography,
  Row,
  Col,
  Space,
  FormInstance,
  Tabs,
  Tooltip,
  Button,
  Drawer,
  Badge,
  message,
  Tag,
} from "antd";
import {
  FileTextOutlined,
  PictureOutlined,
  CameraOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  ScanOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import SimpleTiptapEditor from "../../../../components/Editors/SimpleTiptapEditor";
import { sanitizeHtml } from "../../../../utils/sanitize";
import MicroscopicImageGallery from "./MicroscopicImageGallery";
import DiagnosticTemplateSystem from "../../SurgicalDiagnosticTemplate/DiagnosticTemplateSystem";
import IHCResultPanel from "./IHCResultPanel";
import type { SurgicalSpecimen } from "../../../../types/surgical";
import type { MicroscopicImage } from "../../../../types/image";
import type { WsiFile } from "../../../../types/system";

const { Text } = Typography;

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface SurgicalDiagnosisEditorProps {
  form: FormInstance;
  isLocked: boolean;
  hasOriginalSigned: boolean;
  specimen: SurgicalSpecimen;
  allSpecimens?: SurgicalSpecimen[];
  microImages?: MicroscopicImage[];
  onOpenMicroCapture?: (specimenId: number) => void;
  onEditMicroImage: (image: MicroscopicImage) => void;
  onRefreshMicroImages?: () => void;
  hideDiagnosisOnly?: boolean;
  showAIGenerate?: boolean;
  onAIGenerate?: () => void;
  isAIGenerating?: boolean;
  wsiSlides?: WsiFile[];
}

const SurgicalDiagnosisEditor: React.FC<SurgicalDiagnosisEditorProps> = ({
  form,
  isLocked,
  specimen,
  allSpecimens,
  microImages = [],
  hideDiagnosisOnly,
  onOpenMicroCapture,
  onEditMicroImage,
  onRefreshMicroImages,
  showAIGenerate = false,
  onAIGenerate,
  isAIGenerating = false,
  wsiSlides = [],
}) => {
  const getFieldName = (field: string) => ["diagnoses", specimen.id, field];
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const isFocusedWithin = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "t" && isFocusedWithin.current && !isLocked) {
        e.preventDefault();
        setIsTemplateModalOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isLocked]);

  const handleApplyTemplate = (
    data: { diagnosis: string; microscopic: string },
    mode: "append" | "replace",
    target: "current" | "all",
  ) => {
    const applyToSpecimen = (specId: number) => {
      const diagField = ["diagnoses", specId, "diagnosis"];
      const microField = ["diagnoses", specId, "microscopic_description"];

      if (mode === "replace") {
        form.setFieldValue(diagField, data.diagnosis);
        form.setFieldValue(microField, data.microscopic);
      } else {
        const currentDiag = form.getFieldValue(diagField) || "";
        const currentMicro = form.getFieldValue(microField) || "";
        form.setFieldValue(diagField, `${currentDiag}<p>${data.diagnosis}</p>`);
        form.setFieldValue(
          microField,
          currentMicro
            ? `${currentMicro}<p>${data.microscopic}</p>`
            : data.microscopic,
        );
      }

    };

    if (target === "all") {
      const specimenIds = allSpecimens && allSpecimens.length > 0
        ? allSpecimens.map((s) => s.id)
        : [specimen.id];

      specimenIds.forEach((specId) => applyToSpecimen(specId));
      message.success(`Applied to ${specimenIds.length} specimen${specimenIds.length > 1 ? "s" : ""}`);
    } else {
      applyToSpecimen(specimen.id);
      message.success("Applied to current specimen");
    }

    setIsTemplateModalOpen(false);
  };
  return (
    <div
      style={{ marginBottom: "0px" }}
      onFocusCapture={() => { isFocusedWithin.current = true; }}
      onBlurCapture={() => { isFocusedWithin.current = false; }}
    >
      {/* 2. Content section: re-renders when the is_active value changes */}
      <Form.Item
        noStyle
        shouldUpdate={(prev, curr) =>
          prev.diagnoses?.[specimen.id]?.is_active !==
          curr.diagnoses?.[specimen.id]?.is_active
        }
      >
        {({ getFieldValue }) => {
          const isActive = getFieldValue(getFieldName("is_active")) !== false;

          // --- Case: editing for this specimen is "off" ---
          if (!isActive) {
            return (
              <div
                style={{
                  padding: "30px",
                  textAlign: "center",
                  background: "#fafafa",
                  borderRadius: "8px",
                  border: "1px dashed #d9d9d9",
                }}
              >
                <Text type="secondary">
                  <InfoCircleOutlined /> No new data will be saved for this specimen
                  (the report will use the latest existing result)
                </Text>
              </div>
            );
          }

          // --- Case: editing for this specimen is "on" ---
          return (
            <div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                }}
              >
                {/* Section: Diagnosis */}
                {/* 🚩 Edited part: hide Diagnosis only when hideDiagnosisOnly is set */}
                {!hideDiagnosisOnly && (
                  <section>
                    <div
                      style={{
                        marginBottom: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Space>
                        <FileTextOutlined style={{ color: "#1890ff" }} />
                        <Text
                          strong
                          style={{
                            textTransform: "uppercase", // 🚩 Force uppercase
                          }}
                        >
                          Diagnosis
                        </Text>
                      </Space>

                      <Space size={4}>
                        {showAIGenerate && !isLocked && onAIGenerate && (
                          <Button
                            size="small"
                            icon={<RobotOutlined />}
                            loading={isAIGenerating}
                            onClick={onAIGenerate}
                          >
                            AI Generate
                          </Button>
                        )}
                        {!isLocked && (
                          <Tooltip title="Alt+T">
                            <Button
                              size="small"
                              icon={<ThunderboltOutlined />}
                              onClick={() => setIsTemplateModalOpen(true)}
                            >
                              Templates
                              <span style={{ fontSize: 10, color: "#8c8c8c", marginLeft: 4, fontFamily: "monospace" }}>
                                Alt+T
                              </span>
                            </Button>
                          </Tooltip>
                        )}
                      </Space>
                    </div>
                    <Form.Item
                      name={getFieldName("diagnosis")}
                      rules={[
                        { required: !hideDiagnosisOnly, message: "Please enter the diagnosis" },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <SimpleTiptapEditor
                        disabled={isLocked}
                        placeholder={`${specimen.specimen_label}: ${specimen.specimen_name} ...`}
                        style={{ minHeight: "180px" }}
                      />
                    </Form.Item>
                  </section>
                )}

                {/* Section: Microscopic Details & Images */}
                <section>
                  <Tabs
                    defaultActiveKey="description"
                    size="small"
                    type="line"
                    items={[
                      {
                        key: "description",
                        label: (
                          <span>
                            <PictureOutlined /> Microscopic Description
                          </span>
                        ),
                        children: (
                          <Form.Item
                            name={getFieldName("microscopic_description")}
                            style={{ marginBottom: 0 }}
                          >
                            <SimpleTiptapEditor
                              disabled={isLocked}
                              placeholder="Describe the microscopic pathology findings..."
                              style={{ background: "#fff" }}
                            />
                          </Form.Item>
                        ),
                      },
                      {
                        key: "images",
                        label: (() => {
                          const imgCount = microImages.filter(img => img.specimen_id === specimen.id).length;
                          return (
                            <span>
                              <CameraOutlined /> Images
                              {imgCount > 0 && (
                                <Badge count={imgCount} size="small" style={{ marginLeft: 6, verticalAlign: "middle" }} />
                              )}
                            </span>
                          );
                        })(),
                        children: (
                          <div
                            style={{
                              minHeight: "150px",
                              background: "#fff",
                              padding: "12px",
                              borderRadius: "4px",
                              border: "1px solid #d9d9d9",
                            }}
                          >
                            <MicroscopicImageGallery
                              specimenId={specimen.id}
                              images={microImages.filter(
                                (img) => img.specimen_id === specimen.id,
                              )}
                              isLocked={isLocked}
                              onOpenCapture={() =>
                                onOpenMicroCapture?.(specimen.id)
                              }
                              onEditImage={onEditMicroImage}
                              onRefresh={onRefreshMicroImages}
                            />
                          </div>
                        ),
                      },
                      {
                        key: "wsi",
                        label: (() => {
                          const count = wsiSlides.length;
                          return (
                            <span>
                              <ScanOutlined /> WSI
                              {count > 0 && (
                                <Badge count={count} size="small" style={{ marginLeft: 6, verticalAlign: "middle" }} />
                              )}
                            </span>
                          );
                        })(),
                        children: wsiSlides.length === 0 ? (
                          <div style={{ color: "#8c8c8c", padding: "12px 0" }}>
                            No WSI slides linked to this specimen.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, padding: "8px 0" }}>
                            {wsiSlides.map((slide) => (
                              <div key={slide.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden", background: "#fafafa" }}>
                                <img
                                  src={`${API_BASE}/wsi/thumbnail?path=${encodeURIComponent(slide.file_path)}&size=256`}
                                  alt={slide.filename}
                                  style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                                <div style={{ padding: "6px 8px" }}>
                                  <Tooltip title={slide.filename}>
                                    <Text ellipsis style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
                                      {slide.filename}
                                    </Text>
                                  </Tooltip>
                                  <Button
                                    size="small"
                                    type="primary"
                                    icon={<EyeOutlined />}
                                    block
                                    onClick={() => window.open(`/wsi-viewer?path=${encodeURIComponent(slide.file_path)}`, "_blank")}
                                  >
                                    Open
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ),
                      },
                    ]}
                  />
                </section>

                {/* Position A: IHC Result Panel */}
                <IHCResultPanel
                  form={form}
                  specimenId={specimen.id}
                  isLocked={isLocked}
                />
              </div>
            </div>
          ); // end of Card return
        }}
      </Form.Item>
      <Drawer
        title="Diagnostic Templates"
        open={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        styles={{ wrapper: { width: "min(960px, 90vw)" }, body: { padding: 0 } }}
        destroyOnHidden
        getContainer={() => document.body}
      >
        <Row style={{ height: "100%" }} wrap={false}>
          <Col flex="auto" style={{ padding: "16px", overflowY: "auto", minWidth: 0 }}>
            <DiagnosticTemplateSystem onApply={handleApplyTemplate} />
          </Col>
          <Col
            style={{
              width: 300,
              flexShrink: 0,
              borderLeft: "1px solid #f0f0f0",
              padding: "16px",
              overflowY: "auto",
              background: "#fafafa",
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <Tag color="orange" style={{ marginBottom: 6 }}>
                {specimen.specimen_label} — {specimen.specimen_name}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                Gross Description
              </Text>
            </div>
            {specimen.gross_description?.trim() ? (
              <div
                style={{ fontSize: 13, lineHeight: 1.75, color: "#262626" }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(specimen.gross_description) /* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml */ }}
              />
            ) : (
              <Text type="secondary" style={{ fontStyle: "italic", fontSize: 13 }}>
                No gross description recorded
              </Text>
            )}
          </Col>
        </Row>
      </Drawer>
    </div>
  ); // end of the Component's main return
};

export default SurgicalDiagnosisEditor;

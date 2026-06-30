import React, { useState, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  Form,
  Tooltip,
  Divider,
  Checkbox,
  Tabs,
  Image,
  Empty,
  Spin,
  Switch,
  Modal,
  Input,
  Button,
  message,
} from "antd";
import {
  HistoryOutlined,
  EyeOutlined,
  UserOutlined,
  UserAddOutlined,
  PictureOutlined,
  PlusSquareOutlined,
} from "@ant-design/icons";
import SurgicalSpecimenService from "../../../../services/surgicalSpecimenService";
import dayjs from "dayjs";

// Components
import SimpleTiptapEditor from "../../../../components/Editors/SimpleTiptapEditor";
import BlockTableForm from "../../../Gross/components/BlockTableForm";
import BlockGridView from "./BlockGridView/BlockGridView";
import SurgicalDiagnosisEditor from "./SurgicalDiagnosisEditor";
import { useTheme } from "../../../../contexts/ThemeContext";
import GrossImageService from "../../../../services/grossImageService";
import { API_BASE_URL } from "../../../../services/httpClient";
import logger from "../../../../utils/logger";
import SecureImage from "../../../../components/SecureImage";
import { SurgicalCase, SurgicalSpecimen } from "../../../../types/surgical";
import type { User } from "../../../../types/user";
import type { GrossImage, MicroscopicImage } from "../../../../types/image";
import type { FormInstance } from "antd";
import type { WsiFile } from "../../../../types/system";

const { Text } = Typography;

interface SpecimenIntegratedWorkblockProps {
  specimen: SurgicalSpecimen;
  surgicalCase: SurgicalCase;
  form: FormInstance;
  isLocked: boolean;
  hasOriginalSigned: boolean;
  pathologists: User[];
  microImages: MicroscopicImage[];
  onOpenMicroCapture: (specimenId: number) => void;
  onEditMicroImage: (image: MicroscopicImage) => void;
  onRefreshMicroImages: () => void;
  hideDiagnosisEditor?: boolean;
  isLast?: boolean;
  showAIGenerate?: boolean;
  onAIGenerate?: () => void;
  isAIGenerating?: boolean;
  wsiSlides?: WsiFile[];
}

const SpecimenGrossImagesTab: React.FC<{ specimenId: number }> = ({ specimenId }) => {
  const [images, setImages] = useState<GrossImage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchImages = async () => {
      setLoading(true);
      try {
        const data = await GrossImageService.getImagesBySpecimenId(specimenId);
        setImages(data || []);
      } catch (err) {
        logger.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (specimenId) fetchImages();
  }, [specimenId]);

  if (loading) return <div style={{ textAlign: "center", padding: 20 }}><Spin /></div>;
  if (!images.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No gross images" style={{ margin: "20px 0" }} />;

  return (
    <Image.PreviewGroup>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: "8px",
        }}
      >
        {images.map((img) => (
          <div key={img.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <SecureImage
              width="100%"
              height={80}
              style={{ objectFit: "cover", borderRadius: "4px", border: "1px solid #f0f0f0" }}
              src={`${API_BASE_URL}${img.image_url}`}
            />
            <div style={{ textAlign: "center" }}>
              <Switch
                size="small"
                checkedChildren="SHOW"
                unCheckedChildren="HIDE"
                checked={img.show_in_report !== false}
                onChange={async (checked) => {
                  try {
                    await GrossImageService.updateImage(img.id, { show_in_report: checked });
                    setImages(prev => prev.map(i => i.id === img.id ? { ...i, show_in_report: checked } : i));
                  } catch (err) {
                    message.error("บันทึกไม่สำเร็จ");
                  }
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Image.PreviewGroup>
  );
};

const SpecimenIntegratedWorkblock: React.FC<
  SpecimenIntegratedWorkblockProps
> = ({
  specimen,
  surgicalCase,
  form,
  isLocked,
  hasOriginalSigned,
  pathologists,
  microImages,
  onOpenMicroCapture,
  onEditMicroImage,
  onRefreshMicroImages,
  hideDiagnosisEditor,
  isLast,
  showAIGenerate,
  onAIGenerate,
  isAIGenerating,
  wsiSlides,
}) => {
  const specimenSlides = (wsiSlides ?? []).filter((s) => {
    if (s.parsed_block?.startsWith(specimen.specimen_label)) return true;
    const confirmedLink = s.slide_links.find((l) => l.status === "confirmed");
    return confirmedLink?.block_code?.startsWith(specimen.specimen_label) ?? false;
  });
  const { isDarkMode } = useTheme();
  const [addlSectionsModalOpen, setAddlSectionsModalOpen] = useState(false);
  const [addlSectionsNote, setAddlSectionsNote] = useState("");
  const [addlSectionsLoading, setAddlSectionsLoading] = useState(false);
  const [specimenLocal, setSpecimenLocal] = useState(specimen);

  useEffect(() => { setSpecimenLocal(specimen); }, [specimen]);

  const handleRequestAdditionalSections = async () => {
    setAddlSectionsLoading(true);
    try {
      const updated = await SurgicalSpecimenService.requestAdditionalSections(
        specimenLocal.id,
        addlSectionsNote,
      );
      setSpecimenLocal(updated);
      setAddlSectionsModalOpen(false);
      setAddlSectionsNote("");
      message.success("Additional sections requested");
    } catch {
      message.error("Failed to request additional sections");
    } finally {
      setAddlSectionsLoading(false);
    }
  };

  const handleClearAdditionalSections = async () => {
    try {
      const updated = await SurgicalSpecimenService.clearAdditionalSections(specimenLocal.id);
      setSpecimenLocal(updated);
      message.success("Additional sections request cleared");
    } catch {
      message.error("Failed to clear request");
    }
  };
  const exId =
    surgicalCase?.gross_examiner?.id || surgicalCase?.gross_examiner_id;
  const asstId =
    surgicalCase?.gross_assistant?.id || surgicalCase?.gross_assistant_id;

  const getUserName = (userId: number | null | undefined) => {
    if (!userId) return "-";
    const user = pathologists?.find((u) => Number(u.id) === Number(userId));
    return user ? user.report_name || user.full_name : `ID: ${userId}`;
  };

  // 🚩 สำหรับข้อมูลคนทำ Gross เราสามารถดึงชื่อตรงๆ จาก surgicalCase ได้เลยถ้ามีข้อมูล
  const examinerName =
    surgicalCase?.gross_examiner?.report_name || getUserName(exId);
  const assistantName =
    surgicalCase?.gross_assistant?.report_name || getUserName(asstId);
  const activeFieldName = ["diagnoses", specimen.id, "is_active"];

  return (
    <Card
      style={{
        marginBottom: 0,
        borderRadius: 0,
        border: "none",
        borderBottom: isLast
          ? "none"
          : isDarkMode
            ? "1px solid #303030"
            : "1px solid #d9d9d9",
        boxShadow: "none",
      }}
      bodyStyle={{ padding: 0 }}
    >
      {/* --- ส่วนหัว Card (sticky while scrolling) --- */}
      <div
        style={{
          padding: "12px 20px",
          background: isDarkMode
            ? "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)"
            : "linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)",
          boxShadow: isDarkMode
            ? "0 4px 10px rgba(0, 0, 0, 0.3)"
            : "0 2px 8px rgba(0, 0, 0, 0.06)",
          borderBottom: isDarkMode
            ? "1px solid rgba(255, 255, 255, 0.05)"
            : "1px solid #e8e8e8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderLeft: "6px solid #1890ff",
          borderRadius: "0px",
          position: "sticky",
          top: 60,
          zIndex: 10,
        }}
      >
        <Space size="large">
          <Tag
            color={isDarkMode ? "blue-inverse" : "blue"}
            style={{
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "4px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            {specimenLocal.specimen_label}
          </Tag>
          <Text
            strong
            style={{
              fontSize: "18px",
              color: isDarkMode ? "#ffffff" : "#262626",
              textShadow: isDarkMode ? "0 1px 2px rgba(0,0,0,0.5)" : "none",
            }}
          >
            {specimenLocal.specimen_name}
          </Text>
        </Space>

        {/* ส่วน Checkbox */}
        {hasOriginalSigned ? (
          <Form.Item
            name={activeFieldName}
            valuePropName="checked"
            noStyle
            initialValue={true}
          >
            <Checkbox disabled={isLocked}>
              <Text
                strong
                style={{ color: isDarkMode ? "#69b1ff" : "#003a8c" }}
              >
                Update Diagnosis
              </Text>
            </Checkbox>
          </Form.Item>
        ) : (
          <Form.Item name={activeFieldName} initialValue={true} hidden>
            <input type="hidden" />
          </Form.Item>
        )}
      </div>

      {/* --- ส่วนเนื้อหา (จะซ่อนเมื่อไม่ได้ติ๊ก Checkbox) --- */}
      <Form.Item
        noStyle
        shouldUpdate={(prev, curr) =>
          prev.diagnoses?.[specimen.id]?.is_active !==
          curr.diagnoses?.[specimen.id]?.is_active
        }
      >
        {({ getFieldValue }) => {
          const isActive = getFieldValue(activeFieldName) !== false;

          // ถ้าไม่ Active ให้แสดงแค่ข้อความแจ้งเตือนสั้นๆ หรือไม่แสดงเลย
          if (!isActive) {
            return (
              <div
                style={{
                  padding: "12px 20px",
                  background: "#fafafa",
                  textAlign: "center",
                }}
              >
                <Text type="secondary">
                  <HistoryOutlined /> No update for this specimen
                </Text>
              </div>
            );
          }
          return (
            <Row style={{ background: "#fff" }}>
              {/* --- ฝั่งขวา: Diagnosis Section --- */}
              <Col
                span={14}
                style={{
                  padding: "20px 12px 20px 20px", // 🚩 ลด padding ด้านขวา (เหลือ 10px) เพื่อขยับหาตรงกลาง
                  background: "#ffffff",
                }}
              >
                {/* 1. Header: Specimen Name & Examiner Info */}

                <SurgicalDiagnosisEditor
                  form={form}
                  specimen={specimen}
                  allSpecimens={surgicalCase.specimens ?? []}
                  isLocked={isLocked}
                  hasOriginalSigned={hasOriginalSigned}
                  microImages={microImages}
                  onOpenMicroCapture={onOpenMicroCapture}
                  onEditMicroImage={onEditMicroImage}
                  onRefreshMicroImages={onRefreshMicroImages}
                  hideDiagnosisOnly={hideDiagnosisEditor}
                  showAIGenerate={showAIGenerate}
                  onAIGenerate={onAIGenerate}
                  isAIGenerating={isAIGenerating}
                  wsiSlides={specimenSlides}
                />
              </Col>
              {/* --- ฝั่งซ้าย: Gross Section --- */}
              <Col
                span={10}
                style={{
                  padding: "8px 20px 20px 12px",
                  borderLeft: "1px solid #f0f0f0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {/* --- Section 1: Gross Description & Images --- */}
                  <div>
                      <Tabs
                        defaultActiveKey="desc"
                        items={[
                          {
                            key: "desc",
                            label: (
                              <Space size="small">
                                <EyeOutlined style={{ color: "#d46b08" }} />
                                <Text strong style={{ color: "#262626", textTransform: "uppercase" }}>
                                  GROSS DESCRIPTION
                                </Text>
                              </Space>
                            ),
                            children: (
                              <Form.Item
                                name={["gross_descriptions", specimen.id]}
                                noStyle
                              >
                                <SimpleTiptapEditor
                                  disabled={isLocked}
                                  placeholder="บรรยายลักษณะเนื้อสด..."
                                />
                              </Form.Item>
                            ),
                          },
                          {
                            key: "images",
                            label: (
                              <Space size="small">
                                <PictureOutlined style={{ color: "#1890ff" }} />
                                <Text strong style={{ color: "#262626", textTransform: "uppercase" }}>
                                  GROSS IMAGES
                                </Text>
                              </Space>
                            ),
                            children: (
                              <SpecimenGrossImagesTab specimenId={specimen.id} />
                            ),
                          },
                        ]}
                      />
                  </div>

                  <BlockGridView
                    specimenId={specimen.id}
                    defaultLabel={specimen.specimen_label}
                    isEntirelySubmitted={specimen.is_entirely_submitted ?? false}
                    caseInfo={{
                      hn: surgicalCase?.hn ?? surgicalCase?.patient?.hn ?? "-",
                      name: [surgicalCase?.patient?.title?.title, surgicalCase?.patient?.name, surgicalCase?.patient?.ln].filter(Boolean).join(" ") || "-",
                      clinician: surgicalCase?.clinician_name ?? "-",
                      accession_no: surgicalCase?.accession_no ?? "-",
                      id_case: surgicalCase?.accession_no ?? "-",
                    }}
                  />

                  {/* Additional Sections */}
                  <div style={{ margin: "8px 0 4px" }}>
                    {specimenLocal.needs_additional_sections ? (
                      <Tooltip title={specimenLocal.additional_sections_note || "Additional sections needed"}>
                        <Tag
                          color="warning"
                          icon={<PlusSquareOutlined />}
                          closable={!isLocked}
                          onClose={(e) => { e.preventDefault(); handleClearAdditionalSections(); }}
                          style={{ cursor: "default" }}
                        >
                          Additional Sections
                        </Tag>
                      </Tooltip>
                    ) : (
                      !isLocked && (
                        <Button
                          size="small"
                          icon={<PlusSquareOutlined />}
                          onClick={() => { setAddlSectionsNote(""); setAddlSectionsModalOpen(true); }}
                          style={{ fontSize: 12 }}
                        >
                          Additional Sections
                        </Button>
                      )
                    )}
                  </div>

                  {/* 🚩 Integrated Metadata Block: รวมคนทำ Gross และ Audit Info เข้าด้วยกัน */}
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      background: "#f8f8f8",
                      borderRadius: "6px",
                      border: "1px solid #f0f0f0",
                    }}
                  >
                    {/* แถวบน: ผู้ตรวจ (Ex / Asst) */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <Space
                        size={12}
                        split={
                          <Divider
                            type="vertical"
                            style={{
                              margin: 0,
                              height: "12px",
                              borderColor: "#d9d9d9",
                            }}
                          />
                        }
                      >
                        <Tooltip title="ผู้ตรวจ Gross">
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "12px",
                            }}
                          >
                            <UserOutlined style={{ color: "#8c8c8c" }} />
                            <Text type="secondary">Ex:</Text>
                            <Text strong>{examinerName}</Text>
                          </span>
                        </Tooltip>
                        {asstId && (
                          <Tooltip title="ผู้ช่วยตรวจ Gross">
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "12px",
                              }}
                            >
                              <UserAddOutlined style={{ color: "#8c8c8c" }} />
                              <Text type="secondary">Asst:</Text>
                              <Text strong>{assistantName}</Text>
                            </span>
                          </Tooltip>
                        )}
                      </Space>
                    </div>

                    {/* แถวล่าง: ประวัติ (สร้าง/แก้ไข) */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        fontSize: "10.5px",
                        color: "#bfbfbf",
                        borderTop: "1px solid #efefef",
                        paddingTop: 4,
                      }}
                    >
                      <span>
                        <HistoryOutlined style={{ marginRight: 3 }} />
                        สร้าง:{" "}
                        {dayjs(specimen.created_at).format("DD/MM/YY HH:mm")}
                      </span>
                      {specimen.updated_at && (
                        <span>
                          แก้ไข:{" "}
                          {dayjs(specimen.updated_at).format("DD/MM/YY HH:mm")}
                          {specimen.updated_by_user && (
                            <Text
                              type="secondary"
                              style={{ fontSize: "10.5px", marginLeft: 4 }}
                            >
                              ({specimen.updated_by_user.report_name})
                            </Text>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          );
        }}
      </Form.Item>

      <Modal
        title={
          <Space>
            <PlusSquareOutlined style={{ color: "#faad14" }} />
            Request Additional Sections — Specimen {specimenLocal.specimen_label}
          </Space>
        }
        open={addlSectionsModalOpen}
        onOk={handleRequestAdditionalSections}
        onCancel={() => setAddlSectionsModalOpen(false)}
        okText="Request"
        okButtonProps={{ loading: addlSectionsLoading }}
        cancelText="Cancel"
        destroyOnHidden
        width={420}
      >
        <p style={{ marginBottom: 8, color: "#595959" }}>
          The grossing team will see this request in their worklist.
        </p>
        <Input.TextArea
          placeholder="Note for grossing tech (optional)..."
          rows={3}
          value={addlSectionsNote}
          onChange={(e) => setAddlSectionsNote(e.target.value)}
        />
      </Modal>
    </Card>
  );
};

export default SpecimenIntegratedWorkblock;

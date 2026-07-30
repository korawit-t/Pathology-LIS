import React from "react";
import { Row, Col, Form, Space, Typography, Button, Switch, Tag } from "antd";
import { FileTextOutlined, ExperimentOutlined, PictureOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import StyledCard from "../../../components/Layout/StyledCard";
import SimpleTiptapEditor from "../../../components/Editors/SimpleTiptapEditor";
import NongyneCytologyImageGrid from "./NongyneCytologyImageGrid";
import type { NongyneCaseImage } from "../../../services/nongyneCaseImageService";
import type { NongyneCytologyCase } from "../../../types/nongyne";

const { Text } = Typography;

interface NongyneDiagnosisFormSectionProps {
  isEditorLocked: boolean;
  caseData: NongyneCytologyCase | null;
  onOpenDiagnosisTemplates: () => void;
  onToggleCellBlock: (checked: boolean) => void;
  images: NongyneCaseImage[];
  descMap: Record<number, string>;
  setDescMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  saveDesc: (imgId: number) => Promise<void>;
  fetchImages: () => void;
  onEditImage: (img: NongyneCaseImage) => void;
  onAddImage: () => void;
}

const NongyneDiagnosisFormSection: React.FC<NongyneDiagnosisFormSectionProps> = ({
  isEditorLocked,
  caseData,
  onOpenDiagnosisTemplates,
  onToggleCellBlock,
  images,
  descMap,
  setDescMap,
  saveDesc,
  fetchImages,
  onEditImage,
  onAddImage,
}) => (
  <StyledCard styles={{ body: { padding: "24px" } }}>
    <Row gutter={24}>
      <Col xs={24} lg={12}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                <Button size="small" icon={<FileTextOutlined />} onClick={onOpenDiagnosisTemplates}>
                  Templates
                </Button>
              )}
            </div>
            <Form.Item
              name="diagnosis"
              noStyle
              rules={[{ required: true, message: "Diagnosis is required." }]}
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
            <Space size={12} style={{ marginBottom: caseData?.is_cell_block ? 12 : 0 }}>
              <Switch
                checked={caseData?.is_cell_block || false}
                onChange={onToggleCellBlock}
                disabled={isEditorLocked}
              />
              <Text strong>Cell block prepared</Text>
              {caseData?.is_cell_block && caseData.cell_block_prepared_at && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(caseData.cell_block_prepared_at).format("DD MMM YYYY HH:mm")}
                  {caseData.cell_block_prepared_by?.full_name &&
                    ` — ${caseData.cell_block_prepared_by.full_name}`}
                </Text>
              )}
            </Space>
            {caseData?.is_cell_block && caseData.cell_block_status && (
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
                  {caseData.cell_block_status.charAt(0).toUpperCase() +
                    caseData.cell_block_status.slice(1)}
                </Tag>
              </div>
            )}
          </section>
        </div>
      </Col>
      <Col xs={24} lg={12}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            onEditImage={onEditImage}
            onAddImage={onAddImage}
          />
        </div>
      </Col>
    </Row>
  </StyledCard>
);

export default NongyneDiagnosisFormSection;

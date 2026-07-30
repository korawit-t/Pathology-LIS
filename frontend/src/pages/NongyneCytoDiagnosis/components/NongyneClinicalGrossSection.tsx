import React from "react";
import { Row, Col, Form, Space, Typography, Button } from "antd";
import { FileTextOutlined, EyeOutlined } from "@ant-design/icons";
import StyledCard from "../../../components/Layout/StyledCard";
import SimpleTiptapEditor from "../../../components/Editors/SimpleTiptapEditor";

const { Text } = Typography;

interface NongyneClinicalGrossSectionProps {
  isEditorLocked: boolean;
  onOpenGrossTemplates: () => void;
}

const NongyneClinicalGrossSection: React.FC<NongyneClinicalGrossSectionProps> = ({
  isEditorLocked,
  onOpenGrossTemplates,
}) => (
  <Row gutter={16} align="stretch">
    <Col xs={24} lg={12}>
      <StyledCard styles={{ body: { padding: "24px" } }} style={{ height: "100%" }}>
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
      <StyledCard styles={{ body: { padding: "24px" } }} style={{ height: "100%" }}>
        <div
          style={{
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Space>
            <EyeOutlined style={{ color: "#595959" }} />
            <Text strong style={{ textTransform: "uppercase" }}>
              Gross Description
            </Text>
          </Space>
          {!isEditorLocked && (
            <Button size="small" icon={<FileTextOutlined />} onClick={onOpenGrossTemplates}>
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
);

export default NongyneClinicalGrossSection;

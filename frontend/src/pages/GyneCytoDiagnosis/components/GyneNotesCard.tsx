import React from "react";
import { Row, Col, Form, Input, Typography } from "antd";
import StyledCard from "../../../components/Layout/StyledCard";

const { TextArea } = Input;
const { Title } = Typography;

interface GyneNotesCardProps {
  isRevision: boolean;
  isEditorLocked: boolean;
}

const GyneNotesCard: React.FC<GyneNotesCardProps> = ({ isRevision, isEditorLocked }) => (
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
        <Form.Item name="note" label="Additional Notes / Recommendation">
          <TextArea rows={3} placeholder="Recommendations or remarks..." disabled={isEditorLocked} />
        </Form.Item>
      </Col>
      {isRevision && (
        <Col xs={24} lg={12}>
          <Form.Item
            name="revised_reason"
            label="Reason for Revision"
            rules={[
              { required: true, message: "Please specify the reason for revision." },
              { min: 5, message: "Reason must be at least 5 characters." },
            ]}
          >
            <TextArea rows={3} placeholder="Explain why this report is being revised..." />
          </Form.Item>
        </Col>
      )}
    </Row>
  </StyledCard>
);

export default GyneNotesCard;

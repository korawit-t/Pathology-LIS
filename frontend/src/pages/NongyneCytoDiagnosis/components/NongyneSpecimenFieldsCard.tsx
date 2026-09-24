import React from "react";
import { Row, Col, Form, Select, Input } from "antd";
import StyledCard from "../../../components/Layout/StyledCard";

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

interface NongyneSpecimenFieldsCardProps {
  isEditorLocked: boolean;
  slideCount: number | string | null | undefined;
}

const NongyneSpecimenFieldsCard: React.FC<NongyneSpecimenFieldsCardProps> = ({
  isEditorLocked,
  slideCount,
}) => (
  <StyledCard styles={{ body: { padding: "24px" } }}>
    <Row gutter={16}>
      <Col xs={24} sm={6}>
        <Form.Item
          name="specimen_type"
          label="Specimen Type"
          // Same reason as the diagnosis field: the Select is disabled while an
          // out-lab consult round is open, so requiring it there would block
          // sign-off with nothing the pathologist could do about it.
          rules={[{ required: !isEditorLocked }]}
          style={{ marginBottom: 0 }}
        >
          <Select disabled={isEditorLocked}>
            {SPECIMEN_TYPES.map((t) => (
              <Select.Option key={t} value={t}>
                {t}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} sm={6}>
        <Form.Item name="collection_site" label="Collection Site" style={{ marginBottom: 0 }}>
          <Input placeholder="e.g. Right lobe, Ascitic fluid" disabled={isEditorLocked} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={6}>
        <Form.Item name="received_volume_ml" label="Volume (ml)" style={{ marginBottom: 0 }}>
          <Input placeholder="e.g. 50" disabled={isEditorLocked} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={6}>
        <Form.Item label="Number of Slides" style={{ marginBottom: 0 }}>
          <Input value={slideCount ?? "—"} disabled />
        </Form.Item>
      </Col>
    </Row>
  </StyledCard>
);

export default NongyneSpecimenFieldsCard;

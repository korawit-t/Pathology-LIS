import React from "react";
import { Col, Form, Select, Typography } from "antd";
import StyledCard from "../../../components/Layout/StyledCard";
import type { GyneSpecimenAdequacy } from "../../../types/gyne-diagnosis";

const { Title } = Typography;

interface GyneAdequacyCardProps {
  adequacyOptions: GyneSpecimenAdequacy[];
  zoneOptions: GyneSpecimenAdequacy[];
  qualityOptions: GyneSpecimenAdequacy[];
  showZoneField: boolean;
  showQualityField: boolean;
}

const GyneAdequacyCard: React.FC<GyneAdequacyCardProps> = ({
  adequacyOptions,
  zoneOptions,
  qualityOptions,
  showZoneField,
  showQualityField,
}) => {
  const form = Form.useFormInstance();

  return (
    <Col xs={24} lg={12} style={{ display: "flex", flexDirection: "column" }}>
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
        <Form.Item name="adequacy_id" label="Adequacy" rules={[{ required: true, message: "Required" }]}>
          <Select
            placeholder="Select adequacy"
            allowClear
            size="large"
            onChange={(value) => {
              const text = adequacyOptions.find((o) => o.id === value)?.text ?? "";
              if (/unsatisfactory/i.test(text)) {
                form.setFieldValue("endocervical_status_id", null);
              } else if (!/limited by/i.test(text)) {
                form.setFieldValue("quality_id", null);
              }
            }}
          >
            {adequacyOptions.map((opt) => (
              <Select.Option key={opt.id} value={opt.id}>
                {opt.code ? `(${opt.code}) ` : ""}
                {opt.text}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {showZoneField && (
          <Form.Item name="endocervical_status_id" label="Endocervical / Transformation Zone">
            <Select placeholder="Select status" allowClear size="large">
              {zoneOptions.map((opt) => (
                <Select.Option key={opt.id} value={opt.id}>
                  {opt.code ? `(${opt.code}) ` : ""}
                  {opt.text}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        {showQualityField && (
          <Form.Item
            name="quality_id"
            label="Reason (Unsatisfactory / Limited by)"
            rules={[{ required: true, message: "Required" }]}
          >
            <Select placeholder="Select reason" allowClear size="large">
              {qualityOptions.map((opt) => (
                <Select.Option key={opt.id} value={opt.id}>
                  {opt.code ? `(${opt.code}) ` : ""}
                  {opt.text}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}
      </StyledCard>
    </Col>
  );
};

export default GyneAdequacyCard;

import React from "react";
import { Descriptions, Tag, Space, Typography } from "antd";
import dayjs from "dayjs";
import StyledCard from "../../../components/Layout/StyledCard";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";

const { Text, Title } = Typography;

interface GyneClinicalInfoCardProps {
  caseData: GyneCytologyCase;
}

const GyneClinicalInfoCard: React.FC<GyneClinicalInfoCardProps> = ({
  caseData,
}) => (
  <div style={{ padding: "0 24px 16px" }}>
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
          Clinical Information
        </Title>
      }
    >
      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, sm: 2, md: 3, lg: 4 }}
        labelStyle={{ fontWeight: 600, whiteSpace: "nowrap", width: 160 }}
      >
        <Descriptions.Item label="Specimen Type">
          {caseData.specimen_type || <Text type="secondary">—</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="Collection Site">
          {caseData.collection_site || <Text type="secondary">—</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="LMP Date">
          {caseData.last_menstrual_period ? (
            dayjs(caseData.last_menstrual_period).format("DD/MM/YYYY")
          ) : (
            <Text type="secondary">—</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Status">
          <Space size={4} wrap>
            {caseData.is_pregnant && <Tag color="blue">Pregnant</Tag>}
            {caseData.is_postmenopausal && (
              <Tag color="orange">Post-menopause</Tag>
            )}
            {!caseData.is_pregnant && !caseData.is_postmenopausal && (
              <Text type="secondary">—</Text>
            )}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Hormone / Contraception" span={2}>
          {caseData.hormone_therapy || <Text type="secondary">—</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="Clinical History" span={2}>
          {caseData.clinical_history || <Text type="secondary">—</Text>}
        </Descriptions.Item>
      </Descriptions>
    </StyledCard>
  </div>
);

export default GyneClinicalInfoCard;

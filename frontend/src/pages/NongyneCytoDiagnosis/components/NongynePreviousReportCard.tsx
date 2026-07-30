import React from "react";
import { Space, Typography } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import StyledCard from "../../../components/Layout/StyledCard";
import { sanitizeHtml } from "../../../utils/sanitize";
import type { NongyneDiagnosisResponse } from "../../../types/nongyneDiagnosis";

const { Text } = Typography;

interface NongynePreviousReportCardProps {
  prevDiagnosis: NongyneDiagnosisResponse;
}

const NongynePreviousReportCard: React.FC<NongynePreviousReportCardProps> = ({
  prevDiagnosis,
}) => (
  <StyledCard
    styles={{ body: { padding: "16px 24px" } }}
    style={{
      borderLeft: "4px solid #d9d9d9",
      marginBottom: 16,
      opacity: 0.85,
    }}
  >
    <Space style={{ marginBottom: 8 }}>
      <FileTextOutlined style={{ color: "#8c8c8c" }} />
      <Text type="secondary" style={{ fontWeight: 600, fontSize: 13 }}>
        Previous Report
        {prevDiagnosis.diagnosis_at
          ? ` — ${dayjs(prevDiagnosis.diagnosis_at).format("DD/MM/YYYY HH:mm")}`
          : ""}
      </Text>
    </Space>
    <div
      style={{ fontSize: 13 }}
      dangerouslySetInnerHTML={{
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
        __html: sanitizeHtml(prevDiagnosis.diagnosis),
      }}
    />
  </StyledCard>
);

export default NongynePreviousReportCard;

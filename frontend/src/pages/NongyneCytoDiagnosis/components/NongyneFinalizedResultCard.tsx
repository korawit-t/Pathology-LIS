import React from "react";
import { Space, Typography, Tag, Descriptions } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import StyledCard from "../../../components/Layout/StyledCard";
import SecureImage from "../../../components/SecureImage";
import { sanitizeHtml } from "../../../utils/sanitize";
import { API_BASE_URL } from "../../../services/httpClient";
import type { NongyneDiagnosisResponse } from "../../../types/nongyneDiagnosis";
import type { NongyneCytologyCase } from "../../../types/nongyne";
import type { NongyneCaseImage } from "../../../services/nongyneCaseImageService";

const { Text } = Typography;

interface NongyneFinalizedResultCardProps {
  diagnosis: NongyneDiagnosisResponse;
  caseData: NongyneCytologyCase | null;
  images: NongyneCaseImage[];
  specimenColor: string;
}

/** Read-only "Reported Result" card shown once a Nongyne diagnosis is
 * finalized — identical between the Pathologist and cytotechnologist Entry
 * pages, so it lives here once instead of being copy-pasted. The outer
 * visibility condition (when to show this card at all) stays with each
 * page's call site since that differs genuinely (e.g. the Pathologist page
 * also excludes addendum mode). */
const NongyneFinalizedResultCard: React.FC<NongyneFinalizedResultCardProps> = ({
  diagnosis,
  caseData,
  images,
  specimenColor,
}) => (
  <StyledCard styles={{ body: { padding: "20px 24px" } }}>
    <Descriptions
      title={
        <Space>
          <CheckCircleOutlined style={{ color: "#52c41a" }} />
          <Text strong style={{ fontSize: 15 }}>
            Reported Result
          </Text>
          {diagnosis.diagnosis_at && (
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              — {dayjs(diagnosis.diagnosis_at).format("DD MMM YYYY HH:mm")}
            </Text>
          )}
        </Space>
      }
      column={1}
      bordered
      size="small"
      labelStyle={{
        width: 220,
        fontWeight: 600,
        background: "#fafafa",
      }}
    >
      <Descriptions.Item label="Specimen / Site">
        <Space size={8}>
          <Tag color={specimenColor} style={{ fontWeight: 600 }}>
            {caseData?.specimen_type || "—"}
          </Tag>
          {caseData?.collection_site && (
            <Text type="secondary">{caseData.collection_site}</Text>
          )}
        </Space>
      </Descriptions.Item>
      {caseData?.received_volume_ml && (
        <Descriptions.Item label="Received Volume">
          {caseData.received_volume_ml} ml
        </Descriptions.Item>
      )}
      {caseData?.clinical_history && (
        <Descriptions.Item label="Clinical History">
          <div
            dangerouslySetInnerHTML={{
              // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
              __html: sanitizeHtml(caseData.clinical_history),
            }}
          />
        </Descriptions.Item>
      )}
      {diagnosis.gross_description && (
        <Descriptions.Item label="Gross Description">
          <div
            dangerouslySetInnerHTML={{
              // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
              __html: sanitizeHtml(diagnosis.gross_description),
            }}
          />
        </Descriptions.Item>
      )}
      <Descriptions.Item label="Microscopic Description">
        {diagnosis.microscopic_description ? (
          <div
            dangerouslySetInnerHTML={{
              // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
              __html: sanitizeHtml(diagnosis.microscopic_description),
            }}
          />
        ) : (
          <Text>—</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Diagnosis">
        {diagnosis.diagnosis ? (
          <div
            style={{ fontWeight: 500 }}
            dangerouslySetInnerHTML={{
              // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
              __html: sanitizeHtml(diagnosis.diagnosis),
            }}
          />
        ) : (
          <Text>—</Text>
        )}
      </Descriptions.Item>
      {diagnosis.comment && (
        <Descriptions.Item label="Comment">
          <Text style={{ whiteSpace: "pre-wrap" }}>{diagnosis.comment}</Text>
        </Descriptions.Item>
      )}
    </Descriptions>
    {images.filter((i) => i.show_in_report).length > 0 && (
      <div style={{ marginTop: 12 }}>
        <Text strong style={{ fontSize: 12, color: "#722ed1" }}>
          Cytology Images
        </Text>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 8,
          }}
        >
          {images
            .filter((i) => i.show_in_report)
            .map((img) => (
              <SecureImage
                key={img.id}
                src={`${API_BASE_URL}${img.image_url}`}
                width={140}
                height={110}
                style={{ objectFit: "cover", borderRadius: 4 }}
              />
            ))}
        </div>
      </div>
    )}
  </StyledCard>
);

export default NongyneFinalizedResultCard;

import React from "react";
import { Descriptions, Tag, Space, Typography, Divider, Image } from "antd";
import dayjs from "dayjs";
import StyledCard from "../../../components/Layout/StyledCard";
import SecureImage from "../../../components/SecureImage";
import { API_BASE_URL } from "../../../services/httpClient";
import type { GyneDiagnosisResponse } from "../../../types/gyne-diagnosis";
import type { GyneCaseImage } from "../../../services/gyneCaseImageService";

const { Text, Title } = Typography;

interface GyneReportedResultProps {
  diagnosis: GyneDiagnosisResponse;
  images: GyneCaseImage[];
}

const GyneReportedResult: React.FC<GyneReportedResultProps> = ({
  diagnosis,
  images,
}) => (
  <StyledCard size="small" style={{ marginBottom: 16 }}>
    <Descriptions
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
          Reported Result
        </Title>
      }
      column={2}
      bordered
      size="small"
      labelStyle={{ width: 200, fontWeight: 600 }}
    >
      <Descriptions.Item label="Adequacy">
        {diagnosis.adequacy_obj?.text || diagnosis.adequacy || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="Endocervical / Zone">
        {diagnosis.endocervical_status_obj?.text || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="Category" span={2}>
        <Space wrap>
          {diagnosis.category_1_obj && (
            <Tag color="blue">
              {diagnosis.category_1_obj.code} — {diagnosis.category_1_obj.text}
            </Tag>
          )}
          {diagnosis.category_2_obj && (
            <Tag color="magenta">
              {diagnosis.category_2_obj.code} — {diagnosis.category_2_obj.text}
            </Tag>
          )}
          {!diagnosis.category_1_obj && !diagnosis.category_2_obj && (
            <Text type="secondary">{diagnosis.category || "—"}</Text>
          )}
        </Space>
      </Descriptions.Item>
      <Descriptions.Item label="Interpretation" span={2}>
        {diagnosis.interpretation || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="Note" span={2}>
        {diagnosis.note || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="Reported At">
        {dayjs(diagnosis.created_at).format("DD/MM/YYYY HH:mm")}
      </Descriptions.Item>
    </Descriptions>

    {images.filter((i) => i.show_in_report).length > 0 && (
      <>
        <Divider style={{ margin: "16px 0 12px" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Cytology Images
          </Text>
        </Divider>
        <Image.PreviewGroup>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
        </Image.PreviewGroup>
      </>
    )}
  </StyledCard>
);

export default GyneReportedResult;

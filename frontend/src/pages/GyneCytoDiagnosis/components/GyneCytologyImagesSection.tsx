import React from "react";
import { Button, Image, Input, Switch, Typography } from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import StyledCard from "../../../components/Layout/StyledCard";
import SecureImage from "../../../components/SecureImage";
import GyneCaseImageService, {
  GyneCaseImage,
} from "../../../services/gyneCaseImageService";
import { API_BASE_URL } from "../../../services/httpClient";

const { Title } = Typography;

interface GyneCytologyImagesSectionProps {
  images: GyneCaseImage[];
  descMap: Record<number, string>;
  isFormLocked: boolean;
  onDescChange: (imgId: number, value: string) => void;
  onDescSave: (imgId: number) => void;
  onRefresh: () => void;
  onEdit: (img: GyneCaseImage) => void;
  onCapture: () => void;
}

const GyneCytologyImagesSection: React.FC<GyneCytologyImagesSectionProps> = ({
  images,
  descMap,
  isFormLocked,
  onDescChange,
  onDescSave,
  onRefresh,
  onEdit,
  onCapture,
}) => (
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
        <CameraOutlined style={{ marginRight: 8 }} />
        Cytology Images
      </Title>
    }
    style={{ marginBottom: 16 }}
  >
    <Image.PreviewGroup>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: images.length > 0 ? 12 : 0,
        }}
      >
        {images.map((img) => (
          <div key={img.id} style={{ position: "relative", width: 160 }}>
            <SecureImage
              src={`${API_BASE_URL}${img.image_url}`}
              width={160}
              height={120}
              style={{
                objectFit: "cover",
                borderRadius: 4,
                border: "1px solid #d9d9d9",
              }}
              preview={true}
            />
            <Input
              size="small"
              placeholder="Description..."
              value={descMap[img.id] ?? ""}
              disabled={isFormLocked}
              style={{ marginTop: 4, fontSize: 11 }}
              onChange={(e) => onDescChange(img.id, e.target.value)}
              onBlur={() => onDescSave(img.id)}
              onPressEnter={() => onDescSave(img.id)}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Switch
                size="small"
                checked={img.show_in_report}
                checkedChildren="In Report"
                unCheckedChildren="Hidden"
                disabled={isFormLocked}
                onChange={async (checked) => {
                  await GyneCaseImageService.update(img.id, {
                    show_in_report: checked,
                  });
                  onRefresh();
                }}
              />
              {!isFormLocked && (
                <>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onEdit(img)}
                  />
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={async () => {
                      await GyneCaseImageService.delete(img.id);
                      onRefresh();
                    }}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Image.PreviewGroup>

    {!isFormLocked && (
      <Button icon={<PlusOutlined />} onClick={onCapture}>
        Capture / Upload Image
      </Button>
    )}
  </StyledCard>
);

export default GyneCytologyImagesSection;

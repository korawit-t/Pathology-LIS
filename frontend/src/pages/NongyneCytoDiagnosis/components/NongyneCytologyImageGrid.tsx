import React from "react";
import { App, Space, Typography, Button, Input, Switch } from "antd";
import { CameraOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import SecureImage from "../../../components/SecureImage";
import { API_BASE_URL } from "../../../services/httpClient";
import NongyneCaseImageService, { NongyneCaseImage } from "../../../services/nongyneCaseImageService";
import { getErrorDetail } from "../../../utils/errorHandler";

const { Text } = Typography;

interface NongyneCytologyImageGridProps {
  images: NongyneCaseImage[];
  descMap: Record<number, string>;
  setDescMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  saveDesc: (imgId: number) => Promise<void>;
  fetchImages: () => void;
  disabled: boolean;
  onEditImage: (img: NongyneCaseImage) => void;
  onAddImage: () => void;
}

/** Editable "Cytology Images" grid shared by both the Pathologist and
 * cytotechnologist Nongyne diagnosis pages — identical in both, so it lives
 * here once instead of being copy-pasted. */
const NongyneCytologyImageGrid: React.FC<NongyneCytologyImageGridProps> = ({
  images,
  descMap,
  setDescMap,
  saveDesc,
  fetchImages,
  disabled,
  onEditImage,
  onAddImage,
}) => {
  const { message } = App.useApp();

  // The backend rejects image writes on a signed-out / published case with
  // 423; without a catch these buttons failed silently and left the grid
  // showing state the server never accepted.
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action();
      fetchImages();
    } catch (err) {
      message.error(getErrorDetail(err) ?? fallback);
    }
  };

  return (
    <section>
      <div style={{ marginBottom: 8 }}>
        <Space>
          <CameraOutlined style={{ color: "#595959" }} />
          <Text strong style={{ textTransform: "uppercase" }}>
            Cytology Images
          </Text>
        </Space>
      </div>
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
              disabled={disabled}
              style={{ marginTop: 4, fontSize: 11 }}
              onChange={(e) =>
                setDescMap((prev) => ({
                  ...prev,
                  [img.id]: e.target.value,
                }))
              }
              onBlur={() => saveDesc(img.id)}
              onPressEnter={() => saveDesc(img.id)}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Switch
                size="small"
                checked={img.show_in_report}
                checkedChildren="In Report"
                unCheckedChildren="Hidden"
                onChange={(checked) =>
                  run(
                    () => NongyneCaseImageService.update(img.id, { show_in_report: checked }),
                    "Failed to update the image",
                  )
                }
              />
              {!disabled && (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => onEditImage(img)}
                />
              )}
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  run(() => NongyneCaseImageService.delete(img.id), "Failed to delete the image")
                }
              />
            </div>
          </div>
        ))}
      </div>
      {!disabled && (
        <Button icon={<PlusOutlined />} onClick={onAddImage}>
          Capture / Upload Image
        </Button>
      )}
    </section>
  );
};

export default NongyneCytologyImageGrid;

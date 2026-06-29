import React, { useState } from "react";
import {
  Image,
  Empty,
  Button,
  Space,
  Typography,
  Popconfirm,
  Spin,
  message,
  Switch,
} from "antd";
import {
  CameraOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { MicroscopicImage } from "../../../../types/image";
import MicroscopicImageService from "../../../../services/microscopicImageService";
import logger from "../../../../utils/logger";
import { useSecureSrc } from "../../../../components/SecureImage";

const { Text } = Typography;

interface ImageItemProps {
  img: MicroscopicImage;
  isLocked: boolean;
  deletingId: number | null;
  onEdit?: (img: MicroscopicImage) => void;
  onDelete: (id: number) => void;
  onRefresh?: () => void;
}

const MicroscopicImageItem: React.FC<ImageItemProps> = ({
  img, isLocked, deletingId, onEdit, onDelete, onRefresh,
}) => {
  const blobSrc = useSecureSrc(MicroscopicImageService.getSecureImageUrl(img.image_url));

  return (
    <div style={{ position: "relative" }}>
      <Image
        width="100%"
        height={90}
        style={{ objectFit: "cover", borderRadius: "4px", border: "1px solid #f0f0f0" }}
        src={blobSrc}
        fallback="/placeholder-image.png"
        preview={blobSrc ? { src: blobSrc } : false}
      />
      <div
        style={{ marginTop: 4, textAlign: "left", cursor: !isLocked ? "pointer" : "default" }}
        onClick={() => !isLocked && onEdit && onEdit(img)}
      >
        <Space size={4}>
          {!isLocked && <EditOutlined style={{ fontSize: "10px", color: "#1890ff" }} />}
          <Text
            style={{ fontSize: "11px", display: "block" }}
            ellipsis={{ tooltip: img.description || `${img.magnification} ${img.stain}` }}
          >
            {img.description || `${img.magnification} ${img.stain}`}
          </Text>
        </Space>
      </div>
      {!isLocked && (
        <div style={{ marginTop: 4, textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checkedChildren="Show"
            unCheckedChildren="Hide"
            checked={img.show_in_report !== false}
            onChange={async (checked) => {
              try {
                await MicroscopicImageService.updateImage(img.id, { show_in_report: checked } as any);
                if (onRefresh) onRefresh();
              } catch {
                message.error("บันทึกไม่สำเร็จ");
              }
            }}
          />
        </div>
      )}
      {!isLocked && (
        <Popconfirm title="ลบรูปภาพ?" onConfirm={() => onDelete(img.id)}>
          <Button
            type="primary" danger shape="circle" size="small"
            icon={deletingId === img.id ? <Spin size="small" /> : <DeleteOutlined />}
            style={{ position: "absolute", top: -8, right: -8, width: "22px", height: "22px", fontSize: "10px", zIndex: 10 }}
          />
        </Popconfirm>
      )}
    </div>
  );
};

interface MicroscopicImageGalleryProps {
  specimenId: number;
  images?: MicroscopicImage[];
  isLocked: boolean;
  onRefresh?: () => void; // ฟังก์ชันเรียกโหลดข้อมูลใหม่หลังจากอัปโหลดหรือลบ
  onOpenCapture?: () => void; // ฟังก์ชันเปิด Modal กล้อง
  onEditImage?: (image: MicroscopicImage) => void;
}

const MicroscopicImageGallery: React.FC<MicroscopicImageGalleryProps> = ({
  specimenId,
  images = [],
  isLocked,
  onRefresh,
  onOpenCapture,
  onEditImage,
}) => {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // 🚩 ฟังก์ชันสำหรับอัปเดตคำอธิบายภาพ
  // 🚩 ฟังก์ชันอัปเดตคำอธิบายภาพ
  const handleUpdateCaption = async (id: number, newCaption: string) => {
    setUpdatingId(id);
    try {
      // เรียกใช้ Service สำหรับ PATCH ข้อมูลเฉพาะฟิลด์ caption
      await MicroscopicImageService.updateImage(id, {
        description: newCaption,
      });
      message.success("อัปเดตคำอธิบายเรียบร้อย");
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await MicroscopicImageService.deleteImage(id);
      if (onRefresh) onRefresh();
    } catch (error) {
      logger.error("Delete failed", error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ padding: "8px 0" }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text type="secondary">{images.length} Image(s) available</Text>
        {!isLocked && (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<CameraOutlined />}
            onClick={onOpenCapture}
          >
            Capture / Upload
          </Button>
        )}
      </div>

      {images.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No microscopic images"
          style={{ margin: "20px 0" }}
        />
      ) : (
        <Image.PreviewGroup>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", // ขยายกว้างขึ้นนิดหน่อยให้พิมพ์สะดวก
              gap: "16px", // เพิ่มช่องว่างให้ดูโปร่งขึ้น
            }}
          >
            {images.map((img) => (
              <MicroscopicImageItem
                key={img.id}
                img={img}
                isLocked={isLocked}
                deletingId={deletingId}
                onEdit={onEditImage}
                onDelete={handleDelete}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </Image.PreviewGroup>
      )}
    </div>
  );
};

export default MicroscopicImageGallery;

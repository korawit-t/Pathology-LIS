import React from "react";
// 🌟 นำเข้า Image จาก antd
import {
  Card,
  Button,
  Row,
  Col,
  Typography,
  Popconfirm,
  Empty,
  Tag,
  Space,
  Image,
  Switch, // 🚩 เพิ่ม Switch สำหรับ Toggle
} from "antd";
import {
  CameraOutlined,
  DeleteOutlined,
  PictureOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { API_BASE_URL } from "../../../../services/httpClient";
import SecureImage from "../../../../components/SecureImage";
import GrossImageService from "../../../../services/grossImageService";
import type { GrossImage } from "../../../../types/image";
import type { Specimen } from "../../../../components/SpecimenManagerSection/SpecimenManagerSection";
import logger from "../../../../utils/logger";

const { Text } = Typography;

interface GrossImageGalleryProps {
  images: GrossImage[];
  specimens: Specimen[];
  onOpenCapture: () => void;
  onDeleteImage: (id: number) => void;
  onRefresh?: () => void; // 🚩 Callback สำหรับโหลดรูปใหม่หลังสลับสถานะ
  loading?: boolean;
}

const GrossImageGallery: React.FC<GrossImageGalleryProps> = ({
  images,
  specimens,
  onOpenCapture,
  onDeleteImage,
  onRefresh,
  loading,
}) => {
  const handleToggleVisibility = async (imageId: number, checked: boolean) => {
    try {
      await GrossImageService.updateImage(imageId, { show_in_report: checked });
      if (onRefresh) onRefresh();
    } catch (err) {
      logger.error("Failed to update image visibility", err);
    }
  };
  return (
    <div style={{ padding: "8px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Text strong>
          <PictureOutlined /> Gross Image Gallery
        </Text>
        <Button
          type="primary"
          icon={<CameraOutlined />}
          onClick={onOpenCapture}
          loading={loading}
        >
          Capture/Upload Image
        </Button>
      </div>

      {/* 🌟 ครอบด้วย Image.PreviewGroup เพื่อให้กดเลื่อนดูรูปถัดไปตอนเต็มจอได้ */}
      <Image.PreviewGroup>
        <Row gutter={[16, 16]}>
          {images.length > 0 ? (
            images.map((image) => {
              const spec = specimens.find((s) => s.id === image.specimen_id);

              return (
                <Col xs={12} sm={8} md={6} lg={4} key={image.id}>
                  <Card
                    hoverable
                    bodyStyle={{ padding: "8px" }}
                    cover={
                      /* 🌟 ใช้ Image แทน img ปกติ */
                      <SecureImage
                        alt={image.original_filename}
                        src={`${API_BASE_URL}${image.image_url}`}
                        style={{ height: 160, objectFit: "cover" }}
                        preview={{
                          mask: (
                            <>
                              <EyeOutlined /> ดูรูปขยาย
                            </>
                          ),
                        }}
                      />
                    }
                    actions={[
                      <div onClick={(e) => e.stopPropagation()}>
                        <Switch
                          key="visibility"
                          checkedChildren="Show"
                          unCheckedChildren="Hide"
                          checked={image.show_in_report !== false}
                          onChange={(checked) =>
                            handleToggleVisibility(image.id, checked)
                          }
                        />
                      </div>,
                      <Popconfirm
                        key="delete"
                        title="ยืนยันการลบรูปภาพ?"
                        onConfirm={() => onDeleteImage(image.id)}
                        okText="ลบ"
                        cancelText="ยกเลิก"
                      >
                        <DeleteOutlined style={{ color: "#ff4d4f" }} />
                      </Popconfirm>,
                    ]}
                  >
                    <Card.Meta
                      title={
                        <Space
                          direction="vertical"
                          size={2}
                          style={{ width: "100%" }}
                        >
                          {/* แสดง Label และ Name ควบคู่กัน */}
                          <Space>
                            <Tag color="blue" style={{ margin: 0 }}>
                              {spec?.specimen_label || "-"}
                            </Tag>
                            <Text strong style={{ fontSize: "13px" }} ellipsis>
                              {spec?.specimen_name || "ไม่ระบุชื่อชิ้นเนื้อ"}
                            </Text>
                          </Space>

                          {/* ชื่อไฟล์เดิมขนาดเล็ก */}
                          <Text
                            type="secondary"
                            ellipsis
                            style={{ fontSize: "11px", display: "block" }}
                          >
                            {image.original_filename}
                          </Text>
                        </Space>
                      }
                    />
                  </Card>
                </Col>
              );
            })
          ) : (
            <Col span={24}>
              <Empty description="ยังไม่มีรูปภาพในเคสนี้" />
            </Col>
          )}
        </Row>
      </Image.PreviewGroup>
    </div>
  );
};

export default GrossImageGallery;

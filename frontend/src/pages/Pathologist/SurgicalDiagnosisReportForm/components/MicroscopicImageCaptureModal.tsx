import React, {
  useRef,
  useState,
  useCallback,
  FC,
  ChangeEvent,
  useEffect,
} from "react";
import {
  Modal,
  Button,
  message,
  Space,
  Typography,
  Divider,
  Select,
  Row,
  Col,
  Input,
} from "antd";
import {
  CameraOutlined,
  RedoOutlined,
  UploadOutlined,
  CloseOutlined,
  BlockOutlined,
  FileImageOutlined,
  EditOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";
import styles from "./MicroscopicImageCaptureModal.module.css"; // ใช้สไตล์เดียวกับ Gross ได้
import { MicroscopicImage } from "../../../../types/image";
import MicroscopicImageService from "../../../../services/microscopicImageService";
import { useSecureSrc } from "../../../../components/SecureImage";
import { ImageEditor } from "../../../Gross/components/GrossImageCaptureModal/ImageEditor"; // 🌟 นำเข้า ImageEditor
import type { Specimen } from "../../../../components/SpecimenManagerSection/SpecimenManagerSection";

const { Text } = Typography;
const { TextArea } = Input;

interface MicroscopicImageCaptureModalProps {
  open: boolean;
  specimenId: number | null;
  onClose: () => void;
  onSuccess: () => void;
  specimens: Specimen[];
  // 🚩 ปรับ callback ให้ส่ง metadata (magnification, stain) กลับไปด้วย
  onCaptureAndUpload: (
    imageSrc: string,
    specimenId: number,
    metadata: { magnification: string; stain: string; description: string }
  ) => void;
  editingImage?: MicroscopicImage | null;
}

const videoConstraints = {
  width: 1920, // แนะนำความละเอียดสูงสำหรับภาพจากกล้องจุลทรรศน์
  height: 1080,
  facingMode: "environment",
};

const MicroscopicImageCaptureModal: FC<MicroscopicImageCaptureModalProps> = ({
  open,
  editingImage,
  specimenId,
  onClose,
  onSuccess,
  specimens,
  onCaptureAndUpload,
}) => {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [editingApiUrl, setEditingApiUrl] = useState<string | undefined>();
  const editingBlobSrc = useSecureSrc(editingApiUrl);
  const displaySrc = editingApiUrl ? editingBlobSrc : imageSrc;
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<number | null>(
    null
  );
  const [magnification, setMagnification] = useState<string>("10x");
  const [stain, setStain] = useState<string>("H&E");
  const [description, setDescription] = useState<string>("");

  const [showEditor, setShowEditor] = useState(false); // 🌟 ใช้เปิด/ปิด Image Editor

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const image = webcamRef.current.getScreenshot();
      if (image) {
        setImageSrc(image);
        setShowEditor(true); // 🌟 เปิดหน้า Editor
        message.success("บันทึกภาพตัวอย่างสำเร็จ");
      }
    }
  }, [webcamRef]);

  // 🚩 ฟังก์ชันจัดการการเลือกไฟล์จากเครื่อง
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        // จำกัด 10MB
        message.error("ขนาดไฟล์ใหญ่เกินไป (จำกัด 10MB)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageSrc(reader.result as string);
        setShowEditor(true); // 🌟 เปิดหน้า Editor
        message.success("โหลดไฟล์ภาพสำเร็จ");
      };
      reader.readAsDataURL(file);
    }
  };

  // 🚩 ฟังก์ชันเปิดหน้าต่างเลือกไฟล์
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = () => {
    if (!imageSrc || !selectedSpecimenId) {
      message.error("กรุณาเลือกชิ้นเนื้อและถ่ายภาพก่อนอัปโหลด");
      return;
    }
    onCaptureAndUpload(imageSrc, selectedSpecimenId, {
      magnification,
      stain,
      description,
    });
    setImageSrc(null);
    setShowEditor(false);    
    onClose();
  };

  const handleEditorSave = (finalImageSrc: string) => {
    setImageSrc(finalImageSrc);
    setShowEditor(false);
  };

  // 🚩 ใช้ useEffect เพื่อโหลดข้อมูลเก่าใส่ State เมื่อมีการกดแก้ไข
  useEffect(() => {
    if (editingImage) {
      setEditingApiUrl(MicroscopicImageService.getSecureImageUrl(editingImage.image_url));
      setImageSrc(null);
      setSelectedSpecimenId(editingImage.specimen_id);
      setMagnification(editingImage.magnification || "10x");
      setStain(editingImage.stain || "H&E");
      setDescription(editingImage.description || "");
    } else {
      setEditingApiUrl(undefined);
      setImageSrc(null);
      setDescription("");
      setShowEditor(false);
    }
  }, [editingImage, open]);

  return (
    <Modal
      title={
        <Space>
          {/* 🚩 เปลี่ยน Icon ตามโหมด */}
          {editingImage ? (
            <EditOutlined style={{ color: "#52c41a" }} />
          ) : (
            <CameraOutlined style={{ color: "#1890ff" }} />
          )}
          <Text strong>
            {editingImage
              ? "Edit Microscopic Image Info"
              : "Microscopic Image Capture"}
          </Text>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={1000}
      centered
      destroyOnClose
      footer={[
        <Button key="cancel" icon={<CloseOutlined />} onClick={onClose}>
          ยกเลิก
        </Button>,

        // 🚩 ซ่อนปุ่ม ถ่ายใหม่/เลือกไฟล์/กดถ่าย ถ้าเป็นการแก้ไข (เพราะไฟล์อัปโหลดไปแล้ว)
        !editingImage && (
          <Button
            key="retake"
            danger
            icon={<RedoOutlined />}
            onClick={() => {
              setImageSrc(null);
              setShowEditor(false);
            }}
            disabled={!imageSrc}
          >
            ถ่ายใหม่
          </Button>
        ),
        !editingImage && (
          <Button
            key="select-file"
            icon={<FileImageOutlined />}
            onClick={triggerFileSelect}
            disabled={!!imageSrc}
          >
            เลือกจากไฟล์
          </Button>
        ),
        !editingImage && (
          <Button
            key="capture"
            type="primary"
            icon={<CameraOutlined />}
            onClick={capture}
            disabled={!!imageSrc}
          >
            กดถ่ายรูป
          </Button>
        ),

        // 🚩 ปุ่มยืนยัน: เปลี่ยนข้อความตามสถานะ
        <Button
          key="upload"
          type="primary"
          className={editingImage ? "" : styles.uploadBtn}
          style={
            editingImage
              ? { backgroundColor: "#52c41a", borderColor: "#52c41a" }
              : {}
          }
          icon={<UploadOutlined />}
          onClick={handleUpload}
          disabled={!imageSrc || !selectedSpecimenId}
        >
          {editingImage ? "บันทึกการแก้ไข" : "ยืนยันและอัปโหลด"}
        </Button>,
      ]}
      styles={{ body: { padding: showEditor ? 0 : 24 } }}
    >
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handleFileChange}
      />

      {showEditor && imageSrc ? (
        <ImageEditor 
          imageSrc={imageSrc} 
          onSave={handleEditorSave} 
          onCancel={() => setShowEditor(false)} 
        />
      ) : (
      <div className={styles.container}>
        <div className={styles.metadataHeader}>
          <Row gutter={[16, 16]}>
            {" "}
            {/* 🚩 เพิ่ม gutter แถวตั้งเผื่อจอแคบ */}
            <Col span={9}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>Specimen Relation:</Text>
                <Select
                  style={{ width: "100%" }}
                  placeholder="เลือกชิ้นเนื้อ"
                  value={selectedSpecimenId}
                  onChange={setSelectedSpecimenId}
                  // 🚩 โหมดแก้ไขอาจจะไม่ควรเปลี่ยนชิ้นเนื้อที่ผูกไว้ (แล้วแต่ Business Logic)
                  // disabled={!!editingImage}
                >
                  {specimens.map((spec) => (
                    <Select.Option key={spec.id} value={spec.id}>
                      {spec.specimen_label}: {spec.specimen_name}
                    </Select.Option>
                  ))}
                </Select>
              </Space>
            </Col>
            <Col span={7}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>Magnification:</Text>
                <Select
                  style={{ width: "100%" }}
                  value={magnification}
                  onChange={setMagnification}
                >
                  {["4x", "10x", "20x", "40x", "100x"].map((m) => (
                    <Select.Option key={m} value={m}>
                      {m}
                    </Select.Option>
                  ))}
                </Select>
              </Space>
            </Col>
            <Col span={8}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>Primary Stain:</Text>
                <Select
                  style={{ width: "100%" }}
                  value={stain}
                  onChange={setStain}
                >
                  {["H&E", "PAS", "IHC", "GMS", "Special Stain", "Giemsa"].map(
                    (s) => (
                      <Select.Option key={s} value={s}>
                        {s}
                      </Select.Option>
                    )
                  )}
                </Select>
              </Space>
            </Col>
          </Row>

          {/* 🚩 ย้าย Description มาไว้อีก Row เพื่อให้พิมพ์ได้ยาวขึ้น */}
          <Row style={{ marginTop: 12 }}>
            <Col span={24}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>
                  <EditOutlined /> Description:
                </Text>
                <Input
                  placeholder="กรอกรายละเอียดพยาธิสภาพของภาพนี้..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  allowClear
                />
              </Space>
            </Col>
          </Row>
        </div>

        <div className={styles.previewArea}>
          {displaySrc ? (
            <div className={styles.imageWrapper}>
              <img
                src={displaySrc}
                alt="Preview"
                className={styles.capturedImage}
              />
              {/* 🚩 แสดง Badge บอกสถานะว่าเป็นการ Preview รูปเก่าหรือรูปใหม่ */}
              <div className={styles.overlayText}>
                {editingImage ? "Current Image" : "Preview Mode"}
              </div>
            </div>
          ) : (
            <Webcam
              audio={false}
              ref={webcamRef}
              mirrored={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              className={styles.webcam}
            />
          )}

          <div className={styles.magnificationLabel}>
            <Text style={{ color: "#fff" }}>
              <BlockOutlined /> {magnification} | {stain}
            </Text>
          </div>
        </div>
      </div>
      )}
    </Modal>
  );
};

export default MicroscopicImageCaptureModal;

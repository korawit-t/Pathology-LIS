import React, { useRef, useState, useCallback, useEffect, FC } from "react";
import {
  Modal,
  Button,
  message,
  Space,
  Typography,
  Divider,
  Select,
  Switch,
  Tooltip,
} from "antd"; // 🌟 เพิ่ม Select
import {
  CameraOutlined,
  RedoOutlined,
  UploadOutlined,
  CloseOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";
import { ImageEditor } from "./ImageEditor"; // 🌟 นำเข้า ImageEditor
import styles from "./GrossImageCaptureModal.module.css";
import type { Specimen } from "../../../../components/SpecimenManagerSection/SpecimenManagerSection";
import { isImageCaptureSupported, captureHighResPhoto } from "../../../../utils/imageCapture";
import { getDataUrlByteSize, oversizeMessage } from "../../../../utils/imageUpload";
import { MAX_IMAGE_UPLOAD_BYTES } from "../../../../constants/upload.constants";

const { Text } = Typography;

interface GrossImageCaptureModalProps {
  open: boolean;
  onClose: () => void;
  // 🌟 เพิ่ม specimens เข้ามาเพื่อสร้าง Dropdown
  specimens: Specimen[];
  // 🌟 ปรับ onCaptureAndUpload ให้รับ specimenId ด้วย
  onCaptureAndUpload: (imageSrc: string, specimenId: number | null) => void;
}

const videoConstraints = {
  width: 1920,
  height: 1080,
  facingMode: "environment",
};

const GrossImageCaptureModal: FC<GrossImageCaptureModalProps> = ({
  open,
  onClose,
  specimens,
  onCaptureAndUpload,
}) => {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<number | null>(
    null,
  ); // 🌟 เก็บ ID ที่เลือก

  const [showEditor, setShowEditor] = useState(false); // 🌟 ใช้เปิด/ปิด Image Editor

  const [hqMode, setHqMode] = useState(false);
  const [hqSupported, setHqSupported] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    setHqSupported(isImageCaptureSupported());
  }, []);

  // ตรวจขนาดไฟล์ทันทีหลังถ่าย/เลือกไฟล์ ก่อนเปิด Editor — กันไม่ให้เสียเวลา
  // crop/annotate ไปกับไฟล์ที่ท้ายที่สุดอัปโหลดไม่ได้
  const finalizeCapture = useCallback(
    async (dataUrl: string, successMessage: string) => {
      const bytes = await getDataUrlByteSize(dataUrl);
      if (bytes > MAX_IMAGE_UPLOAD_BYTES) {
        message.error(oversizeMessage(bytes));
        return;
      }
      setImageSrc(dataUrl);
      setShowEditor(true); // 🌟 เปิดหน้า Editor
      message.success(successMessage);
    },
    []
  );

  // 🌟 ฟังก์ชันจัดการเมื่อเลือกไฟล์จากเครื่อง
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        message.error(oversizeMessage(file.size));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        finalizeCapture(reader.result as string, "เลือกไฟล์ภาพสำเร็จ");
      };
      reader.readAsDataURL(file);
    }
  };

  // 🌟 ฟังก์ชันเปิดหน้าต่างเลือกไฟล์
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const captureViaScreenshot = useCallback(() => {
    if (webcamRef.current) {
      const image = webcamRef.current.getScreenshot();
      if (image) {
        finalizeCapture(image, "บันทึกภาพชั่วคราวแล้ว");
      }
    }
  }, [webcamRef, finalizeCapture]);

  const capture = useCallback(async () => {
    if (hqMode && hqSupported) {
      const track = webcamRef.current?.stream?.getVideoTracks()[0];
      if (!track) {
        message.error("ไม่พบกล้อง กรุณาลองใหม่อีกครั้ง");
        return;
      }
      setCapturing(true);
      try {
        const blob = await captureHighResPhoto(track);
        const reader = new FileReader();
        reader.onloadend = () => {
          finalizeCapture(reader.result as string, "ถ่ายภาพความละเอียดสูงสำเร็จ");
        };
        reader.readAsDataURL(blob);
      } catch {
        message.warning("ถ่ายภาพความละเอียดสูงไม่สำเร็จ ใช้ภาพจากวิดีโอแทน");
        captureViaScreenshot();
      } finally {
        setCapturing(false);
      }
      return;
    }
    captureViaScreenshot();
  }, [hqMode, hqSupported, captureViaScreenshot, finalizeCapture]);

  const retake = () => {
    setImageSrc(null);
    setShowEditor(false);
  };

  const handleUpload = () => {
    if (!imageSrc) {
      message.error("กรุณาถ่ายภาพก่อนทำการอัปโหลด");
      return;
    }
    // ส่งทั้งรูปและ ID ของชิ้นเนื้อกลับไป
    onCaptureAndUpload(imageSrc, selectedSpecimenId);
    setImageSrc(null);
    setShowEditor(false);
    setSelectedSpecimenId(null); // Reset
    onClose();
  };

  const handleEditorSave = (finalImageSrc: string) => {
    setImageSrc(finalImageSrc);
    setShowEditor(false);
  };

  return (
    <Modal
      title={
        <div>
          <Space>
            <CameraOutlined />
            <span>Gross Image Capture</span>
          </Space>
          <div style={{ marginTop: 4 }}>
            <Tooltip
              title={
                hqSupported
                  ? undefined
                  : "เบราว์เซอร์นี้ไม่รองรับการถ่ายภาพความละเอียดสูง"
              }
            >
              <Switch
                size="small"
                checked={hqMode}
                onChange={setHqMode}
                disabled={!hqSupported}
              />
            </Tooltip>
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              ถ่ายภาพความละเอียดสูง (HQ)
            </Text>
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={950}
      centered
      destroyOnClose
      footer={[
        <Button key="cancel" icon={<CloseOutlined />} onClick={onClose}>
          ยกเลิก
        </Button>,
        <Button
          key="retake"
          danger
          icon={<RedoOutlined />}
          onClick={retake}
          disabled={!imageSrc}
        >
          ถ่ายใหม่
        </Button>,

        // 🌟 เพิ่มปุ่มเลือกไฟล์จากเครื่อง
        <Button
          key="browse"
          icon={<FileImageOutlined />}
          onClick={triggerFileInput}
          disabled={!!imageSrc}
        >
          เลือกจากไฟล์
        </Button>,

        <Button
          key="capture"
          type="primary"
          icon={<CameraOutlined />}
          onClick={capture}
          loading={capturing}
          disabled={!!imageSrc || capturing}
        >
          กดถ่ายรูป
        </Button>,
        <Button
          key="upload"
          type="primary"
          style={{
            backgroundColor:
              !imageSrc || !selectedSpecimenId ? "#f5f5f5" : "#52c41a",
            borderColor:
              !imageSrc || !selectedSpecimenId ? "#d9d9d9" : "#52c41a",
          }}
          icon={<UploadOutlined />}
          onClick={handleUpload}
          // 🚩 บังคับต้องมีทั้งรูปภาพ และ เลือกชิ้นเนื้อ
          disabled={!imageSrc || !selectedSpecimenId}
        >
          ยืนยันและอัปโหลด
        </Button>,
      ]}
      styles={{ body: { padding: showEditor ? 0 : 24 } }}
    >
      {showEditor && imageSrc ? (
        <ImageEditor
          imageSrc={imageSrc}
          onSave={handleEditorSave}
          onCancel={() => setShowEditor(false)}
        />
      ) : (
        <div className={styles.container}>
          {/* 🌟 ส่วนเลือกชิ้นเนื้อ (เพิ่มใหม่) */}
          {/* 🌟 Input File แบบซ่อน */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*"
            onChange={handleFileChange}
          />

          <div style={{ marginBottom: 16, textAlign: "center" }}>
            <Space>
              <Text strong>ภาพถ่ายของชิ้นเนื้อ:</Text>
              <Select
                style={{ width: 300 }}
                placeholder="กรุณาเลือกชิ้นเนื้อ (ระบุ Relation)"
                value={selectedSpecimenId}
                onChange={(value) => setSelectedSpecimenId(value)}
                allowClear
              >
                {specimens.map((spec) => (
                  <Select.Option key={spec.id} value={spec.id}>
                    {spec.specimen_label}: {spec.specimen_name}
                  </Select.Option>
                ))}
              </Select>
            </Space>
          </div>

          <div className={styles.previewArea}>
            {imageSrc ? (
              <div className={styles.imageWrapper}>
                <img
                  src={imageSrc}
                  alt="Captured Gross"
                  className={styles.capturedImage}
                />
                <div className={styles.overlayText}>Preview Mode</div>
              </div>
            ) : (
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className={styles.webcam}
              />
            )}
          </div>

          <Divider plain>
            <Text type="secondary">
              {imageSrc
                ? "ตรวจสอบรูปภาพและชิ้นเนื้อที่เลือกก่อนอัปโหลด"
                : "ปรับตำแหน่งชิ้นเนื้อให้ชัดเจน"}
            </Text>
          </Divider>
        </div>
      )}
    </Modal>
  );
};

export default GrossImageCaptureModal;

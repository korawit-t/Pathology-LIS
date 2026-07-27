import React, { useRef, useState, FC } from "react";
import {
  Modal,
  Button,
  App,
  Space,
  Typography,
  Divider,
  Select,
} from "antd";
import {
  CameraOutlined,
  RedoOutlined,
  UploadOutlined,
  CloseOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";
import { ImageEditor } from "../../../../components/ImageEditor";
import styles from "./GrossImageCaptureModal.module.css";
import type { Specimen } from "../../../../components/SpecimenManagerSection/SpecimenManagerSection";
import { HqCaptureToggle } from "../../../../components/HqCaptureToggle";
import { DEFAULT_VIDEO_CONSTRAINTS } from "../../../../utils/imageCapture";
import { useImageCapture } from "../../../../hooks/useImageCapture";

const { Text } = Typography;

interface GrossImageCaptureModalProps {
  open: boolean;
  onClose: () => void;
  specimens: Specimen[];
  onCaptureAndUpload: (imageSrc: string, specimenId: number | null) => void;
}

const GrossImageCaptureModal: FC<GrossImageCaptureModalProps> = ({
  open,
  onClose,
  specimens,
  onCaptureAndUpload,
}) => {
  const { message } = App.useApp();
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<number | null>(
    null,
  );

  const [showEditor, setShowEditor] = useState(false);

  const onCaptured = (dataUrl: string) => {
    setImageSrc(dataUrl);
    setShowEditor(true);
  };
  const { hqMode, setHqMode, hqSupported, capturing, capture, handleFileChange } =
    useImageCapture(webcamRef, onCaptured, open);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const retake = () => {
    setImageSrc(null);
    setShowEditor(false);
  };

  const handleUpload = () => {
    if (!imageSrc) {
      message.error("Please capture an image before uploading");
      return;
    }
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
          <HqCaptureToggle hqMode={hqMode} hqSupported={hqSupported} onChange={setHqMode} />
        </div>
      }
      open={open}
      onCancel={onClose}
      width={950}
      centered
      destroyOnClose
      footer={[
        <Button key="cancel" icon={<CloseOutlined />} onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="retake"
          danger
          icon={<RedoOutlined />}
          onClick={retake}
          disabled={!imageSrc}
        >
          Retake
        </Button>,
        <Button
          key="browse"
          icon={<FileImageOutlined />}
          onClick={triggerFileInput}
          disabled={!!imageSrc}
        >
          Select File
        </Button>,

        <Button
          key="capture"
          type="primary"
          icon={<CameraOutlined />}
          onClick={() => capture("Image captured successfully")}
          loading={capturing}
          disabled={!!imageSrc || capturing}
        >
          Capture
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
          // Require both an image and a selected specimen
          disabled={!imageSrc || !selectedSpecimenId}
        >
          Confirm & Upload
        </Button>,
      ]}
      styles={{
        header: { marginBottom: 4 },
        body: { padding: showEditor ? 0 : 24, paddingTop: showEditor ? 0 : 8 },
      }}
    >
      {showEditor && imageSrc ? (
        <ImageEditor
          imageSrc={imageSrc}
          onSave={handleEditorSave}
          onCancel={() => setShowEditor(false)}
        />
      ) : (
        <div className={styles.container}>
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*"
            onChange={(e) => handleFileChange(e, "File selected successfully")}
          />

          <div style={{ marginBottom: 16, textAlign: "center" }}>
            <Space>
              <Text strong>Specimen photo:</Text>
              <Select
                style={{ width: 300 }}
                placeholder="Select a specimen (Relation)"
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
                forceScreenshotSourceSize
                videoConstraints={DEFAULT_VIDEO_CONSTRAINTS}
                className={styles.webcam}
              />
            )}
          </div>

          <Divider plain>
            <Text type="secondary">
              {imageSrc
                ? "Review the image and selected specimen before uploading"
                : "Position the specimen clearly"}
            </Text>
          </Divider>
        </div>
      )}
    </Modal>
  );
};

export default GrossImageCaptureModal;

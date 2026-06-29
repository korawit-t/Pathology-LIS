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
  Space,
  Typography,
  Row,
  Col,
  Input,
  Select,
  App,
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
import { ImageEditor } from "../../Gross/components/GrossImageCaptureModal/ImageEditor";
import NongyneCaseImageService, { NongyneCaseImage } from "../../../services/nongyneCaseImageService";
import styles from "../../Pathologist/SurgicalDiagnosisReportForm/components/MicroscopicImageCaptureModal.module.css";

const { Text } = Typography;

interface NongyneCytologyImageCaptureModalProps {
  open: boolean;
  caseId: number;
  onClose: () => void;
  onSuccess: () => void;
  editingImage?: NongyneCaseImage | null;
  nextOrder?: number;
}

const VIDEO_CONSTRAINTS = {
  width: 1920,
  height: 1080,
  facingMode: "environment" as const,
};

const STAIN_OPTIONS = ["H&E", "PAP", "Giemsa", "MGG", "PAS", "Mucicarmine", "Other"];

const NongyneCytologyImageCaptureModal: FC<NongyneCytologyImageCaptureModalProps> = ({
  open,
  caseId,
  onClose,
  onSuccess,
  editingImage,
  nextOrder = 1,
}) => {
  const { message } = App.useApp();
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [description, setDescription] = useState("");
  const [stain, setStain] = useState("H&E");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (editingImage) {
      setImageSrc(null);
      setDescription(editingImage.description ?? "");
      setStain("H&E");
      setShowEditor(false);
    } else {
      setImageSrc(null);
      setDescription("");
      setStain("H&E");
      setShowEditor(false);
    }
  }, [editingImage, open]);

  const capture = useCallback(() => {
    const image = webcamRef.current?.getScreenshot();
    if (image) {
      setImageSrc(image);
      setShowEditor(true);
    }
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      message.error("File too large (max 10 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageSrc(reader.result as string);
      setShowEditor(true);
    };
    reader.readAsDataURL(file);
  };

  const handleEditorSave = (finalSrc: string) => {
    setImageSrc(finalSrc);
    setShowEditor(false);
  };

  const handleConfirm = async () => {
    if (editingImage) {
      try {
        setUploading(true);
        await NongyneCaseImageService.update(editingImage.id, { description });
        message.success("Image updated.");
        onSuccess();
        onClose();
      } catch {
        message.error("Update failed.");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!imageSrc) {
      message.error("Please capture or select an image first.");
      return;
    }

    try {
      setUploading(true);
      const blob = await (await fetch(imageSrc)).blob();
      if (blob.size > 10 * 1024 * 1024) {
        message.error(`File too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`);
        return;
      }
      const ts = new Date().toISOString().replace(/[-:T.]/g, "").slice(8, 14);
      const file = new File([blob], `nongyne_cyto_${ts}.jpg`, { type: "image/jpeg" });
      await NongyneCaseImageService.upload(caseId, file, description || undefined, nextOrder, true);
      message.success("Image uploaded.");
      onSuccess();
      onClose();
    } catch {
      message.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          {editingImage ? (
            <EditOutlined style={{ color: "#52c41a" }} />
          ) : (
            <CameraOutlined style={{ color: "#1890ff" }} />
          )}
          <Text strong>
            {editingImage ? "Edit Image Info" : "Cytology Image Capture"}
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
          Cancel
        </Button>,
        !editingImage && (
          <Button
            key="retake"
            danger
            icon={<RedoOutlined />}
            onClick={() => { setImageSrc(null); setShowEditor(false); }}
            disabled={!imageSrc}
          >
            Retake
          </Button>
        ),
        !editingImage && (
          <Button
            key="file"
            icon={<FileImageOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={!!imageSrc}
          >
            Select File
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
            Capture
          </Button>
        ),
        <Button
          key="confirm"
          type="primary"
          icon={<UploadOutlined />}
          loading={uploading}
          onClick={handleConfirm}
          disabled={!editingImage && !imageSrc}
          style={editingImage ? { background: "#52c41a", border: "none" } : {}}
        >
          {editingImage ? "Save Changes" : "Confirm & Upload"}
        </Button>,
      ]}
      styles={{ body: { padding: showEditor ? 0 : 24 } }}
    >
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
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Space direction="vertical" style={{ width: "100%" }} size={2}>
                  <Text strong>Stain Type:</Text>
                  <Select
                    style={{ width: "100%" }}
                    value={stain}
                    onChange={setStain}
                    options={STAIN_OPTIONS.map((s) => ({ value: s, label: s }))}
                  />
                </Space>
              </Col>
              <Col span={12}>
                <Space direction="vertical" style={{ width: "100%" }} size={2}>
                  <Text strong>Description:</Text>
                  <Input
                    placeholder="Caption shown in PDF..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    allowClear
                  />
                </Space>
              </Col>
            </Row>
          </div>

          <div className={styles.previewArea}>
            {imageSrc ? (
              <div className={styles.imageWrapper}>
                <img src={imageSrc} alt="Preview" className={styles.capturedImage} />
                <div className={styles.overlayText}>
                  {editingImage ? "Current Image" : "Preview Mode"}
                </div>
              </div>
            ) : editingImage ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 300,
                  color: "#8c8c8c",
                  fontSize: 14,
                }}
              >
                Image already uploaded — edit description above
              </div>
            ) : (
              <Webcam
                audio={false}
                ref={webcamRef}
                mirrored={false}
                screenshotFormat="image/jpeg"
                videoConstraints={VIDEO_CONSTRAINTS}
                className={styles.webcam}
              />
            )}

            <div className={styles.magnificationLabel}>
              <Text style={{ color: "#fff" }}>
                <BlockOutlined /> {stain}
              </Text>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default NongyneCytologyImageCaptureModal;

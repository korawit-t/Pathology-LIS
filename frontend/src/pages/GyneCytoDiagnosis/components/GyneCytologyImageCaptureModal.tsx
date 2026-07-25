import React, {
  useRef,
  useState,
  FC,
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
import { ImageEditor } from "../../../components/ImageEditor";
import GyneCaseImageService, { GyneCaseImage } from "../../../services/gyneCaseImageService";
import styles from "../../../styles/imageCaptureModal.module.css";
import { HqCaptureToggle } from "../../../components/HqCaptureToggle";
import { DEFAULT_VIDEO_CONSTRAINTS } from "../../../utils/imageCapture";
import { oversizeMessage } from "../../../utils/imageUpload";
import { MAX_IMAGE_UPLOAD_BYTES } from "../../../constants/upload.constants";
import { useImageCapture } from "../../../hooks/useImageCapture";

const { Text } = Typography;

interface GyneCytologyImageCaptureModalProps {
  open: boolean;
  caseId: number;
  onClose: () => void;
  onSuccess: () => void;
  editingImage?: GyneCaseImage | null;
  nextOrder?: number;
}

const STAIN_OPTIONS = ["PAP", "LBC", "H&E", "Giemsa", "MGG", "Other"];

const GyneCytologyImageCaptureModal: FC<GyneCytologyImageCaptureModalProps> = ({
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
  const [stain, setStain] = useState("PAP");
  const [uploading, setUploading] = useState(false);

  const onCaptured = (dataUrl: string) => {
    setImageSrc(dataUrl);
    setShowEditor(true);
  };
  const { hqMode, setHqMode, hqSupported, capturing, capture, handleFileChange } =
    useImageCapture(webcamRef, onCaptured);

  useEffect(() => {
    if (editingImage) {
      setImageSrc(null);
      setDescription(editingImage.description ?? "");
      setStain("PAP");
      setShowEditor(false);
    } else {
      setImageSrc(null);
      setDescription("");
      setStain("PAP");
      setShowEditor(false);
    }
  }, [editingImage, open]);

  const handleEditorSave = (finalSrc: string) => {
    setImageSrc(finalSrc);
    setShowEditor(false);
  };

  const handleConfirm = async () => {
    if (editingImage) {
      // metadata-only update
      try {
        setUploading(true);
        await GyneCaseImageService.update(editingImage.id, { description });
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
      if (blob.size > MAX_IMAGE_UPLOAD_BYTES) {
        message.error(oversizeMessage(blob.size));
        return;
      }
      const ts = new Date().toISOString().replace(/[-:T.]/g, "").slice(8, 14);
      const file = new File([blob], `gyne_cyto_${ts}.jpg`, { type: "image/jpeg" });
      await GyneCaseImageService.upload(caseId, file, description || undefined, nextOrder, true);
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
        <div>
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
          {!editingImage && (
            <HqCaptureToggle hqMode={hqMode} hqSupported={hqSupported} onChange={setHqMode} />
          )}
        </div>
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
            onClick={() => capture()}
            loading={capturing}
            disabled={!!imageSrc || capturing}
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
        onChange={(e) => handleFileChange(e)}
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
                videoConstraints={DEFAULT_VIDEO_CONSTRAINTS}
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

export default GyneCytologyImageCaptureModal;

import React, { useRef, useState, useEffect, FC } from "react";
import {
  Modal,
  Button,
  App,
  Space,
  Typography,
  Divider,
  Select,
  Input,
  Row,
  Col,
} from "antd";
import {
  CameraOutlined,
  RedoOutlined,
  UploadOutlined,
  CloseOutlined,
  FileImageOutlined,
  EditOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";
import { ImageEditor } from "../../../../components/ImageEditor";
import styles from "./GrossImageCaptureModal.module.css";
import type { Specimen } from "../../../../components/SpecimenManagerSection/SpecimenManagerSection";
import type { GrossImage } from "../../../../types/image";
import GrossImageService from "../../../../services/grossImageService";
import { API_BASE_URL } from "../../../../services/httpClient";
import { HqCaptureToggle } from "../../../../components/HqCaptureToggle";
import { DEFAULT_VIDEO_CONSTRAINTS } from "../../../../utils/imageCapture";
import { useImageCapture } from "../../../../hooks/useImageCapture";
import { useImageEditSession } from "../../../../hooks/useImageEditSession";
import { getErrorDetail } from "../../../../utils/errorHandler";

const { Text } = Typography;

interface GrossImageCaptureModalProps {
  open: boolean;
  onClose: () => void;
  specimens: Specimen[];
  onCaptureAndUpload: (
    imageSrc: string,
    specimenId: number | null,
    description?: string,
  ) => void;
  /** When set, the modal edits an already-uploaded image instead of capturing. */
  editingImage?: GrossImage | null;
  onSuccess?: () => void;
}

const GrossImageCaptureModal: FC<GrossImageCaptureModalProps> = ({
  open,
  onClose,
  specimens,
  onCaptureAndUpload,
  editingImage,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<number | null>(
    null,
  );
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [showEditor, setShowEditor] = useState(false);

  const onCaptured = (dataUrl: string) => {
    setImageSrc(dataUrl);
    setShowEditor(true);
  };
  const { hqMode, setHqMode, hqSupported, capturing, capture, handleFileChange } =
    useImageCapture(webcamRef, onCaptured, open);

  // Re-editing an image that is already uploaded: pull its stored bytes back
  // through ImageEditor and PUT the result over the same row.
  const editSession = useImageEditSession({
    imageUrl: editingImage ? `${API_BASE_URL}${editingImage.image_url}` : undefined,
    onReplace: async (blob) => {
      if (!editingImage) return;
      await GrossImageService.replaceContent(editingImage.id, blob);
    },
    onReplaced: () => {
      onSuccess?.();
      onClose();
    },
  });

  useEffect(() => {
    setImageSrc(null);
    setShowEditor(false);
    setDescription(editingImage?.description ?? "");
    setSelectedSpecimenId(editingImage?.specimen_id ?? null);
  }, [editingImage, open]);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const retake = () => {
    setImageSrc(null);
    setShowEditor(false);
  };

  const handleUpload = async () => {
    if (editingImage) {
      try {
        setSaving(true);
        await GrossImageService.updateImage(editingImage.id, { description });
        message.success("Image updated");
        onSuccess?.();
        onClose();
      } catch (err) {
        message.error(getErrorDetail(err) ?? "Update failed");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!imageSrc) {
      message.error("Please capture an image before uploading");
      return;
    }
    onCaptureAndUpload(imageSrc, selectedSpecimenId, description || undefined);
    setImageSrc(null);
    setShowEditor(false);
    setSelectedSpecimenId(null);
    setDescription("");
    onClose();
  };

  const handleEditorSave = (finalImageSrc: string) => {
    setImageSrc(finalImageSrc);
    setShowEditor(false);
  };

  const inEditor = showEditor || editSession.editing;

  return (
    <Modal
      title={
        <div>
          <Space>
            {editingImage ? <EditOutlined /> : <CameraOutlined />}
            <span>{editingImage ? "Edit Gross Image" : "Gross Image Capture"}</span>
          </Space>
          {!editingImage && (
            <HqCaptureToggle hqMode={hqMode} hqSupported={hqSupported} onChange={setHqMode} />
          )}
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
        // The capture flow drops straight into the editor once; without this
        // there was no way back short of discarding the image and retaking.
        !editingImage && (
          <Button
            key="edit"
            icon={<EditOutlined />}
            onClick={() => setShowEditor(true)}
            disabled={!imageSrc}
          >
            Edit Image
          </Button>
        ),
        editingImage && (
          <Button
            key="edit-uploaded"
            icon={<EditOutlined />}
            onClick={editSession.startEditing}
            disabled={!editSession.canEdit || editSession.saving}
          >
            Edit Image
          </Button>
        ),
        !editingImage && (
          <Button
            key="retake"
            danger
            icon={<RedoOutlined />}
            onClick={retake}
            disabled={!imageSrc}
          >
            Retake
          </Button>
        ),
        !editingImage && (
          <Button
            key="browse"
            icon={<FileImageOutlined />}
            onClick={triggerFileInput}
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
            onClick={() => capture("Image captured successfully")}
            loading={capturing}
            disabled={!!imageSrc || capturing}
          >
            Capture
          </Button>
        ),
        <Button
          key="upload"
          type="primary"
          loading={saving}
          style={
            editingImage
              ? { backgroundColor: "#52c41a", borderColor: "#52c41a" }
              : {
                  backgroundColor:
                    !imageSrc || !selectedSpecimenId ? "#f5f5f5" : "#52c41a",
                  borderColor:
                    !imageSrc || !selectedSpecimenId ? "#d9d9d9" : "#52c41a",
                }
          }
          icon={<UploadOutlined />}
          onClick={handleUpload}
          // Require both an image and a selected specimen when uploading new
          disabled={editingImage ? false : !imageSrc || !selectedSpecimenId}
        >
          {editingImage ? "Save Changes" : "Confirm & Upload"}
        </Button>,
      ]}
      styles={{
        header: { marginBottom: 4 },
        body: { padding: inEditor ? 0 : 24, paddingTop: inEditor ? 0 : 8 },
      }}
    >
      {showEditor && imageSrc ? (
        <ImageEditor
          imageSrc={imageSrc}
          onSave={handleEditorSave}
          onCancel={() => setShowEditor(false)}
        />
      ) : editSession.editing && editSession.originalSrc ? (
        <ImageEditor
          imageSrc={editSession.originalSrc}
          onSave={editSession.saveEdited}
          onCancel={editSession.cancelEditing}
          saveLabel="Save Edited Image"
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

          <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>Specimen photo:</Text>
                <Select
                  style={{ width: "100%" }}
                  placeholder="Select a specimen (Relation)"
                  value={selectedSpecimenId}
                  onChange={(value) => setSelectedSpecimenId(value)}
                  disabled={!!editingImage}
                  allowClear
                >
                  {specimens.map((spec) => (
                    <Select.Option key={spec.id} value={spec.id}>
                      {spec.specimen_label}: {spec.specimen_name}
                    </Select.Option>
                  ))}
                </Select>
              </Space>
            </Col>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>Description:</Text>
                <Input
                  placeholder="Caption for this image..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  allowClear
                />
              </Space>
            </Col>
          </Row>

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
            ) : editingImage ? (
              <div className={styles.imageWrapper}>
                {editSession.originalSrc ? (
                  <img
                    src={editSession.originalSrc}
                    alt="Uploaded Gross"
                    className={styles.capturedImage}
                  />
                ) : (
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
                    Loading image…
                  </div>
                )}
                <div className={styles.overlayText}>Current Image</div>
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
              {editingImage
                ? "Edit the caption, or use Edit Image to crop, rotate or annotate"
                : imageSrc
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

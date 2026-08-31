import React, {
  useRef,
  useState,
  FC,
  useEffect,
} from "react";
import {
  Modal,
  Button,
  App,
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
import styles from "../../../../styles/imageCaptureModal.module.css";
import { MicroscopicImage } from "../../../../types/image";
import MicroscopicImageService from "../../../../services/microscopicImageService";
import { ImageEditor } from "../../../../components/ImageEditor";
import type { Specimen } from "../../../../components/SpecimenManagerSection/SpecimenManagerSection";
import { HqCaptureToggle } from "../../../../components/HqCaptureToggle";
import { DEFAULT_VIDEO_CONSTRAINTS } from "../../../../utils/imageCapture";
import { useImageCapture } from "../../../../hooks/useImageCapture";
import { useImageEditSession } from "../../../../hooks/useImageEditSession";

const { Text } = Typography;
const { TextArea } = Input;

interface MicroscopicImageCaptureModalProps {
  open: boolean;
  specimenId: number | null;
  onClose: () => void;
  onSuccess: () => void;
  specimens: Specimen[];
  onCaptureAndUpload: (
    imageSrc: string,
    specimenId: number,
    metadata: { magnification: string; stain: string; description: string }
  ) => void;
  editingImage?: MicroscopicImage | null;
}

const MicroscopicImageCaptureModal: FC<MicroscopicImageCaptureModalProps> = ({
  open,
  editingImage,
  specimenId,
  onClose,
  onSuccess,
  specimens,
  onCaptureAndUpload,
}) => {
  const { message } = App.useApp();
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<number | null>(
    null
  );
  const [magnification, setMagnification] = useState<string>("10x");
  const [stain, setStain] = useState<string>("H&E");
  const [description, setDescription] = useState<string>("");

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
    imageUrl: editingImage
      ? MicroscopicImageService.getSecureImageUrl(editingImage.image_url)
      : undefined,
    onReplace: async (blob) => {
      if (!editingImage) return;
      await MicroscopicImageService.replaceContent(editingImage.id, blob);
    },
    onReplaced: onSuccess,
  });

  const displaySrc = editingImage ? editSession.originalSrc : imageSrc;

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = () => {
    if (!selectedSpecimenId || (!editingImage && !imageSrc)) {
      message.error("Please select a specimen and capture an image before uploading");
      return;
    }
    onCaptureAndUpload(imageSrc ?? "", selectedSpecimenId, {
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

  useEffect(() => {
    if (editingImage) {
      setImageSrc(null);
      setSelectedSpecimenId(editingImage.specimen_id);
      setMagnification(editingImage.magnification || "10x");
      setStain(editingImage.stain || "H&E");
      setDescription(editingImage.description || "");
    } else {
      setImageSrc(null);
      setDescription("");
      setShowEditor(false);
    }
  }, [editingImage, open]);

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
              {editingImage
                ? "Edit Microscopic Image Info"
                : "Microscopic Image Capture"}
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

        // Retake/select-file/capture are hidden when editing — the file is already uploaded
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
            Retake
          </Button>
        ),
        !editingImage && (
          <Button
            key="select-file"
            icon={<FileImageOutlined />}
            onClick={triggerFileSelect}
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
          className={editingImage ? "" : styles.uploadBtn}
          style={
            editingImage
              ? { backgroundColor: "#52c41a", borderColor: "#52c41a" }
              : {}
          }
          icon={<UploadOutlined />}
          onClick={handleUpload}
          disabled={editingImage ? !selectedSpecimenId : !imageSrc || !selectedSpecimenId}
        >
          {editingImage ? "Save Changes" : "Confirm & Upload"}
        </Button>,
      ]}
      styles={{
        header: { marginBottom: 4 },
        body: {
          padding: showEditor || editSession.editing ? 0 : 24,
          paddingTop: showEditor || editSession.editing ? 0 : 8,
        },
      }}
    >
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={(e) => handleFileChange(e, "File loaded successfully")}
      />

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
        <div className={styles.metadataHeader}>
          <Row gutter={[16, 16]}>
            {" "}
            <Col span={9}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>Specimen Relation:</Text>
                <Select
                  style={{ width: "100%" }}
                  placeholder="Select specimen"
                  value={selectedSpecimenId}
                  onChange={setSelectedSpecimenId}
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

          <Row style={{ marginTop: 12 }}>
            <Col span={24}>
              <Space direction="vertical" style={{ width: "100%" }} size={2}>
                <Text strong>
                  <EditOutlined /> Description:
                </Text>
                <Input
                  placeholder="Enter pathology details for this image..."
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
              forceScreenshotSourceSize
              videoConstraints={DEFAULT_VIDEO_CONSTRAINTS}
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

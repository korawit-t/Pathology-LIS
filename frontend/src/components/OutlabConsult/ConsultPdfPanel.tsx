import React, { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Modal, Space, Spin, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { DeleteOutlined, ExclamationCircleOutlined, InboxOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import StyledCard from "../Layout/StyledCard";

const { Text } = Typography;

export interface ConsultPdfPanelProps {
  caseId: number;
  isOutLabConsult: boolean;
  consultPdfPath?: string | null;
  consultStatus?: string | null;
  onUpload: (caseId: number, file: File, receivedAt: string) => Promise<unknown>;
  onDelete: (caseId: number) => Promise<unknown>;
  onGetBlob: (caseId: number) => Promise<Blob>;
  onRefresh: () => void;
}

/**
 * Shared "out-lab subspecialty consult" PDF view/upload/delete panel — used
 * by Gyne and NonGyne diagnosis pages so both get the same consult_pdf_path
 * flow Surgical already has (ported from
 * SurgicalDiagnosisReportForm/index.tsx's inline popup, but as a page
 * section rather than a modal since it needs to sit inside two different
 * existing page layouts). Does not include a "Sign Off" button — each page
 * already has its own save/sign-off action, gated by getConsultLockState.
 */
const ConsultPdfPanel: React.FC<ConsultPdfPanelProps> = ({
  caseId,
  isOutLabConsult,
  consultPdfPath,
  consultStatus,
  onUpload,
  onDelete,
  onGetBlob,
  onRefresh,
}) => {
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [receivedAt, setReceivedAt] = useState<Dayjs>(dayjs());
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Optimistic local override: uploadConsultPdf's response doesn't echo back
  // the new consult_pdf_path, so the panel flips to preview mode immediately
  // on a successful upload rather than waiting for the parent to refetch and
  // re-pass an updated prop.
  const [justUploaded, setJustUploaded] = useState(false);

  const hasPdf = justUploaded || !!consultPdfPath;

  useEffect(() => {
    if (consultPdfPath) setJustUploaded(false);
  }, [consultPdfPath]);

  useEffect(() => {
    let activeUrl: string | null = null;
    if (hasPdf && caseId) {
      setPreviewLoading(true);
      onGetBlob(caseId)
        .then((blob) => {
          activeUrl = URL.createObjectURL(blob);
          setBlobUrl(activeUrl);
        })
        .catch(() => message.error("ไม่สามารถโหลด Consult PDF ได้"))
        .finally(() => setPreviewLoading(false));
    } else {
      setBlobUrl(null);
    }
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPdf, caseId]);

  if (!isOutLabConsult) return null;

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      await onUpload(caseId, uploadFile, receivedAt.toISOString());
      message.success("Consult PDF uploaded successfully");
      setUploadFile(null);
      setJustUploaded(true);
      onRefresh();
    } catch {
      message.error("Failed to upload Consult PDF");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "Delete Consult PDF",
      icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
      content: "Remove the uploaded consult PDF? You'll need to upload a new one.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        setDeleting(true);
        try {
          await onDelete(caseId);
          message.success("Consult PDF deleted");
          setJustUploaded(false);
          onRefresh();
        } catch {
          message.error("Failed to delete Consult PDF");
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  return (
    <StyledCard size="small" styles={{ body: { padding: "16px 20px" } }} style={{ borderRadius: 12 }}>
      <Space align="center" style={{ marginBottom: 12 }}>
        <InboxOutlined style={{ color: "#722ed1", fontSize: 16 }} />
        <Text strong style={{ color: "#722ed1" }}>
          Out-Lab Consult PDF
        </Text>
        {consultStatus && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            ({consultStatus})
          </Text>
        )}
      </Space>

      {!hasPdf ? (
        <>
          <Alert
            type="info"
            showIcon
            message="This case has been sent for external consultation. Please upload the consult report PDF once received."
            style={{ marginBottom: 16 }}
          />
          <div>
            <Text style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#8c8c8c" }}>
              Report Received Date / Time:
            </Text>
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YYYY HH:mm"
              value={receivedAt}
              onChange={(d) => d && setReceivedAt(d)}
              style={{ width: "100%", marginBottom: 12 }}
            />
          </div>
          <Upload.Dragger
            accept="application/pdf"
            maxCount={1}
            showUploadList={!!uploadFile}
            fileList={uploadFile ? [{ uid: "1", name: uploadFile.name, status: "done" } as UploadFile] : []}
            beforeUpload={(file) => {
              if (file.size > 10 * 1024 * 1024) {
                message.error("File must be under 10 MB");
                return Upload.LIST_IGNORE;
              }
              setUploadFile(file);
              return false;
            }}
            onRemove={() => setUploadFile(null)}
            style={{ borderColor: "#d3adf7", background: "#f9f0ff" }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: "#722ed1" }} />
            </p>
            <p className="ant-upload-text" style={{ color: "#722ed1" }}>
              Click or drag PDF to upload
            </p>
            <p className="ant-upload-hint" style={{ fontSize: 11 }}>
              Max 10 MB · PDF only
            </p>
          </Upload.Dragger>
          {uploadFile && (
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleUpload}
              loading={uploading}
              style={{ backgroundColor: "#722ed1", borderColor: "#722ed1", marginTop: 12 }}
              block
            >
              Upload Report PDF
            </Button>
          )}
        </>
      ) : (
        <>
          <Alert
            type="success"
            showIcon
            message="Consult report PDF received."
            description="Review it below before signing off this consult round."
            style={{ marginBottom: 12 }}
          />
          <div
            style={{
              height: 420,
              background: "#f5f5f5",
              borderRadius: 8,
              border: "1px solid #d9d9d9",
              overflow: "hidden",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {previewLoading ? (
              <Spin tip="Loading PDF...">
                <div style={{ width: "100%", height: 420 }} />
              </Spin>
            ) : blobUrl ? (
              <iframe
                src={`${blobUrl}#toolbar=1&navpanes=0`}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="Consult PDF Preview"
              />
            ) : (
              <Text type="secondary">Preview unavailable</Text>
            )}
          </div>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete} loading={deleting} block>
            Delete PDF
          </Button>
        </>
      )}
    </StyledCard>
  );
};

export default ConsultPdfPanel;

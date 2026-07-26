import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Modal,
  Space,
  Spin,
  Typography,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import SurgicalCaseService from "../../../../services/surgicalCaseService";
import { usePdfBlobUrl } from "../../../../hooks/usePdfBlobUrl";
import { usePdfPageSelector } from "../../../../components/PdfPageSelector/usePdfPageSelector";
import PdfPageThumbnailStrip from "../../../../components/PdfPageSelector/PdfPageThumbnailStrip";
import PdfPagePreviewPane from "../../../../components/PdfPageSelector/PdfPagePreviewPane";

interface ConsultPdfModalProps {
  open: boolean;
  onClose: () => void;
  caseId: string;
  consultPdfPath?: string;
  consultPdfApprovedAt?: string | null;
  consultPdfApproverName?: string | null;
  /** Disables Sign Off while the consult round isn't resolvable yet */
  isConsultFinalizeLocked: boolean;
  /** Reload the case after upload / approve / delete */
  onRefresh: () => void;
  /** Called after a successful approval, to continue into the finalize flow */
  onSignedOff: () => void;
}

const ConsultPdfModal: React.FC<ConsultPdfModalProps> = ({
  open,
  onClose,
  caseId,
  consultPdfPath,
  consultPdfApprovedAt,
  consultPdfApproverName,
  isConsultFinalizeLocked,
  onRefresh,
  onSignedOff,
}) => {
  const [sourcePdfFile, setSourcePdfFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const pdfPage = usePdfPageSelector(sourcePdfFile, setUploadFile);
  const showPagePicker = !!sourcePdfFile && !!pdfPage.pageCount && pdfPage.pageCount > 1;
  const [receivedAt, setReceivedAt] = useState<Dayjs>(dayjs());
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);

  // Load the consult PDF inline as soon as the popup opens in the
  // "already uploaded" state — no extra click needed to preview it.
  const fetchFn = useMemo(() => {
    if (!(open && consultPdfPath && caseId)) return null;
    return () => SurgicalCaseService.getConsultPdfBlob(Number(caseId));
  }, [open, consultPdfPath, caseId]);
  const onError = useCallback(() => message.error("Failed to load Consult PDF"), []);
  const { url: pdfBlobUrl, loading: previewLoading } = usePdfBlobUrl(fetchFn, { onError });

  const handleUpload = async () => {
    if (!uploadFile || !caseId) return;
    setUploading(true);
    try {
      await SurgicalCaseService.uploadConsultPdf(
        Number(caseId),
        uploadFile,
        receivedAt.toISOString(),
      );
      message.success("Consult PDF uploaded successfully");
      // Keep the popup open — it switches to Preview/Sign Off once
      // consultPdfPath comes back truthy from onRefresh().
      setSourcePdfFile(null);
      setUploadFile(null);
      onRefresh();
    } catch {
      message.error("Failed to upload Consult PDF");
    } finally {
      setUploading(false);
    }
  };

  const handleSignOff = async () => {
    if (!caseId) return;
    setApproving(true);
    try {
      await SurgicalCaseService.approveConsultPdf(Number(caseId));
      message.success("Consult PDF reviewed and approved");
      onRefresh();
    } catch {
      message.error("Failed to record consult approval");
      return;
    } finally {
      setApproving(false);
    }
    onClose();
    onSignedOff();
  };

  const handleDelete = () => {
    if (!caseId) return;
    Modal.confirm({
      title: "Delete Consult PDF",
      icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
      content: "Remove the uploaded consult PDF? You'll need to upload a new one before signing off.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        setDeleting(true);
        try {
          await SurgicalCaseService.deleteConsultPdf(Number(caseId));
          message.success("Consult PDF deleted");
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
    <Modal
      open={open}
      title={
        <Space>
          <InboxOutlined style={{ color: "#722ed1" }} />
          <Typography.Text strong style={{ fontSize: 15, color: "#722ed1" }}>
            Out-Lab Consult
          </Typography.Text>
        </Space>
      }
      onCancel={onClose}
      footer={null}
      width={consultPdfPath ? 720 : (showPagePicker ? 860 : 520)}
      maskClosable={false}
    >
      {!consultPdfPath ? (
        <>
          <Alert
            type="info"
            showIcon
            message="This case has been sent for external consultation. Please upload the consult report PDF."
            style={{ marginBottom: 16 }}
          />
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: showPagePicker ? "0 0 380px" : "1 1 auto", minWidth: 0 }}>
              <div>
                <Typography.Text style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#8c8c8c" }}>
                  Report Received Date / Time:
                </Typography.Text>
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
                beforeUpload={(file) => {
                  if (file.size > 10 * 1024 * 1024) {
                    message.error("File must be under 10 MB");
                    return Upload.LIST_IGNORE;
                  }
                  setSourcePdfFile(file);
                  return false;
                }}
                onRemove={() => { setSourcePdfFile(null); setUploadFile(null); }}
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
              {showPagePicker && pdfPage.pageCount && (
                <div style={{ marginTop: 12 }}>
                  <PdfPageThumbnailStrip
                    pageCount={pdfPage.pageCount}
                    selectedPages={pdfPage.selectedPages}
                    thumbnails={pdfPage.thumbnails}
                    loadingThumbnails={pdfPage.loadingThumbnails}
                    previewPageNo={pdfPage.previewPageNo}
                    onHoverPage={pdfPage.ensurePreview}
                    onTogglePage={pdfPage.togglePage}
                    onSelectAll={pdfPage.selectAll}
                    onClearAll={pdfPage.clearAll}
                    maxHeight={340}
                  />
                </div>
              )}
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
              <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", textAlign: "center", marginTop: 8 }}>
                A thumbnail of this PDF's first page and your sign-off will appear on the printed report's first page. The full consult PDF stays downloadable separately.
              </Typography.Text>
            </div>
            {showPagePicker && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <PdfPagePreviewPane
                  previewPageNo={pdfPage.previewPageNo}
                  previewSrc={pdfPage.previewSrc}
                  previewLoading={pdfPage.previewLoading}
                  minHeight={420}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <Alert
            type="success"
            showIcon
            message="Consult report PDF received."
            description="Review it below, then Sign Off to complete this consult round."
            style={{ marginBottom: 12 }}
          />
          {consultPdfApprovedAt && (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
              Approved by {consultPdfApproverName || "—"} on{" "}
              {dayjs(consultPdfApprovedAt).format("DD/MM/YYYY HH:mm")}
            </Typography.Text>
          )}
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
              <Spin tip="Loading PDF..." />
            ) : pdfBlobUrl ? (
              <iframe
                src={`${pdfBlobUrl}#toolbar=1&navpanes=0`}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="Consult PDF Preview"
              />
            ) : (
              <Typography.Text type="secondary">Preview unavailable</Typography.Text>
            )}
          </div>
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            <Button
              type="primary"
              onClick={handleSignOff}
              disabled={isConsultFinalizeLocked}
              loading={approving}
              style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
              block
            >
              Sign Off
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              loading={deleting}
              block
            >
              Delete PDF
            </Button>
          </Space>
        </>
      )}
    </Modal>
  );
};

export default ConsultPdfModal;

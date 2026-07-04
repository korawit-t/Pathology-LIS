import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Input,
  Tabs,
  Badge,
  Modal,
  Upload,
  message,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import {
  CloudUploadOutlined,
  ExperimentOutlined,
  FilePdfOutlined,
  InboxOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import PageContainer from "../../../components/Layout/PageContainer";
import ReportPreviewModal from "../../../components/ReportPreviewModal";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";
import dayjs from "dayjs";
import logger from "../../../utils/logger";

const { Text, Title } = Typography;
const { Dragger } = Upload;
const PAGE_SIZE = 15;

// ── Upload Modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  open: boolean;
  caseData: GyneCytologyCase | null;
  onClose: () => void;
  onSuccess: () => void;
}

const UploadResultModal: React.FC<UploadModalProps> = ({ open, caseData, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) setFile(null);
  }, [open]);

  const handleConfirm = async () => {
    if (!file || !caseData) return;
    setUploading(true);
    try {
      await GyneCytologyCaseService.uploadOutlabTestResult(caseData.id, file);
      message.success("อัปโหลดผลตรวจสำเร็จ");
      onSuccess();
      onClose();
    } catch (err) {
      logger.error("Upload outlab test result error", err);
      message.error("อัปโหลดล้มเหลว กรุณาลองใหม่");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <CloudUploadOutlined style={{ color: "#1677ff" }} />
          <span>Upload Result — {caseData?.accession_no}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      onOk={handleConfirm}
      okText="Confirm Upload"
      cancelText="Cancel"
      okButtonProps={{ disabled: !file, loading: uploading }}
      width={480}
    >
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary">
          Patient: <Text strong>{caseData?.patient?.name}</Text> | HN: <Text strong>{caseData?.hn}</Text>
        </Text>
      </div>
      <Dragger
        accept=".pdf"
        maxCount={1}
        showUploadList={!!file}
        beforeUpload={(f: UploadFile) => {
          setFile(f as unknown as File);
          return false;
        }}
        onRemove={() => setFile(null)}
        fileList={file ? [{ uid: "1", name: (file as File).name, status: "done" }] : []}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ color: "#1677ff", fontSize: 40 }} />
        </p>
        <p className="ant-upload-text">Click or drag PDF to upload</p>
        <p className="ant-upload-hint">Only PDF files accepted (max 20 MB)</p>
      </Dragger>
    </Modal>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const OutlabTestQueuePage: React.FC = () => {
  const [pendingCases, setPendingCases] = useState<GyneCytologyCase[]>([]);
  const [uploadedCases, setUploadedCases] = useState<GyneCytologyCase[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [uploadedTotal, setUploadedTotal] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingUploaded, setLoadingUploaded] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [uploadedPage, setUploadedPage] = useState(1);
  const [search, setSearch] = useState("");

  const [uploadModal, setUploadModal] = useState<{ open: boolean; case: GyneCytologyCase | null }>({ open: false, case: null });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | undefined>();
  const [viewLoadingId, setViewLoadingId] = useState<number | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

  const fetchPending = useCallback(async (p = 1, s = "") => {
    setLoadingPending(true);
    try {
      const res = await GyneCytologyCaseService.getAll({
        is_out_lab: true,
        has_out_lab_result: false,
        skip: (p - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: s || undefined,
      });
      setPendingCases(res.items);
      setPendingTotal(res.total);
      setPendingPage(p);
    } catch (err) { logger.error(err); }
    finally { setLoadingPending(false); }
  }, []);

  const fetchUploaded = useCallback(async (p = 1, s = "") => {
    setLoadingUploaded(true);
    try {
      const res = await GyneCytologyCaseService.getAll({
        is_out_lab: true,
        has_out_lab_result: true,
        skip: (p - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: s || undefined,
      });
      setUploadedCases(res.items);
      setUploadedTotal(res.total);
      setUploadedPage(p);
    } catch (err) { logger.error(err); }
    finally { setLoadingUploaded(false); }
  }, []);

  useEffect(() => { fetchPending(1, search); fetchUploaded(1, search); }, [fetchPending, fetchUploaded]);

  const refresh = () => { fetchPending(pendingPage, search); fetchUploaded(uploadedPage, search); };

  const handleViewPDF = async (c: GyneCytologyCase) => {
    setViewLoadingId(c.id);
    try {
      const blob = await GyneCytologyCaseService.downloadOutlabTestResult(c.id);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      setPdfUrl(url);
      setPreviewFilename(`${c.accession_no}_outlab_test.pdf`);
      setPreviewOpen(true);
    } catch (err) { logger.error(err); message.error("ไม่สามารถโหลด PDF ได้"); }
    finally { setViewLoadingId(null); }
  };

  const baseColumns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 140,
      render: (v: string) => <Text strong copyable>{v}</Text>,
    },
    {
      title: "Patient",
      key: "patient",
      render: (c: GyneCytologyCase) => (
        <div>
          <Text strong>
            {[c.patient?.title?.title, c.patient?.name, c.patient?.ln].filter(Boolean).join(" ") || "-"}
          </Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>HN: {c.hn}</Text></div>
        </div>
      ),
    },
    {
      title: "Specimen",
      dataIndex: "specimen_type",
      key: "specimen_type",
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "Registered",
      dataIndex: "registered_at",
      key: "registered_at",
      width: 120,
      render: (v: string) => dayjs(v).format("DD/MM/YYYY"),
    },
    {
      title: "Days",
      dataIndex: "registered_at",
      key: "days_elapsed",
      width: 80,
      align: "center" as const,
      render: (v: string) => {
        const days = dayjs().diff(dayjs(v), "day");
        const color = days >= 14 ? "red" : days >= 7 ? "orange" : "green";
        return <Tag color={color}>{days}d</Tag>;
      },
    },
  ];

  const pendingColumns = [
    ...baseColumns,
    {
      title: "Action",
      key: "action",
      width: 160,
      render: (c: GyneCytologyCase) => (
        <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setUploadModal({ open: true, case: c })}>
          Upload Result
        </Button>
      ),
    },
  ];

  const uploadedColumns = [
    ...baseColumns,
    {
      title: "Action",
      key: "action",
      width: 200,
      render: (c: GyneCytologyCase) => (
        <Space>
          <Button type="primary" ghost icon={<FilePdfOutlined />} loading={viewLoadingId === c.id} onClick={() => handleViewPDF(c)}>
            View PDF
          </Button>
          <Button icon={<CloudUploadOutlined />} size="small" onClick={() => setUploadModal({ open: true, case: c })}>
            Re-upload
          </Button>
        </Space>
      ),
    },
  ];

  const searchBar = (
    <Space style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
      <Button icon={<ReloadOutlined />} onClick={refresh}>Refresh</Button>
      <Input.Search
        placeholder="Search HN, Accession No., Name..."
        allowClear
        enterButton
        style={{ width: 300 }}
        onSearch={(v) => { setSearch(v); fetchPending(1, v); fetchUploaded(1, v); }}
      />
    </Space>
  );

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
          Outlab Test Queue
        </Title>
      }
    >
      {searchBar}
      <Tabs
        size="large"
        items={[
          {
            key: "pending",
            label: <span>Pending <Badge count={pendingTotal} style={{ marginLeft: 6 }} /></span>,
            children: (
              <Table
                dataSource={pendingCases}
                columns={pendingColumns}
                rowKey="id"
                loading={loadingPending}
                bordered
                size="middle"
                pagination={{
                  current: pendingPage,
                  pageSize: PAGE_SIZE,
                  total: pendingTotal,
                  showTotal: (t) => `Total ${t}`,
                  onChange: (p) => fetchPending(p, search),
                }}
              />
            ),
          },
          {
            key: "uploaded",
            label: <span>Uploaded <Badge count={uploadedTotal} color="green" style={{ marginLeft: 6 }} /></span>,
            children: (
              <Table
                dataSource={uploadedCases}
                columns={uploadedColumns}
                rowKey="id"
                loading={loadingUploaded}
                bordered
                size="middle"
                pagination={{
                  current: uploadedPage,
                  pageSize: PAGE_SIZE,
                  total: uploadedTotal,
                  showTotal: (t) => `Total ${t}`,
                  onChange: (p) => fetchUploaded(p, search),
                }}
              />
            ),
          },
        ]}
      />

      <UploadResultModal
        open={uploadModal.open}
        caseData={uploadModal.case}
        onClose={() => setUploadModal({ open: false, case: null })}
        onSuccess={refresh}
      />
      <ReportPreviewModal open={previewOpen} pdfUrl={pdfUrl} onCancel={() => setPreviewOpen(false)} filename={previewFilename} />
    </PageContainer>
  );
};

export default OutlabTestQueuePage;

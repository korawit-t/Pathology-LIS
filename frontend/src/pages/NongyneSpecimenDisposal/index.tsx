import React, { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { TablePaginationConfig } from "antd";
import {
  DeleteOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type {
  NongyneDisposalBucket,
  NongyneDisposalCandidate,
} from "../../types/nongyneSpecimenDisposal";
import PageContainer from "../../components/Layout/PageContainer";
import { formatPatientName } from "../../utils/patientName";
import logger from "../../utils/logger";
import CreateNongyneDisposalBatchModal from "./CreateNongyneDisposalBatchModal";
import NongyneDisposalBatchTab from "./NongyneDisposalBatchTab";

const { Title, Text } = Typography;
const { Search } = Input;
const PAGE_SIZE = 20;

const NongyneSpecimenDisposal: React.FC = () => {
  const [activeTab, setActiveTab] = useState("1");

  // ==== Tab 1: รอทำลาย ====
  const [bucket, setBucket] = useState<NongyneDisposalBucket>("due");
  const [candidates, setCandidates] = useState<NongyneDisposalCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  // เกณฑ์มาจาก backend ไม่ใช่ค่าที่หน้าจอเดาเอง — จะได้ตรงกับตัวที่ใช้บล็อกจริง
  const [retentionDays, setRetentionDays] = useState(30);

  // ==== Tab 2: ทำลายแล้ว ====
  const [disposed, setDisposed] = useState<NongyneDisposalCandidate[]>([]);
  const [disposedTotal, setDisposedTotal] = useState(0);
  const [disposedPage, setDisposedPage] = useState(1);
  const [disposedSearch, setDisposedSearch] = useState("");
  const [loadingDisposed, setLoadingDisposed] = useState(false);

  // ==== Tab 3: รอบการทำลาย ====
  const [openBatchCount, setOpenBatchCount] = useState(0);

  const fetchCandidates = useCallback(
    async (page: number, search: string, currentBucket: NongyneDisposalBucket) => {
      try {
        setLoadingCandidates(true);
        const data = await NongyneSpecimenDisposalService.getCandidates({
          bucket: currentBucket,
          skip: (page - 1) * PAGE_SIZE,
          limit: PAGE_SIZE,
          search: search || undefined,
        });
        setCandidates(data.items);
        setCandidateTotal(data.total);
        setRetentionDays(data.retention_days);
      } catch (error) {
        logger.error(error);
        message.error("ไม่สามารถโหลดรายการรอทำลายได้");
      } finally {
        setLoadingCandidates(false);
      }
    },
    []
  );

  const fetchDisposed = useCallback(async (page: number, search: string) => {
    try {
      setLoadingDisposed(true);
      const data = await NongyneSpecimenDisposalService.getDisposed({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      setDisposed(data.items);
      setDisposedTotal(data.total);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถโหลดรายการที่ทำลายแล้วได้");
    } finally {
      setLoadingDisposed(false);
    }
  }, []);

  const refreshOpenBatchCount = useCallback(async () => {
    try {
      setOpenBatchCount(await NongyneSpecimenDisposalService.getOpenCount());
    } catch (error) {
      logger.error(error);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "1") {
      fetchCandidates(candidatePage, candidateSearch, bucket);
    } else if (activeTab === "2") {
      fetchDisposed(disposedPage, disposedSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, candidatePage, disposedPage, bucket]);

  useEffect(() => {
    refreshOpenBatchCount();
  }, [refreshOpenBatchCount]);

  const handleBucketChange = (value: NongyneDisposalBucket) => {
    setBucket(value);
    setCandidatePage(1);
    // เลือกได้เฉพาะถัง "ครบกำหนด" — ทิ้ง selection เมื่อสลับถัง
    setSelectedRowKeys([]);
  };

  const handleBatchCreated = () => {
    setCreateBatchOpen(false);
    setSelectedRowKeys([]);
    fetchCandidates(candidatePage, candidateSearch, bucket);
    refreshOpenBatchCount();
  };

  // ใบถูกยืนยัน/ยกเลิก → ทั้งคิวรอทิ้งและรายการที่ทำลายแล้วเปลี่ยนไปพร้อมกัน
  const handleBatchChanged = () => {
    refreshOpenBatchCount();
    fetchCandidates(candidatePage, candidateSearch, bucket);
    fetchDisposed(disposedPage, disposedSearch);
  };

  const selectedCases = candidates.filter((c) => selectedRowKeys.includes(c.id));

  const patientColumn = {
    title: "ชื่อ-สกุลผู้ป่วย",
    key: "patient",
    render: (_: unknown, record: NongyneDisposalCandidate) => (
      <span>{formatPatientName(record.patient)}</span>
    ),
  };

  const candidateColumns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 150,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: "HN", dataIndex: "hn", key: "hn", width: 110 },
    patientColumn,
    {
      title: "ชนิดสิ่งส่งตรวจ",
      dataIndex: "specimen_type",
      key: "specimen_type",
      width: 130,
      render: (text: string) => <Tag color="blue">{text || "-"}</Tag>,
    },
    {
      title: "ตำแหน่งที่เก็บ",
      dataIndex: "collection_site",
      key: "collection_site",
      render: (text: string) => text || "-",
    },
    {
      title: "วันรายงานผล",
      dataIndex: "report_at",
      key: "report_at",
      width: 130,
      render: (date: string) => (date ? dayjs(date).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "ออกผลมาแล้ว",
      key: "days_since_report",
      width: 130,
      render: (_: unknown, record: NongyneDisposalCandidate) => {
        if (record.days_since_report == null) {
          return <Text type="secondary">-</Text>;
        }
        const due = record.days_since_report >= retentionDays;
        return (
          <Text type={due ? undefined : "warning"}>
            {record.days_since_report} วัน
          </Text>
        );
      },
    },
    {
      title: "สถานะ",
      key: "block_reason",
      width: 190,
      render: (_: unknown, record: NongyneDisposalCandidate) => {
        if (record.is_pending) {
          return (
            <Tooltip title={record.pending_reason || "Pending"}>
              <Tag color="warning">ค้าง Pending</Tag>
            </Tooltip>
          );
        }
        if (record.block_reason) {
          return (
            <Tooltip title={record.block_reason}>
              <Tag color="default">ยังทิ้งไม่ได้</Tag>
            </Tooltip>
          );
        }
        return <Tag color="success">ทิ้งได้</Tag>;
      },
    },
  ];

  const disposedColumns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 150,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: "HN", dataIndex: "hn", key: "hn", width: 110 },
    patientColumn,
    {
      title: "ชนิดสิ่งส่งตรวจ",
      dataIndex: "specimen_type",
      key: "specimen_type",
      width: 130,
      render: (text: string) => <Tag color="blue">{text || "-"}</Tag>,
    },
    {
      title: "วันรายงานผล",
      dataIndex: "report_at",
      key: "report_at",
      width: 130,
      render: (date: string) => (date ? dayjs(date).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "วันที่ทำลาย",
      dataIndex: "discard_at",
      key: "discard_at",
      width: 160,
      render: (date: string) =>
        date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "ผู้ทิ้ง",
      key: "specimen_disposer",
      render: (_: unknown, record: NongyneDisposalCandidate) => (
        <Text>{record.specimen_disposer?.full_name || "-"}</Text>
      ),
    },
  ];

  // ถังอื่นเป็นหน้าจอดูอย่างเดียว — เคสที่ยังไม่ครบกำหนดหรือค้าง pending
  // เลือกไปก็โดน backend ปฏิเสธอยู่ดี
  const rowSelection =
    bucket === "due"
      ? {
          selectedRowKeys,
          onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
        }
      : undefined;

  return (
    <PageContainer
      withCard
      cardProps={{ styles: { body: { padding: "8px 0 0 0" } } }}
      title={
        <Title level={3} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8, color: "#595959" }} />
          ทำลายสิ่งส่งตรวจ Non-Gyne Cytology
        </Title>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        tabBarStyle={{ padding: "0 24px", marginBottom: 0 }}
        tabBarExtraContent={
          activeTab === "1" ? (
            <Search
              placeholder="ค้นหา Accession No, HN, ชื่อผู้ป่วย"
              allowClear
              enterButton="ค้นหา"
              size="middle"
              onSearch={(value) => {
                setCandidateSearch(value);
                setCandidatePage(1);
                fetchCandidates(1, value, bucket);
              }}
              style={{ width: 380 }}
            />
          ) : activeTab === "2" ? (
            <Search
              placeholder="ค้นหา Accession No, HN, ชื่อผู้ป่วย"
              allowClear
              enterButton="ค้นหา"
              size="middle"
              onSearch={(value) => {
                setDisposedSearch(value);
                setDisposedPage(1);
                fetchDisposed(1, value);
              }}
              style={{ width: 380 }}
            />
          ) : undefined
        }
        items={[
          {
            key: "1",
            label: (
              <span>
                <DeleteOutlined style={{ marginRight: 6 }} />
                รอทำลาย
              </span>
            ),
            children: (
              <div style={{ padding: "16px 24px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 16,
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <Segmented
                    value={bucket}
                    onChange={(value) =>
                      handleBucketChange(value as NongyneDisposalBucket)
                    }
                    options={[
                      { label: `ครบกำหนด (≥ ${retentionDays} วัน)`, value: "due" },
                      { label: "ยังไม่ครบกำหนด", value: "not_due" },
                      { label: "ค้าง Pending", value: "blocked" },
                    ]}
                  />
                  <Space>
                    <Button
                      type="primary"
                      icon={<FileProtectOutlined />}
                      onClick={() => {
                        if (selectedRowKeys.length === 0) {
                          return message.warning("กรุณาเลือกอย่างน้อย 1 รายการ");
                        }
                        setCreateBatchOpen(true);
                      }}
                      disabled={bucket !== "due" || selectedRowKeys.length === 0}
                    >
                      สร้างใบตรวจสอบก่อนทำลาย ({selectedRowKeys.length})
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() =>
                        fetchCandidates(candidatePage, candidateSearch, bucket)
                      }
                      loading={loadingCandidates}
                    >
                      Refresh
                    </Button>
                  </Space>
                </div>
                {bucket !== "due" && (
                  <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                    รายการในมุมมองนี้ยังทิ้งไม่ได้ จึงเลือกไม่ได้ —
                    ดูเพื่อติดตามว่าเคสไหนใกล้ครบกำหนดหรือค้างอยู่
                  </Text>
                )}
                <Table
                  size="middle"
                  bordered
                  rowKey="id"
                  rowSelection={rowSelection}
                  columns={candidateColumns}
                  dataSource={candidates}
                  loading={loadingCandidates}
                  pagination={{
                    current: candidatePage,
                    pageSize: PAGE_SIZE,
                    total: candidateTotal,
                    showSizeChanger: false,
                  }}
                  onChange={(pagination: TablePaginationConfig) =>
                    setCandidatePage(pagination.current || 1)
                  }
                />
              </div>
            ),
          },
          {
            key: "2",
            label: (
              <span>
                <StopOutlined style={{ marginRight: 6 }} />
                ทำลายแล้ว
              </span>
            ),
            children: (
              <div style={{ padding: "16px 24px" }}>
                <div style={{ marginBottom: 16 }}>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => fetchDisposed(disposedPage, disposedSearch)}
                    loading={loadingDisposed}
                  >
                    Refresh
                  </Button>
                </div>
                <Table
                  size="middle"
                  bordered
                  rowKey="id"
                  columns={disposedColumns}
                  dataSource={disposed}
                  loading={loadingDisposed}
                  pagination={{
                    current: disposedPage,
                    pageSize: PAGE_SIZE,
                    total: disposedTotal,
                    showSizeChanger: false,
                  }}
                  onChange={(pagination: TablePaginationConfig) =>
                    setDisposedPage(pagination.current || 1)
                  }
                />
              </div>
            ),
          },
          {
            key: "3",
            label: (
              <span>
                <FileProtectOutlined style={{ marginRight: 6 }} />
                รอบการทำลาย
                <Badge
                  count={openBatchCount}
                  style={{ marginLeft: 8 }}
                  color="orange"
                />
              </span>
            ),
            children: <NongyneDisposalBatchTab onChanged={handleBatchChanged} />,
          },
        ]}
      />

      <CreateNongyneDisposalBatchModal
        open={createBatchOpen}
        cases={selectedCases}
        retentionDays={retentionDays}
        onCancel={() => setCreateBatchOpen(false)}
        onCreated={handleBatchCreated}
      />
    </PageContainer>
  );
};

export default NongyneSpecimenDisposal;

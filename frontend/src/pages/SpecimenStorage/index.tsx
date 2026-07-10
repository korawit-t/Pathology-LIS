import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Input,
  Space,
  Typography,
  message,
  Tabs,
  Tag,
  Tooltip,
  Modal,
} from "antd";
import type { TablePaginationConfig } from "antd";
import { CheckSquareOutlined, ReloadOutlined, DeleteOutlined, InboxOutlined, DatabaseOutlined, StopOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalCaseService from "../../services/surgicalCaseService";
import { SurgicalCase } from "../../types/surgical";
import PageContainer from "../../components/Layout/PageContainer";
import logger from "../../utils/logger";

const { Title, Text } = Typography;
const { Search } = Input;

const SpecimenStorage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("1");

  // ==== Tab 1: Unstored Cases ====
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [containerNumber, setContainerNumber] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // ==== Tab 2: Stored Cases ====
  const [storedCases, setStoredCases] = useState<SurgicalCase[]>([]);
  const [loadingStored, setLoadingStored] = useState(false);
  const [storedTotal, setStoredTotal] = useState(0);
  const [storedPage, setStoredPage] = useState(1);
  const [storedSearch, setStoredSearch] = useState("");
  const [storedSelectedRowKeys, setStoredSelectedRowKeys] = useState<React.Key[]>([]);
  const [isDisposing, setIsDisposing] = useState(false);

  // ==== Tab 3: Disposed Cases ====
  const [disposedCases, setDisposedCases] = useState<SurgicalCase[]>([]);
  const [loadingDisposed, setLoadingDisposed] = useState(false);
  const [disposedTotal, setDisposedTotal] = useState(0);
  const [disposedPage, setDisposedPage] = useState(1);
  const [disposedSearch, setDisposedSearch] = useState("");

  useEffect(() => {
    if (activeTab === "1") {
      fetchUnstoredCases();
    } else if (activeTab === "2") {
      fetchStoredCases(storedPage, storedSearch);
    } else {
      fetchDisposedCases(disposedPage, disposedSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, storedPage, disposedPage]);

  const fetchUnstoredCases = async () => {
    try {
      setLoading(true);
      const data = await SurgicalCaseService.getUnstoredCases();
      setCases(data);
      setSelectedRowKeys([]);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถโหลดข้อมูลที่ยังไม่ได้จัดเก็บได้");
    } finally {
      setLoading(false);
    }
  };

  const fetchStoredCases = async (page: number, search: string) => {
    try {
      setLoadingStored(true);
      const limit = 20;
      const skip = (page - 1) * limit;
      const data = await SurgicalCaseService.getStoredCases(skip, limit, search);
      setStoredCases(data.items);
      setStoredTotal(data.total);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถโหลดข้อมูลชิ้นเนื้อที่จัดเก็บแล้วได้");
    } finally {
      setLoadingStored(false);
    }
  };

  const fetchDisposedCases = async (page: number, search: string) => {
    try {
      setLoadingDisposed(true);
      const limit = 20;
      const skip = (page - 1) * limit;
      const data = await SurgicalCaseService.getDisposedCases(skip, limit, search);
      setDisposedCases(data.items);
      setDisposedTotal(data.total);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถโหลดข้อมูลชิ้นเนื้อที่ถูกทำลายได้");
    } finally {
      setLoadingDisposed(false);
    }
  };

  const handleBulkUpdate = () => {
    if (selectedRowKeys.length === 0) {
      return message.warning("Please select at least 1 case.");
    }
    if (!containerNumber.trim()) {
      return message.warning("Please enter a Container / Box No.");
    }

    const selectedCases = cases.filter((c) => selectedRowKeys.includes(c.id));

    Modal.confirm({
      title: "Confirm Storage",
      width: 600,
      content: (
        <div>
          <p>
            You are about to store <b>{selectedCases.length}</b> case(s) into container{" "}
            <Tag color="blue">{containerNumber}</Tag>
          </p>
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={selectedCases}
            style={{ marginTop: 12 }}
            columns={[
              { title: "Accession No.", dataIndex: "accession_no", width: 140 },
              { title: "HN", dataIndex: "hn", width: 100 },
              {
                title: "Patient Name",
                render: (_: unknown, r: SurgicalCase) =>
                  r.patient ? `${r.patient.name} ${r.patient.ln ?? ""}`.trim() : "-",
              },
            ]}
          />
        </div>
      ),
      okText: "Confirm Storage",
      cancelText: "Cancel",
      okButtonProps: { type: "primary" },
      onOk: async () => {
        try {
          setIsUpdating(true);
          await SurgicalCaseService.bulkUpdateStorageStatus(
            selectedRowKeys as number[],
            containerNumber
          );
          message.success(`Stored ${selectedRowKeys.length} case(s) successfully.`);
          setContainerNumber("");
          fetchUnstoredCases();
        } catch {
          message.error("Failed to update storage status.");
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const onSearchStored = (value: string) => {
    setStoredSearch(value);
    setStoredPage(1);
    fetchStoredCases(1, value);
  };

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setStoredPage(pagination.current);
  };

  const onSearchDisposed = (value: string) => {
    setDisposedSearch(value);
    setDisposedPage(1);
    fetchDisposedCases(1, value);
  };

  const handleDisposedTableChange = (pagination: TablePaginationConfig) => {
    setDisposedPage(pagination.current);
  };

  const handleDisposeItems = () => {
    if (storedSelectedRowKeys.length === 0) {
      return message.warning("กรุณาเลือกอย่างน้อย 1 รายการเพื่อทิ้ง");
    }

    Modal.confirm({
      title: "Confirm Disposal",
      content: `You are about to dispose ${storedSelectedRowKeys.length} specimen(s). This action cannot be undone.`,
      okText: "Confirm Dispose",
      cancelText: "Cancel",
      okType: "danger",
      onOk: async () => {
        try {
          setIsDisposing(true);
          await SurgicalCaseService.bulkDisposeSpecimens(
            storedSelectedRowKeys as number[]
          );
          message.success(`Disposed ${storedSelectedRowKeys.length} specimen(s) successfully.`);
          setStoredSelectedRowKeys([]);
          fetchStoredCases(storedPage, storedSearch);
        } catch (error) {
          message.error("Failed to dispose specimens.");
        } finally {
          setIsDisposing(false);
        }
      },
    });
  };

  // ==== Columns ====
  const unstoredColumns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 150,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 120,
    },
    {
      title: "Patient Name",
      key: "patient",
      render: (_: unknown, record: SurgicalCase) => (
        <span>{record.patient ? `${record.patient.name} ${record.patient.ln ?? ""}`.trim() : "-"}</span>
      ),
    },
    {
      title: "Registered Date",
      dataIndex: "registered_at",
      key: "registered_at",
      render: (date: string) =>
        date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (text: string) => (
        <Text type="secondary" style={{ textTransform: "capitalize" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "Pending",
      key: "is_pending",
      width: 110,
      render: (_: unknown, record: SurgicalCase) => {
        if (record.is_pending) {
          return (
            <Tooltip title={record.pending_reason || "Pending"}>
              <Tag color="warning">Pending</Tag>
            </Tooltip>
          );
        }
        return <Tag color="success">Clear</Tag>;
      },
    },
    {
      title: "Report Date",
      key: "report_at",
      width: 150,
      render: (_: unknown, record: SurgicalCase) => {
        const reportDate = record.report_at || record.published_at;
        if (!reportDate) return <Text type="secondary">—</Text>;
        return (
          <Text>{dayjs(reportDate).format("DD/MM/YYYY HH:mm")}</Text>
        );
      },
    },
  ];

  const storedColumns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 150,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 120,
    },
    {
      title: "Patient Name",
      key: "patient",
      render: (_: unknown, record: SurgicalCase) => (
        <span>{record.patient ? `${record.patient.name} ${record.patient.ln ?? ""}`.trim() : "-"}</span>
      ),
    },
    {
      title: "Case Status",
      dataIndex: "status",
      key: "status",
      render: (text: string) => (
        <Text type="secondary" style={{ textTransform: "capitalize" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "Pending",
      key: "is_pending",
      render: (_: unknown, record: SurgicalCase) => {
        if (!record.is_pending) return <Text type="secondary">-</Text>;
        return (
          <Tooltip title={record.pending_reason || "ระบุ Pending"}>
            <Tag color="warning">Pending</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Days since reported",
      key: "days_reported",
      render: (_: unknown, record: SurgicalCase) => {
        // ใช้ report_at หรือ published_at (ถ้ามี)
        const publishedDate = record.report_at || record.published_at;
        if (!publishedDate) return <Text type="secondary">-</Text>;
        const days = dayjs().startOf("day").diff(dayjs(publishedDate).startOf("day"), "day");
        return <Text>{days} days</Text>;
      },
    },
    {
      title: "Storage Date",
      dataIndex: "specimen_storage_at",
      key: "specimen_storage_at",
      render: (date: string) =>
        date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Stored By",
      key: "specimen_storer",
      render: (_: unknown, record: SurgicalCase) => {
        return <Text>{record.specimen_storer?.full_name || "-"}</Text>;
      },
    },
    {
      title: "Container / Box No.",
      dataIndex: "specimen_storage_container",
      key: "specimen_storage_container",
      render: (text: string) => <Tag color="blue">{text || "-"}</Tag>,
    },
    {
      title: "Storage Status",
      dataIndex: "specimen_storage_status",
      key: "specimen_storage_status",
      render: (text: string) => (
        <Tag color="green">{text || "-"}</Tag>
      ),
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
    {
      title: "HN",
      dataIndex: "hn",
      key: "hn",
      width: 120,
    },
    {
      title: "Patient Name",
      key: "patient",
      render: (_: unknown, record: SurgicalCase) => (
        <span>{record.patient ? `${record.patient.name} ${record.patient.ln ?? ""}`.trim() : "-"}</span>
      ),
    },
    {
      title: "Storage Date",
      dataIndex: "specimen_storage_at",
      key: "specimen_storage_at",
      render: (date: string) =>
        date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Container / Box No.",
      dataIndex: "specimen_storage_container",
      key: "specimen_storage_container",
      render: (text: string) => <Tag color="blue">{text || "-"}</Tag>,
    },
    {
      title: "Disposed Date",
      dataIndex: "discard_at",
      key: "discard_at",
      render: (date: string) =>
        date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Stored By",
      key: "specimen_storer",
      render: (_: unknown, record: SurgicalCase) => {
        return <Text>{record.specimen_storer?.full_name || "-"}</Text>;
      },
    },
    {
      title: "Disposed By",
      key: "specimen_disposer",
      render: (_: unknown, record: SurgicalCase) => {
        return <Text>{record.specimen_disposer?.full_name || "-"}</Text>;
      },
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  return (
    <PageContainer
      withCard
      cardProps={{ styles: { body: { padding: "8px 0 0 0" } } }}
      title={
        <Title level={3} style={{ margin: 0 }}>
          <InboxOutlined style={{ marginRight: 8, color: "#595959" }} />
          Specimen Storage Management
        </Title>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        tabBarStyle={{ padding: "0 24px", marginBottom: 0 }}
        tabBarExtraContent={
          activeTab === "2" ? (
            <Search
              placeholder="Search Accession No, HN, Name, Container No."
              allowClear
              enterButton="Search"
              size="middle"
              onSearch={onSearchStored}
              style={{ width: 400 }}
            />
          ) : activeTab === "3" ? (
            <Search
              placeholder="Search Accession No, HN, Name, Container No."
              allowClear
              enterButton="Search"
              size="middle"
              onSearch={onSearchDisposed}
              style={{ width: 400 }}
            />
          ) : undefined
        }
        items={[
          {
            key: "1",
            label: <span><InboxOutlined style={{ marginRight: 6 }} />To be Stored</span>,
            children: (
              <div style={{ padding: "16px 24px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <Space size="large">
                      <Text strong>Selected: {selectedRowKeys.length} items</Text>
                      <Space>
                        <Text>Container / Box No:</Text>
                        <Input
                          placeholder="Ex. B-12"
                          value={containerNumber}
                          onChange={(e) => setContainerNumber(e.target.value)}
                          style={{ width: 150 }}
                        />
                      </Space>
                      <Button
                        type="primary"
                        icon={<CheckSquareOutlined />}
                        onClick={handleBulkUpdate}
                        loading={isUpdating}
                        disabled={selectedRowKeys.length === 0}
                      >
                        Update to Stored
                      </Button>
                    </Space>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={fetchUnstoredCases}
                      loading={loading}
                    >
                      Refresh
                    </Button>
                  </div>
                  <Table
                    size="middle"
                    bordered
                    rowKey="id"
                    rowSelection={rowSelection}
                    columns={unstoredColumns}
                    dataSource={cases}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                  />
                </div>
              ),
            },
            {
              key: "2",
              label: <span><DatabaseOutlined style={{ marginRight: 6 }} />Stored Specimens</span>,
              children: (
                <div style={{ padding: "16px 24px" }}>
                  <div style={{ marginBottom: 16 }}>
                    <Space>
                      <Button
                        type="primary"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleDisposeItems}
                        loading={isDisposing}
                        disabled={storedSelectedRowKeys.length === 0}
                      >
                        Dispose ({storedSelectedRowKeys.length})
                      </Button>
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => fetchStoredCases(storedPage, storedSearch)}
                        loading={loadingStored}
                      >
                        Refresh
                      </Button>
                    </Space>
                  </div>
                  <Table
                    size="middle"
                    rowKey="id"
                    rowSelection={{
                      selectedRowKeys: storedSelectedRowKeys,
                      onChange: (keys) => setStoredSelectedRowKeys(keys),
                    }}
                    columns={storedColumns}
                    dataSource={storedCases}
                    loading={loadingStored}
                    pagination={{
                      current: storedPage,
                      pageSize: 20,
                      total: storedTotal,
                      showSizeChanger: false,
                    }}
                    onChange={handleTableChange}
                    bordered
                  />
                </div>
              ),
            },
            {
              key: "3",
              label: <span><StopOutlined style={{ marginRight: 6 }} />Disposed Specimens</span>,
              children: (
                <div style={{ padding: "16px 24px" }}>
                  <div style={{ marginBottom: 16 }}>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => fetchDisposedCases(disposedPage, disposedSearch)}
                      loading={loadingDisposed}
                    >
                      Refresh
                    </Button>
                  </div>
                  <Table
                    size="middle"
                    rowKey="id"
                    columns={disposedColumns}
                    dataSource={disposedCases}
                    loading={loadingDisposed}
                    pagination={{
                      current: disposedPage,
                      pageSize: 20,
                      total: disposedTotal,
                      showSizeChanger: false,
                    }}
                    onChange={handleDisposedTableChange}
                    bordered
                  />
                </div>
              ),
            },
          ]}
        />
    </PageContainer>
  );
};

export default SpecimenStorage;

import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Button,
  Tabs,
  Typography,
  Tag,
  Modal,
  message,
  Space,
  Input,
} from "antd";
import { DeleteOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { TablePaginationConfig } from "antd";
import dayjs from "dayjs";
import BlockStorageService from "../../../../services/blockStorageService";
import { BlockStorageDetailResponse } from "../../../../types/blockStorage";

const { Text } = Typography;
const PAGE_SIZE = 20;

const BlockDisposalTab: React.FC = () => {
  const [activeTab, setActiveTab] = useState("stored");

  // Stored blocks
  const [storedBlocks, setStoredBlocks] = useState<BlockStorageDetailResponse[]>([]);
  const [storedTotal, setStoredTotal] = useState(0);
  const [storedPage, setStoredPage] = useState(1);
  const [storedSearch, setStoredSearch] = useState("");
  const [loadingStored, setLoadingStored] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isDisposing, setIsDisposing] = useState(false);

  // Disposed blocks
  const [disposedBlocks, setDisposedBlocks] = useState<BlockStorageDetailResponse[]>([]);
  const [disposedTotal, setDisposedTotal] = useState(0);
  const [disposedPage, setDisposedPage] = useState(1);
  const [disposedSearch, setDisposedSearch] = useState("");
  const [loadingDisposed, setLoadingDisposed] = useState(false);

  const fetchStored = useCallback(async (page: number, search: string) => {
    try {
      setLoadingStored(true);
      const skip = (page - 1) * PAGE_SIZE;
      const data = await BlockStorageService.getStoredBlocks(skip, PAGE_SIZE, search);
      setStoredBlocks(data.items);
      setStoredTotal(data.total);
    } catch {
      message.error("Failed to load stored blocks");
    } finally {
      setLoadingStored(false);
    }
  }, []);

  const fetchDisposed = useCallback(async (page: number, search: string) => {
    try {
      setLoadingDisposed(true);
      const skip = (page - 1) * PAGE_SIZE;
      const data = await BlockStorageService.getDisposedBlocks(skip, PAGE_SIZE, search);
      setDisposedBlocks(data.items);
      setDisposedTotal(data.total);
    } catch {
      message.error("Failed to load disposal history");
    } finally {
      setLoadingDisposed(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "stored") fetchStored(storedPage, storedSearch);
    else fetchDisposed(disposedPage, disposedSearch);
  }, [activeTab, storedPage, disposedPage, fetchStored, fetchDisposed]);

  const handleDispose = () => {
    if (selectedRowKeys.length === 0) {
      return message.warning("Please select at least 1 block");
    }
    const selected = storedBlocks.filter((b) => selectedRowKeys.includes(b.id));
    Modal.confirm({
      title: "Confirm Block Disposal",
      width: 600,
      content: (
        <div>
          <p>
            You are about to dispose of <b>{selected.length}</b> block(s)
            <br />
            <Text type="danger">This action cannot be undone</Text>
          </p>
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={selected}
            columns={[
              { title: "Accession No.", render: (_, r) => r.block?.accession_no ?? "-", width: 140 },
              { title: "Block", render: (_, r) => r.block?.block_code ?? "-", width: 80 },
              { title: "Storage Location", dataIndex: "storage_location", render: (v: string) => v || "-" },
            ]}
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      okText: "Confirm Disposal",
      cancelText: "Cancel",
      okType: "danger",
      onOk: async () => {
        try {
          setIsDisposing(true);
          await BlockStorageService.disposeBlocks(selectedRowKeys as number[]);
          message.success(`${selected.length} block(s) disposed successfully`);
          setSelectedRowKeys([]);
          fetchStored(storedPage, storedSearch);
        } catch {
          message.error("Failed to dispose blocks");
        } finally {
          setIsDisposing(false);
        }
      },
    });
  };

  const storedColumns = [
    {
      title: "Accession No.",
      key: "accession",
      width: 150,
      render: (_: unknown, r: BlockStorageDetailResponse) => (
        <Text strong>{r.block?.accession_no ?? "-"}</Text>
      ),
    },
    {
      title: "Block",
      key: "block_code",
      width: 80,
      render: (_: unknown, r: BlockStorageDetailResponse) => r.block?.block_code ?? "-",
    },
    {
      title: "Storage Location",
      dataIndex: "storage_location",
      key: "storage_location",
      render: (v: string) => v || "-",
    },
    {
      title: "Stored At",
      dataIndex: "stored_at",
      key: "stored_at",
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "-"),
    },
    {
      title: "Batch No.",
      key: "run_no",
      render: (_: unknown, r: BlockStorageDetailResponse) =>
        r.run?.run_no ? <Tag>{r.run.run_no}</Tag> : "-",
    },
  ];

  const disposedColumns = [
    {
      title: "Accession No.",
      key: "accession",
      width: 150,
      render: (_: unknown, r: BlockStorageDetailResponse) => (
        <Text strong>{r.block?.accession_no ?? "-"}</Text>
      ),
    },
    {
      title: "Block",
      key: "block_code",
      width: 80,
      render: (_: unknown, r: BlockStorageDetailResponse) => r.block?.block_code ?? "-",
    },
    {
      title: "Storage Location",
      dataIndex: "storage_location",
      key: "storage_location",
      render: (v: string) => v || "-",
    },
    {
      title: "Batch No.",
      key: "run_no",
      render: (_: unknown, r: BlockStorageDetailResponse) =>
        r.run?.run_no ? <Tag>{r.run.run_no}</Tag> : "-",
    },
    {
      title: "Disposed At",
      dataIndex: "discard_at",
      key: "discard_at",
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "-"),
    },
    {
      title: "Disposed By",
      key: "discard_by",
      render: (_: unknown, r: BlockStorageDetailResponse) => r.discard_by?.full_name ?? "-",
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(k) => {
        setActiveTab(k);
        setSelectedRowKeys([]);
      }}
      tabBarStyle={{ marginBottom: 16 }}
      items={[
        {
          key: "stored",
          label: "Pending Disposal",
          children: (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Space>
                  <Input.Search
                    placeholder="Search Accession No."
                    prefix={<SearchOutlined />}
                    allowClear
                    style={{ width: 280 }}
                    onSearch={(v) => {
                      setStoredSearch(v);
                      setStoredPage(1);
                      fetchStored(1, v);
                    }}
                  />
                  <Text type="secondary">Selected: {selectedRowKeys.length} block(s)</Text>
                </Space>
                <Space>
                  <Button
                    type="primary"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDispose}
                    loading={isDisposing}
                    disabled={selectedRowKeys.length === 0}
                  >
                    Dispose ({selectedRowKeys.length})
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => fetchStored(storedPage, storedSearch)}
                    loading={loadingStored}
                  >
                    Refresh
                  </Button>
                </Space>
              </div>
              <Table
                size="middle"
                bordered
                rowKey="id"
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                columns={storedColumns}
                dataSource={storedBlocks}
                loading={loadingStored}
                pagination={{
                  current: storedPage,
                  pageSize: PAGE_SIZE,
                  total: storedTotal,
                  showSizeChanger: false,
                  showTotal: (t) => `Total ${t} block(s)`,
                }}
                onChange={(p: TablePaginationConfig) => setStoredPage(p.current ?? 1)}
              />
            </div>
          ),
        },
        {
          key: "disposed",
          label: "Disposal History",
          children: (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Input.Search
                  placeholder="Search Accession No."
                  prefix={<SearchOutlined />}
                  allowClear
                  style={{ width: 280 }}
                  onSearch={(v) => {
                    setDisposedSearch(v);
                    setDisposedPage(1);
                    fetchDisposed(1, v);
                  }}
                />
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
                dataSource={disposedBlocks}
                loading={loadingDisposed}
                pagination={{
                  current: disposedPage,
                  pageSize: PAGE_SIZE,
                  total: disposedTotal,
                  showSizeChanger: false,
                  showTotal: (t) => `Total ${t} block(s)`,
                }}
                onChange={(p: TablePaginationConfig) => setDisposedPage(p.current ?? 1)}
              />
            </div>
          ),
        },
      ]}
    />
  );
};

export default BlockDisposalTab;

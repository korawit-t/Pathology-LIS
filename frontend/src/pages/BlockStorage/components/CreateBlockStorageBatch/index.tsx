import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Button,
  Input,
  Table,
  Space,
  Row,
  Col,
  message,
  Modal,
  Tag,
  Typography,
  Skeleton,
  Tooltip,
} from "antd";
import type { InputRef } from "antd";
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
  InboxOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import BlockStorageService from "../../../../services/blockStorageService";
import {
  PendingStorageBlockNode,
  ScannedStorageBlock,
  BlockStorageRunResponse,
} from "../../../../types/blockStorage";

const { Text, Title } = Typography;

interface CreateBlockStorageBatchProps {
  onBack: () => void;
  onSuccess: (run: BlockStorageRunResponse) => void;
}

const CreateBlockStorageBatch: React.FC<CreateBlockStorageBatchProps> = ({
  onBack,
  onSuccess,
}) => {
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  const [loading, setLoading] = useState<boolean>(true);
  const [scannedBlocks, setScannedBlocks] = useState<ScannedStorageBlock[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [batchLocation, setBatchLocation] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [pendingData, setPendingData] = useState<PendingStorageBlockNode[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    const loadPending = async () => {
      try {
        setLoading(true);
        const res = await BlockStorageService.getPendingBlocksTree();
        setPendingData(Array.isArray(res) ? res : []);
      } catch (err) {
        message.error("Failed to load pending block queue");
        setPendingData([]);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 500);
      }
    };
    loadPending();
  }, []);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;

    let foundNode: PendingStorageBlockNode | null = null;
    let parentAcc = "";

    pendingData.forEach((specimen) => {
      const block = specimen.children?.find((b) =>
        b.code.includes(barcodeInput),
      );
      if (block) {
        foundNode = block;
        parentAcc = specimen.code;
      }
    });

    if (!foundNode) {
      message.error("Block not found in pending storage queue");
      setBarcodeInput("");
      return;
    }

    const isExist = scannedBlocks.find((b) => b.id === foundNode!.id);
    if (isExist) {
      message.warning("This block is already in the scan list");
      setBarcodeInput("");
      return;
    }

    const newEntry: ScannedStorageBlock = {
      id: foundNode.id,
      code: foundNode.code,
      accession_no: parentAcc,
      scannedAt: dayjs().format("HH:mm:ss"),
      storage_location: batchLocation || undefined,
    };

    setScannedBlocks((prev) => [newEntry, ...prev]);
    setBarcodeInput("");
  };

  const handleModalOk = () => {
    const newlySelected: ScannedStorageBlock[] = [];

    pendingData.forEach((specimen) => {
      specimen.children?.forEach((block) => {
        if (selectedRowKeys.includes(block.key)) {
          newlySelected.push({
            id: block.id,
            code: block.code,
            accession_no: specimen.code,
            scannedAt: dayjs().format("HH:mm:ss"),
          });
        }
      });
    });

    setScannedBlocks((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const filteredNew = newlySelected
        .filter((item) => !existingIds.has(item.id))
        .map((item) => ({ ...item, storage_location: batchLocation || undefined }));

      if (filteredNew.length < newlySelected.length) {
        message.info("Some items were skipped as they are already in the list");
      }

      return [...filteredNew, ...prev];
    });

    setIsModalOpen(false);
    setSelectedRowKeys([]);
  };

  const handleFinish = async () => {
    if (scannedBlocks.length === 0) {
      return message.warning("Please scan or select blocks to store");
    }

    try {
      const payload = {
        user_id: user?.id ?? 1,
        items: scannedBlocks.map((s) => ({
          block_id: s.id,
          storage_location: s.storage_location || "",
        })),
      };

      const run = await BlockStorageService.createStorageBatch(payload);

      message.success("Storage batch saved successfully");
      onSuccess(run);
    } catch (err: any) {
      message.error(
        "Save failed: " + (err.response?.data?.detail || err.message),
      );
    }
  };

  const handleApplyLocationToAll = () => {
    if (!batchLocation) return message.warning("Please enter a location first");
    setScannedBlocks((prev) =>
      prev.map((item) => ({ ...item, storage_location: batchLocation })),
    );
    message.success(`Location "${batchLocation}" applied to ${scannedBlocks.length} blocks`);
  };

  const handleCancelRun = () => {
    if (scannedBlocks.length > 0) {
      Modal.confirm({
        title: "Confirm Cancel?",
        content: `${scannedBlocks.length} selected item(s) will not be saved`,
        okText: "Confirm Cancel",
        okType: "danger",
        onOk: () => onBack(),
      });
    } else {
      onBack();
    }
  };

  if (loading) {
    return (
      <Card bordered={false}>
        <Skeleton active avatar paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  return (
    <div className="create-view">
      {/* Header: Back + Title + Save button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Title level={3} style={{ margin: 0 }}>
            <InboxOutlined style={{ color: "#faad14", marginRight: 8 }} />
            New Storage Batch
          </Title>
        </div>
        <Space size="middle">
          <Text type="secondary">Staff: {user?.full_name || "Staff"}</Text>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={handleFinish}
            disabled={scannedBlocks.length === 0}
          >
            Save & Finish ({scannedBlocks.length})
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  size="large"
                  placeholder="Scan block barcode..."
                  prefix={<BarcodeOutlined />}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onPressEnter={handleScan}
                  ref={inputRef}
                  allowClear
                />
                <Button
                  size="large"
                  icon={<UnorderedListOutlined />}
                  onClick={() => setIsModalOpen(true)}
                >
                  Manual Select
                </Button>
              </Space.Compact>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  size="large"
                  placeholder="Batch Location — applied to every block scanned"
                  prefix={<EnvironmentOutlined style={{ color: "#1677ff" }} />}
                  value={batchLocation}
                  onChange={(e) => setBatchLocation(e.target.value)}
                  allowClear
                />
                <Tooltip title="Apply this location to all blocks in the list">
                  <Button
                    size="large"
                    icon={<ThunderboltOutlined />}
                    onClick={handleApplyLocationToAll}
                    disabled={scannedBlocks.length === 0 || !batchLocation}
                  >
                    Apply to All
                  </Button>
                </Tooltip>
              </Space.Compact>
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={`Blocks (${scannedBlocks.length})`}>
            <Table
              dataSource={scannedBlocks}
              rowKey="id"
              size="small"
              columns={[
                { title: "Accession No.", dataIndex: "accession_no" },
                {
                  title: "Block Code",
                  dataIndex: "code",
                  render: (text: string) => <b>{text}</b>,
                },
                {
                  title: "Location",
                  dataIndex: "storage_location",
                  render: (val: string, record: ScannedStorageBlock) => (
                    <Input
                      placeholder="Location (optional)"
                      value={val}
                      onChange={(e) => {
                        const next = scannedBlocks.map((item) =>
                          item.id === record.id
                            ? { ...item, storage_location: e.target.value }
                            : item,
                        );
                        setScannedBlocks(next);
                      }}
                    />
                  ),
                },
                { title: "Time", dataIndex: "scannedAt" },
                {
                  title: "Remove",
                  render: (_: unknown, r: ScannedStorageBlock) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setScannedBlocks(
                          scannedBlocks.filter((b) => b.id !== r.id),
                        )
                      }
                    />
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="Select Blocks to Store"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={800}
        okText="Add Selected"
      >
        <Table<PendingStorageBlockNode>
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            checkStrictly: false,
          }}
          columns={[
            {
              title: "Code",
              dataIndex: "code",
              render: (text: string, record: PendingStorageBlockNode) => (
                <Space>
                  {record.isCase ? (
                    <Tag color="purple">Case</Tag>
                  ) : (
                    <Tag color="blue">Block</Tag>
                  )}
                  <span
                    style={{ fontWeight: record.isCase ? "bold" : "normal" }}
                  >
                    {text}
                  </span>
                </Space>
              ),
            },
          ]}
          dataSource={pendingData}
          rowKey="key"
          pagination={false}
          scroll={{ y: 400 }}
          expandable={{ defaultExpandAllRows: false }}
        />
      </Modal>
    </div>
  );
};

export default CreateBlockStorageBatch;

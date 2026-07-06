import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Button,
  Input,
  Table,
  Space,
  Divider,
  Statistic,
  Row,
  Col,
  message,
  Modal,
  Alert,
  Tag,
  Typography,
} from "antd";
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  UnorderedListOutlined,
  ExperimentOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import EmbeddingService from "../../../services/embeddingService";

const { Text } = Typography;

const CreateEmbeddingRun = ({ onBack }) => {
  const user = JSON.parse(localStorage.getItem("user"));
  const [activeRun, setActiveRun] = useState(null);
  const [scannedBlocks, setScannedBlocks] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState("");

  // States สำหรับ Modal และ Tree
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingData, setPendingData] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchPendingBlocks();
  }, []);

  const fetchPendingBlocks = async () => {
    try {
      const data = await EmbeddingService.getPendingBlocksTree();
      setPendingData(data);
    } catch (error) {
      console.error("Failed to fetch pending blocks:", error);
      message.error("Failed to load pending blocks");
    }
  };

  const handleScan = (e) => {
    e.preventDefault();
    if (!barcodeInput) return;

    let foundBlock = null;
    let parentAcc = "";
    pendingData.forEach((specimen) => {
      const block = specimen.children?.find((b) => b.code === barcodeInput);
      if (block) {
        foundBlock = block;
        parentAcc = specimen.code;
      }
    });

    if (!foundBlock) {
      message.error("Block not found in pending list or already embedded");
      setBarcodeInput("");
      return;
    }

    if (scannedBlocks.find((b) => b.id === foundBlock.id)) {
      message.warning("Block already in the list");
      setBarcodeInput("");
      return;
    }

    setScannedBlocks([
      {
        ...foundBlock,
        accession_no: parentAcc,
        scannedAt: dayjs().format("HH:mm:ss"),
      },
      ...scannedBlocks,
    ]);
    setBarcodeInput("");
  };

  const handleModalOk = () => {
    const newlySelected = [];
    pendingData.forEach((specimen) => {
      specimen.children?.forEach((block) => {
        if (selectedRowKeys.includes(block.key)) {
          newlySelected.push({
            ...block,
            accession_no: specimen.code,
            scannedAt: dayjs().format("HH:mm:ss"),
          });
        }
      });
    });

    setScannedBlocks((prev) => {
      const existingIds = new Set(prev.map((b) => b.id));
      const filtered = newlySelected.filter((nb) => !existingIds.has(nb.id));
      return [...filtered, ...prev];
    });

    setIsModalOpen(false);
    setSelectedRowKeys([]);
  };

  const handleFinish = async () => {
    if (scannedBlocks.length === 0)
      return message.warning("No blocks scanned yet");

    setLoading(true);
    try {
      const runRes = await EmbeddingService.createRun({
        user_id: user?.id || 1,
        station_id: "ST-01",
      });

      const newRunId = runRes.id;

      await EmbeddingService.batchAddBlocks({
        run_id: newRunId,
        block_ids: scannedBlocks.map((b) => b.id),
      });

      message.success(`Run ${runRes.run_no} saved successfully`);
      onBack();
    } catch (err) {
      message.error("Failed to save, please try again");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalInTree = pendingData.reduce(
    (acc, curr) => acc + (curr.children?.length || 0),
    0,
  );
  const selectedCountInModal = selectedRowKeys.filter(
    (key) => typeof key === "number" || !key.toString().startsWith("case-"),
  ).length;

  return (
    <div className="create-view">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card bordered={false} className="shadow-sm">
            <Row justify="space-between" align="middle">
              <Statistic
                value={activeRun?.run_no || "New Session"}
                prefix={
                  <Tag color={activeRun ? "blue" : "orange"}>
                    {activeRun ? "Active" : "Draft"}
                  </Tag>
                }
              />
              <Text type="secondary">
                Operator: {user?.full_name || "Staff"}
              </Text>
            </Row>

            <Divider />

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
                onClick={() => {
                  fetchPendingBlocks();
                  setIsModalOpen(true);
                }}
              >
                Manual Select
              </Button>
            </Space.Compact>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={`Scanned Blocks (${scannedBlocks.length})`}>
            <Table
              dataSource={scannedBlocks}
              rowKey="id"
              size="small"
              columns={[
                { title: "Accession No.", dataIndex: "accession_no" },
                {
                  title: "Block Code",
                  dataIndex: "code",
                  render: (text, r) => (
                    <Space>
                      {r.is_decal && (
                        <ExperimentOutlined style={{ color: "#fa541c" }} />
                      )}
                      <b>{text}</b>
                    </Space>
                  ),
                },
                { title: "Scanned Time", dataIndex: "scannedAt" },
                {
                  title: "Remove",
                  render: (_, r) => (
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
            />
          </Card>
        </Col>
      </Row>

      <Button
        type="primary"
        size="large"
        icon={<CheckCircleOutlined />}
        onClick={handleFinish}
        disabled={scannedBlocks.length === 0}
        block
        style={{ marginTop: 16 }}
      >
        Finish & Save ({scannedBlocks.length})
      </Button>

      {/* Manual Selection Modal */}
      <Modal
        title="Select Blocks for Embedding (Pending Blocks)"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={800}
        okText="Add Selected"
      >
        <Alert
          message={`Total pending blocks: ${totalInTree} | Selected: ${selectedCountInModal}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Table
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            checkStrictly: false,
          }}
          columns={[
            {
              title: "Accession / Block Code",
              dataIndex: "code",
              render: (text, record) => (
                <Space>
                  {record.isCase ? (
                    <Tag color="purple">Specimen</Tag>
                  ) : (
                    <Tag color="blue">Block</Tag>
                  )}
                  {record.is_decal && (
                    <ExperimentOutlined style={{ color: "#fa541c" }} />
                  )}
                  <span
                    style={{ fontWeight: record.isCase ? "bold" : "normal" }}
                  >
                    {text}
                  </span>
                  {record.patient_name && (
                    <Text type="secondary">- {record.patient_name}</Text>
                  )}
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

export default CreateEmbeddingRun;

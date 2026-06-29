import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Button,
  Input,
  Table,
  Space,
  Divider,
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
  DeleteOutlined,
  MedicineBoxOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { InputRef } from "antd";
import SurgicalBlockStainService from "../../../../services/surgicalBlockStainService";
import AnatomicalPathologyTestService from "../../../../services/anatomicalTestService";
import { HEStainItem, PendingStainNode } from "../../../../types/stains";
import { executePrint } from "../../PrintStickerHE/utils/generateHEStickers";

interface ScannedBlock {
  block_id: number;
  block_code?: string;
  title: string;
  accession_no: string;
  slide_count: number;
  scannedAt: string;
}

const { Text, Title } = Typography;

interface CreateStainingRunProps {
  onBack: () => void;
}

const CreateStainingRun: React.FC<CreateStainingRunProps> = ({ onBack }) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [scannedBlocks, setScannedBlocks] = useState<ScannedBlock[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingTree, setPendingTree] = useState<PendingStainNode[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    fetchPendingTree();
    setTimeout(() => inputRef.current?.focus(), 500);
  }, []);

  const fetchPendingTree = async () => {
    try {
      const response = await AnatomicalPathologyTestService.getAllTests();
      const tests = response.data;

      const heTest = tests.find((t) => t.system_code === "HE_ROUTINE");

      if (heTest) {
        const data = await SurgicalBlockStainService.getPendingHETree({
          test_id: heTest.id,
        });
        setPendingTree(data);
      }
    } catch (error) {
      message.error("Failed to load Master Data");
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;

    let foundBlock: PendingStainNode | null = null;
    let parentAcc = "";

    pendingTree.forEach((specimen) => {
      const block = specimen.children?.find(
        (b) => b.block_code === barcodeInput,
      );
      if (block) {
        foundBlock = block;
        parentAcc = specimen.title;
      }
    });

    if (!foundBlock) {
      message.error("Block not found in pending stain list or already stained");
      setBarcodeInput("");
      return;
    }

    if (scannedBlocks.find((b) => b.block_id === foundBlock.id)) {
      message.warning("Block already in the list");
      setBarcodeInput("");
      return;
    }

    const newItem = {
      block_id: foundBlock.id,
      block_code: foundBlock.block_code,
      title: foundBlock.title,
      accession_no: parentAcc,
      slide_count: 1,
      scannedAt: dayjs().format("HH:mm:ss"),
    };

    setScannedBlocks([newItem, ...scannedBlocks]);
    setBarcodeInput("");
  };

  const handleModalOk = () => {
    const newlySelected: ScannedBlock[] = [];

    pendingTree.forEach((specimen) => {
      specimen.children?.forEach((block) => {
        if (selectedRowKeys.includes(block.key)) {
          newlySelected.push({
            block_id: block.id,
            block_code: block.block_code,
            title: block.title,
            accession_no: specimen.title,
            slide_count: 1,
            scannedAt: dayjs().format("HH:mm:ss"),
          });
        }
      });
    });

    setScannedBlocks((prev) => {
      const existingIds = new Set(prev.map((b) => b.block_id));
      const uniqueNew = newlySelected.filter(
        (nb) => !existingIds.has(nb.block_id),
      );
      return [...uniqueNew, ...prev];
    });

    setIsModalOpen(false);
    setSelectedRowKeys([]);
  };

  const handleFinish = async () => {
    if (scannedBlocks.length === 0)
      return message.warning("No blocks scanned yet");

    setLoading(true);
    try {
      const payload = {
        user_id: user?.id || 1,
        stainer_id: "HE-STAINER-01",
        items: scannedBlocks.map((b) => ({
          block_id: b.block_id,
          slide_count: b.slide_count,
        })),
      };

      const newRun = await SurgicalBlockStainService.createHEBatchRun(payload);
      const newRunId = newRun.id;

      message.success(`Staining run saved: ${newRun.run_no}`);

      Modal.confirm({
        title: "Saved!",
        content: "Print slide stickers for this run now?",
        okText: "Print Now",
        cancelText: "Later",
        onOk: async () => {
          try {
            const hide = message.loading("Preparing print file...", 0);
            const printBlob =
              await SurgicalBlockStainService.printStickers(newRunId);
            hide();
            executePrint(printBlob);
            onBack();
          } catch (e) {
            message.error("Print failed");
            onBack();
          }
        },
        onCancel: () => onBack(),
      });
    } catch (err) {
      message.error("Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const totalInTree = pendingTree.reduce(
    (acc, curr) => acc + (curr.children?.length || 0),
    0,
  );

  return (
    <div className="create-view">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card bordered={false} className="shadow-sm">
            <Row justify="space-between" align="middle">
              <Space>
                <MedicineBoxOutlined
                  style={{ fontSize: 24, color: "#1890ff" }}
                />
                <Title level={4} style={{ margin: 0 }}>
                  New H&E Staining Run
                </Title>
              </Space>
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
                autoFocus
              />
              <Button
                size="large"
                icon={<UnorderedListOutlined />}
                onClick={() => {
                  fetchPendingTree();
                  setIsModalOpen(true);
                }}
              >
                Manual Select
              </Button>
            </Space.Compact>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={`Current Basket (${scannedBlocks.length} blocks)`}
          >
            <Table
              dataSource={scannedBlocks}
              rowKey="block_id"
              size="middle"
              pagination={false}
              columns={[
                {
                  title: "Accession No.",
                  dataIndex: "accession_no",
                  render: (text) => <Tag color="blue">{text}</Tag>,
                },
                {
                  title: "Block Code",
                  dataIndex: "title",
                  render: (text) => <b>{text}</b>,
                },
                {
                  title: "Slide Count",
                  dataIndex: "slide_count",
                  align: "center",
                  render: (count) => <Text strong>{count}</Text>,
                },
                { title: "Scan Time", dataIndex: "scannedAt" },
                {
                  title: "Remove",
                  align: "center",
                  render: (_, r) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setScannedBlocks(
                          scannedBlocks.filter(
                            (b) => b.block_id !== r.block_id,
                          ),
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
        loading={loading}
        disabled={scannedBlocks.length === 0}
        block
        style={{ marginTop: 16 }}
      >
        Save Run ({scannedBlocks.length})
      </Button>

      {/* Manual Selection Modal */}
      <Modal
        title="Select Blocks for H&E Staining"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={700}
        okText="Add Selected"
      >
        <Alert
          message={`Total pending blocks: ${totalInTree}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => {
              setSelectedRowKeys(keys);
            },
            checkStrictly: false,
          }}
          columns={[
            {
              title: "Accession / Block",
              dataIndex: "title",
              render: (text, record) => (
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
          dataSource={pendingTree}
          rowKey="key"
          pagination={false}
          scroll={{ y: 400 }}
          expandable={{ defaultExpandAllRows: false }}
        />
      </Modal>
    </div>
  );
};

export default CreateStainingRun;

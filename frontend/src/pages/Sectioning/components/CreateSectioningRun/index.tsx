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
  Tag,
  Typography,
  InputNumber,
  Skeleton,
} from "antd";
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import type { InputRef } from "antd";
import dayjs from "dayjs";
import SectioningService from "../../../../services/sectioningService";
import {
  PendingBlockNode,
  ScannedBlock,
  SectioningRunResponse,
} from "../../../../types/sectioning";
import logger from "../../../../utils/logger";

const { Text } = Typography;

interface CreateSectioningRunProps {
  onBack: () => void;
  onSuccess: (run: SectioningRunResponse) => void;
}

const CreateSectioningRun: React.FC<CreateSectioningRunProps> = ({
  onBack,
  onSuccess,
}) => {
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  const [loading, setLoading] = useState<boolean>(true);
  const [scannedSlides, setScannedSlides] = useState<ScannedBlock[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [pendingData, setPendingData] = useState<PendingBlockNode[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    const loadPending = async () => {
      try {
        setLoading(true);
        const res = await SectioningService.getPendingBlocksTree();
        setPendingData(Array.isArray(res) ? res : []);
      } catch (err) {
        logger.error("Load Error:", err);
        message.error("Failed to load work queue");
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

    let foundNode: PendingBlockNode | null = null;
    let parentAcc = "";

    pendingData.forEach((specimen) => {
      const block = specimen.children?.find((b) => b.code === barcodeInput);
      if (block) {
        foundNode = block;
        parentAcc = specimen.code;
      }
    });

    if (!foundNode) {
      message.error("Block not found in work queue");
      setBarcodeInput("");
      return;
    }

    const isExist = scannedSlides.find((b) => b.id === foundNode!.id);
    if (isExist) {
      message.warning("Block already scanned");
      setBarcodeInput("");
      return;
    }

    const newEntry: ScannedBlock = {
      id: foundNode.id,
      code: foundNode.code,
      accession_no: parentAcc,
      slide_count: 1,
      scannedAt: dayjs().format("HH:mm:ss"),
    };

    setScannedSlides((prev) => [newEntry, ...prev]);
    setBarcodeInput("");
  };

  const handleModalOk = () => {
    const newlySelected: ScannedBlock[] = [];

    pendingData.forEach((specimen) => {
      specimen.children?.forEach((block) => {
        if (selectedRowKeys.includes(block.key)) {
          newlySelected.push({
            id: block.id,
            code: block.code,
            accession_no: specimen.code,
            slide_count: 1,
            scannedAt: dayjs().format("HH:mm:ss"),
          });
        }
      });
    });

    setScannedSlides((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const filteredNew = newlySelected.filter(
        (item) => !existingIds.has(item.id),
      );

      if (filteredNew.length < newlySelected.length) {
        message.info("Some items skipped — already in the scan list");
      }

      return [...filteredNew, ...prev];
    });

    setIsModalOpen(false);
    setSelectedRowKeys([]);
  };

  const handleFinish = async () => {
    if (scannedSlides.length === 0) {
      return message.warning("Please scan at least one block");
    }

    try {
      const payload = {
        user_id: user?.id ?? 1,
        microtome_id: "MT-01",
        items: scannedSlides.map((s) => ({
          block_id: s.id,
          slide_count: s.slide_count,
          is_recut: false,
        })),
      };

      const run = await SectioningService.createRunBatch(payload);

      message.success("Sectioning run saved successfully");
      onSuccess(run);
    } catch (err: any) {
      message.error(
        "Failed to save: " + (err.response?.data?.detail || err.message),
      );
    }
  };

  const handleCancelRun = () => {
    if (scannedSlides.length > 0) {
      Modal.confirm({
        title: "Confirm Cancel?",
        content: `${scannedSlides.length} scanned item(s) will not be saved`,
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
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card bordered={false} className="shadow-sm">
            <Row justify="space-between" align="middle">
              <Statistic
                value="Auto Assigned"
                prefix={<ScissorOutlined style={{ color: "#faad14" }} />}
              />
              <Text type="secondary">
                Sectioner: {user?.full_name || "Staff"}
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
                onClick={() => setIsModalOpen(true)}
              >
                Manual Select
              </Button>
            </Space.Compact>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={`Scanned Slides (${scannedSlides.length})`}>
            <Table
              dataSource={scannedSlides}
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
                  title: "Slide Count",
                  dataIndex: "slide_count",
                  render: (val: number, record: ScannedBlock) => (
                    <InputNumber
                      min={1}
                      value={val}
                      onChange={(newVal) => {
                        const next = scannedSlides.map((item) =>
                          item.id === record.id
                            ? { ...item, slide_count: newVal || 1 }
                            : item,
                        );
                        setScannedSlides(next);
                      }}
                    />
                  ),
                },
                { title: "Time", dataIndex: "scannedAt" },
                {
                  title: "Remove",
                  render: (_: unknown, r: ScannedBlock) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setScannedSlides(
                          scannedSlides.filter((b) => b.id !== r.id),
                        )
                      }
                    />
                  ),
                },
              ]}
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>
      </Row>

      <Button
        type="primary"
        size="large"
        icon={<CheckCircleOutlined />}
        onClick={handleFinish}
        disabled={scannedSlides.length === 0}
        block
        style={{ marginTop: 16 }}
      >
        Save & Finish ({scannedSlides.length})
      </Button>

      <Modal
        title="Select Blocks for Sectioning"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={800}
        okText="Add Selected"
      >
        <Table<PendingBlockNode>
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            checkStrictly: false,
          }}
          columns={[
            {
              title: "Code",
              dataIndex: "code",
              render: (text: string, record: PendingBlockNode) => (
                <Space>
                  {record.isCase ? (
                    <Tag color="purple">Specimen</Tag>
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

export default CreateSectioningRun;

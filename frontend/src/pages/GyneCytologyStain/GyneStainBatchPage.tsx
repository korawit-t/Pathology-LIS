import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Card,
  Row,
  Col,
  Typography,
  Input,
  Space,
  message,
  Modal,
  Divider,
  Tag,
} from "antd";
import {
  ArrowRightOutlined,
  RocketOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PlusSquareOutlined,
  CheckCircleOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import GyneStainService from "../../services/gyneStainService";
import { executePrint } from "../Stain/PrintStickerHE/utils/generateHEStickers";
import { GyneCytologyStain } from "../../types/gyne-stain";
import PageContainer from "../../components/Layout/PageContainer";

const { Search } = Input;

// ✅ 1. เพิ่ม Interface เพื่อแก้ปัญหา ts(2322)
interface GyneStainBatchPageProps {
  onBack: () => void;
}

const GyneStainBatchPage: React.FC<GyneStainBatchPageProps> = ({ onBack }) => {
  const [queue, setQueue] = useState<GyneCytologyStain[]>([]);
  const [batchItems, setBatchItems] = useState<GyneCytologyStain[]>([]);
  const [stainerId, setStainerId] = useState("STAINER-01");
  const [loading, setLoading] = useState(false);

  const fetchNewRegisteredQueue = async () => {
    setLoading(true);
    try {
      const data = await GyneStainService.getRegisteredQueue();
      setQueue(data);
    } catch (err) {
      message.error("Failed to load registration queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewRegisteredQueue();
  }, []);

  const addToBatch = (record: GyneCytologyStain) => {
    setBatchItems([...batchItems, record]);
    setQueue(queue.filter((i) => i.id !== record.id));
  };

  const addAllToBatch = () => {
    setBatchItems([...batchItems, ...queue]);
    setQueue([]);
  };


  const handleStartStaining = async () => {
    if (batchItems.length === 0) return;
    setLoading(true);
    const snapItems = [...batchItems];
    try {
      const runName = `GYNE-${new Date().toISOString().slice(0, 10)}-${new Date().getHours()}${new Date().getMinutes()}`;
      const run = await GyneStainService.createStainRun(
        stainerId,
        snapItems.map((i) => i.id),
        runName,
      );
      message.success(`Staining batch created (${snapItems.length} item${snapItems.length !== 1 ? "s" : ""})`);
      setBatchItems([]);
      fetchNewRegisteredQueue();

      Modal.confirm({
        title: "Saved!",
        icon: <PrinterOutlined style={{ color: "#722ed1" }} />,
        content: `Print all ${snapItems.length} sticker${snapItems.length !== 1 ? "s" : ""} now?`,
        okText: "Print Now",
        cancelText: "Later",
        okButtonProps: { style: { backgroundColor: "#722ed1", borderColor: "#722ed1" } },
        onOk: async () => {
          const blob = await GyneStainService.printRunStickers(run.id);
          executePrint(blob);
        },
        onCancel: onBack,
        afterClose: () => {},
      });
    } catch (err) {
      message.error("Failed to start staining");
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    // ✅ 2. หุ้มด้วย PageContainer เพื่อความสวยงามและปุ่มย้อนกลับที่มุมซ้าย
    <PageContainer withCard title="Create Gyne Staining Batch" onBack={onBack}>
      <Row gutter={24}>
        {/* ฝั่งซ้าย: คิวรอส่งย้อม */}
        <Col span={11}>
          <Card
            title={
              <Space>
                <RocketOutlined style={{ color: "#1890ff" }} />
                <span>Slides Queued for Staining ({queue.length})</span>
              </Space>
            }
            extra={
              <Space>
                <Button
                  icon={<PlusSquareOutlined />}
                  onClick={addAllToBatch}
                  disabled={queue.length === 0}
                >
                  Move All
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchNewRegisteredQueue}
                />
              </Space>
            }
          >
            <Search
              placeholder="Scan Accession No. to add to batch"
              onSearch={(value) => {
                const item = queue.find((i) => i.accession_no === value);
                if (item) {
                  addToBatch(item);
                } else {
                  message.warning("Accession not found in queue");
                }
              }}
              style={{ marginBottom: 16 }}
              allowClear
            />
            <Table
              dataSource={queue}
              loading={loading}
              rowKey="id"
              size="small"
              columns={[
                {
                  title: "Accession",
                  dataIndex: "accession_no",
                  render: (val) => <b style={{ color: "#1890ff" }}>{val}</b>,
                },
                {
                  title: "Test",
                  render: (_, record) => (
                    <Tag color="cyan">{record.test?.name || "N/A"}</Tag>
                  ),
                },
                {
                  title: "",
                  align: "right",
                  render: (_, record) => (
                    <Button
                      type="link"
                      icon={<ArrowRightOutlined />}
                      onClick={() => addToBatch(record)}
                    />
                  ),
                },
              ]}
              pagination={{ pageSize: 8 }}
            />
          </Card>
        </Col>

        {/* ฝั่งขวา: รายการใน Batch ปัจจุบัน */}
        <Col span={13}>
          <Card
            title={
              <Space>
                <span>Current Batch (Rack)</span>
                <Tag color="purple">{batchItems.length} Slides</Tag>
              </Space>
            }
            style={{ borderColor: "#722ed1" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <Input
                addonBefore="Stainer ID"
                value={stainerId}
                onChange={(e) => setStainerId(e.target.value)}
              />
              <Table
                dataSource={batchItems}
                rowKey="id"
                pagination={false}
                scroll={{ y: 400 }}
                size="small"
                columns={[
                  {
                    title: "No.",
                    render: (_, __, index) => index + 1,
                    width: 50,
                  },
                  { title: "Accession", dataIndex: "accession_no" },
                  {
                    title: "Item",
                    render: (_, record) => (
                      <span>
                        {record.test?.name} (Slide {record.slide_no})
                      </span>
                    ),
                  },
                  {
                    title: "",
                    align: "right",
                    render: (_, record) => (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          setBatchItems(
                            batchItems.filter((i) => i.id !== record.id),
                          );
                          setQueue([record, ...queue]);
                        }}
                      />
                    ),
                  },
                ]}
              />
              <Divider style={{ margin: "12px 0" }} />
              <Button
                type="primary"
                size="large"
                block
                disabled={batchItems.length === 0}
                loading={loading}
                onClick={handleStartStaining}
                style={{
                  backgroundColor: "#722ed1",
                  borderColor: "#722ed1",
                  height: "50px",
                  fontSize: "16px",
                  fontWeight: "bold",
                }}
                icon={<CheckCircleOutlined />}
              >
                Confirm & Start Staining
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default GyneStainBatchPage;

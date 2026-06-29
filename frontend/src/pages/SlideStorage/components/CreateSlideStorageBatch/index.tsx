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
  Skeleton,
  Tooltip,
} from "antd";
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
  InboxOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { InputRef } from "antd";
import dayjs from "dayjs";
import SlideStorageService from "../../../../services/slideStorageService";
import {
  PendingStorageSlideNode,
  ScannedStorageSlide,
  StainCategory,
  SlideStorageRunResponse,
} from "../../../../types/slideStorage";

const { Text } = Typography;

const CATEGORY_LABEL: Record<StainCategory, string> = {
  HE: "H&E",
  Special: "Special Stain",
  IHC: "IHC",
  Gyne: "Gyne Cytology",
  NonGyne: "Non-Gyne Cytology",
};

interface CreateSlideStorageBatchProps {
  onBack: () => void;
  onSuccess: (run: SlideStorageRunResponse) => void;
  stainCategory: StainCategory;
}

const CreateSlideStorageBatch: React.FC<CreateSlideStorageBatchProps> = ({
  onBack,
  onSuccess,
  stainCategory,
}) => {
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  const [loading, setLoading] = useState<boolean>(true);
  const [scannedSlides, setScannedSlides] = useState<ScannedStorageSlide[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [batchLocation, setBatchLocation] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [pendingData, setPendingData] = useState<PendingStorageSlideNode[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    const loadPending = async () => {
      try {
        setLoading(true);
        const res =
          await SlideStorageService.getPendingSlidesTree(stainCategory);
        setPendingData(Array.isArray(res) ? res : []);
      } catch (err) {
        message.error("Failed to load pending slide queue");
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

    let foundNode: PendingStorageSlideNode | null = null;
    let parentAcc = "";

    pendingData.forEach((specimen) => {
      const slide = specimen.children?.find((s) =>
        s.code.includes(barcodeInput),
      );
      if (slide) {
        foundNode = slide;
        parentAcc = specimen.code;
      }
    });

    if (!foundNode) {
      message.error("Slide not found in pending storage queue");
      setBarcodeInput("");
      return;
    }

    const isExist = scannedSlides.find((s) => s.id === foundNode!.id);
    if (isExist) {
      message.warning("This slide is already in the scan list");
      setBarcodeInput("");
      return;
    }

    const newEntry: ScannedStorageSlide = {
      id: foundNode.id,
      code: foundNode.code,
      accession_no: parentAcc,
      scannedAt: dayjs().format("HH:mm:ss"),
      storage_location: batchLocation || undefined,
    };

    setScannedSlides((prev) => [newEntry, ...prev]);
    setBarcodeInput("");
  };

  const handleModalOk = () => {
    const newlySelected: ScannedStorageSlide[] = [];

    pendingData.forEach((specimen) => {
      specimen.children?.forEach((slide) => {
        if (selectedRowKeys.includes(slide.key)) {
          newlySelected.push({
            id: slide.id,
            code: slide.code,
            accession_no: specimen.code,
            scannedAt: dayjs().format("HH:mm:ss"),
          });
        }
      });
    });

    setScannedSlides((prev) => {
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
    if (scannedSlides.length === 0) {
      return message.warning("Please scan or select slides to store");
    }

    try {
      const payload = {
        user_id: user?.id ?? 1,
        stain_category: stainCategory,
        items: scannedSlides.map((s) => ({
          stain_id: s.id,
          storage_location: s.storage_location || "",
        })),
      };

      const run = await SlideStorageService.createStorageBatch(payload);

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
    setScannedSlides((prev) =>
      prev.map((item) => ({ ...item, storage_location: batchLocation })),
    );
    message.success(`Location "${batchLocation}" applied to ${scannedSlides.length} slides`);
  };

  const handleCancelRun = () => {
    if (scannedSlides.length > 0) {
      Modal.confirm({
        title: "Confirm Cancel?",
        content: `${scannedSlides.length} selected item(s) will not be saved`,
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
                title="New Slide Storage Batch"
                value={CATEGORY_LABEL[stainCategory]}
                prefix={<InboxOutlined style={{ color: "#faad14" }} />}
              />
              <Text type="secondary">
                Staff: {user?.full_name || "Staff"}
              </Text>
            </Row>

            <Divider />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  size="large"
                  placeholder="Scan slide barcode..."
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
                  placeholder="Batch Location — applied to every slide scanned"
                  prefix={<EnvironmentOutlined style={{ color: "#1677ff" }} />}
                  value={batchLocation}
                  onChange={(e) => setBatchLocation(e.target.value)}
                  allowClear
                />
                <Tooltip title="Apply this location to all slides in the list">
                  <Button
                    size="large"
                    icon={<ThunderboltOutlined />}
                    onClick={handleApplyLocationToAll}
                    disabled={scannedSlides.length === 0 || !batchLocation}
                  >
                    Apply to All
                  </Button>
                </Tooltip>
              </Space.Compact>
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={`Slides (${scannedSlides.length})`}>
            <Table
              dataSource={scannedSlides}
              rowKey="id"
              size="small"
              columns={[
                { title: "Accession No.", dataIndex: "accession_no" },
                {
                  title: "Slide / Test Code",
                  dataIndex: "code",
                  render: (text: string) => <b>{text}</b>,
                },
                {
                  title: "Location",
                  dataIndex: "storage_location",
                  render: (val: string, record: ScannedStorageSlide) => (
                    <Input
                      placeholder="Location (optional)"
                      value={val}
                      onChange={(e) => {
                        const next = scannedSlides.map((item) =>
                          item.id === record.id
                            ? { ...item, storage_location: e.target.value }
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
                  render: (_: unknown, r: ScannedStorageSlide) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setScannedSlides(
                          scannedSlides.filter((s) => s.id !== r.id),
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

        <Col span={24}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={handleFinish}
            disabled={scannedSlides.length === 0}
            block
          >
            Save & Finish ({scannedSlides.length})
          </Button>
        </Col>
      </Row>

      <Modal
        title="Select Slides to Store"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={800}
        okText="Add Selected"
      >
        {pendingData.length === 0 ? (
          <div
            style={{ textAlign: "center", padding: "32px 0", color: "#8c8c8c" }}
          >
            No pending slides in category: {CATEGORY_LABEL[stainCategory]}
          </div>
        ) : (
          <Table<PendingStorageSlideNode>
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              checkStrictly: false,
            }}
            columns={[
              {
                title: "Code",
                dataIndex: "code",
                render: (text: string, record: PendingStorageSlideNode) => (
                  <Space>
                    {record.isCase ? (
                      <Tag color="purple">Case</Tag>
                    ) : (
                      <Tag color="green">Slide</Tag>
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
            expandable={{ defaultExpandAllRows: true }}
          />
        )}
      </Modal>
    </div>
  );
};

export default CreateSlideStorageBatch;

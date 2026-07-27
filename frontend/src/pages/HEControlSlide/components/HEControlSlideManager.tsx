import React, { useState } from "react";
import {
  Card,
  Row,
  Col,
  Button,
  Table,
  Space,
  Typography,
  Modal,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  ExperimentOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import HEControlSlideService, {
  HEControlSlide,
} from "../../../services/heControlSlideService";
import { executePrint } from "../../Stain/PrintStickerHE/utils/generateHEStickers";

const { Text, Title } = Typography;

interface HEControlSlideManagerProps {
  slides: HEControlSlide[];
  loading: boolean;
  onRefresh: () => void;
}

const HEControlSlideManager: React.FC<HEControlSlideManagerProps> = ({
  slides,
  loading,
  onRefresh,
}) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [recording, setRecording] = useState(false);
  const [printingId, setPrintingId] = useState<number | null>(null);

  const handlePrint = async (slide: HEControlSlide) => {
    setPrintingId(slide.id);
    try {
      const blob = await HEControlSlideService.printSticker(slide.id);
      executePrint(blob);
    } catch {
      message.error("Failed to print sticker");
    } finally {
      setPrintingId(null);
    }
  };

  const handleRecord = async () => {
    setRecording(true);
    try {
      const newSlide = await HEControlSlideService.create();
      message.success(`Control slide ${newSlide.control_no} recorded`);
      onRefresh();

      Modal.confirm({
        title: "Saved!",
        content: `Control slide ${newSlide.control_no} recorded. Print sticker now?`,
        okText: "Print Now",
        cancelText: "Later",
        onOk: () => handlePrint(newSlide),
      });
    } catch {
      message.error("Failed to record control slide");
    } finally {
      setRecording(false);
    }
  };

  const columns = [
    {
      title: "Control No.",
      dataIndex: "control_no",
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: "Date",
      dataIndex: "control_date",
      render: (v: string) => dayjs(v).format("DD/MM/YYYY"),
    },
    {
      title: "Performed By",
      dataIndex: "performed_by",
      render: (v: HEControlSlide["performed_by"]) => v?.full_name || v?.username || "—",
    },
    {
      title: "Performed At",
      dataIndex: "performed_at",
      render: (v: string) => dayjs(v).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "",
      key: "actions",
      width: 100,
      align: "right" as const,
      render: (_: unknown, record: HEControlSlide) => (
        <Button
          size="small"
          icon={<PrinterOutlined />}
          loading={printingId === record.id}
          onClick={() => handlePrint(record)}
        >
          Print
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Space>
            <ExperimentOutlined style={{ fontSize: 24, color: "#1890ff" }} />
            <Title level={4} style={{ margin: 0 }}>
              Today's H&E Control Slide
            </Title>
          </Space>
          <Space size={16}>
            <Text type="secondary">Performed by: {user?.full_name || "Staff"}</Text>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={recording}
              onClick={handleRecord}
            >
              Record Now
            </Button>
          </Space>
        </Row>
      </Card>

      <Table
        dataSource={slides}
        columns={columns}
        rowKey="id"
        size="middle"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />
    </>
  );
};

export default HEControlSlideManager;

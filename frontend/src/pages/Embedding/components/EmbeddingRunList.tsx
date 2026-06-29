import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Space,
  Tag,
  Badge,
  Modal,
  message,
} from "antd";
import {
  EyeOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import EmbeddingService from "../../../services/embeddingService";
import {
  EmbeddingRunResponse,
  EmbeddingDetailResponse,
  EmbeddingRunListProps,
} from "../../../types/embedding";
import { ColumnsType } from "antd/es/table";
import logger from "../../../utils/logger";

// --- Component ---

const EmbeddingRunList: React.FC<EmbeddingRunListProps> = ({
  onSelectRun,
  refreshKey,
}) => {
  const [runs, setRuns] = useState<EmbeddingRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadHistory();
  }, [refreshKey]);

  const loadHistory = async (): Promise<void> => {
    setLoading(true);
    try {
      const runs = await EmbeddingService.getRuns();
      setRuns(runs);
    } catch (err) {
      logger.error(err);
      message.error("โหลดประวัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  const handleDeleteClick = (record: EmbeddingRunResponse): void => {
    Modal.confirm({
      title: "ยืนยันการลบรอบ?",
      content: `คุณต้องการลบรอบ ${record.run_no} ใช่หรือไม่?`,
      okText: "ลบ",
      okType: "danger",
      cancelText: "ยกเลิก",
      onOk: async () => {
        try {
          await EmbeddingService.deleteRun(record.id);
          message.success("ลบรอบสำเร็จ");
          loadHistory();
        } catch (err: any) {
          const errorMsg = err.response?.data?.detail || "ไม่สามารถลบได้";
          message.error(errorMsg);
        }
      },
    });
  };

  const columns: ColumnsType<EmbeddingRunResponse> = [
    {
      title: "Run Number",
      dataIndex: "run_no",
      key: "run_no",
      render: (t: string) => (
        <Tag color="blue" style={{ fontWeight: "bold" }}>
          {t}
        </Tag>
      ),
    },
    {
      title: "Staff",
      dataIndex: "user_full_name",
      key: "user_full_name",
      render: (name: string | null, record: EmbeddingRunResponse) => name || `ID: ${record.user_id}`,
    },
    {
      title: "เวลาที่เริ่ม",
      dataIndex: "started_at",
      key: "started_at",
      render: (d: string) => dayjs(d).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "จำนวนบล็อก",
      dataIndex: "details",
      key: "details",
      render: (details: EmbeddingDetailResponse[]) => (
        <Badge
          count={details?.length || 0}
          showZero
          color={details?.length > 0 ? "#52c41a" : "#d9d9d9"}
        />
      ),
    },
    {
      title: "Action",
      key: "action",
      render: (_, record: EmbeddingRunResponse) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onSelectRun(record.id)}
          >
            View
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteClick(record)}
            // อ้างอิงตาม Schema: ถ้า list details ไม่ว่าง (มี block ถูกสแกนแล้ว) จะลบไม่ได้
            disabled={record.details && record.details.length > 0}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table<EmbeddingRunResponse>
        dataSource={runs}
        columns={columns}
        rowKey="id"
        size="middle"
        bordered
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          className: "custom-pagination",
        }}
        tableLayout="fixed"
      />
    </>
  );
};

export default EmbeddingRunList;

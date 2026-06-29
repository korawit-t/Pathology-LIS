import React, { useEffect, useState } from "react";
import { Table, Button, message, Space } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import BlockStorageService from "../../services/blockStorageService";
import type { BlockStorageRunResponse } from "../../types/blockStorage";

interface BlockStorageListProps {
  onSelectRun: (run: BlockStorageRunResponse) => void;
}

const BlockStorageList: React.FC<BlockStorageListProps> = ({ onSelectRun }) => {
  const [runs, setRuns] = useState<BlockStorageRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await BlockStorageService.getAllRuns();
      setRuns(data);
    } catch (err) {
      message.error("โหลดประวัติการจัดเก็บไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "รหัสรัน",
      dataIndex: "run_no",
      key: "run_no",
    },
    {
      title: "วันที่จัดเก็บ",
      dataIndex: "started_at",
      key: "started_at",
      render: (val: string) => dayjs(val).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "หมายเหตุ",
      dataIndex: "remark",
      key: "remark",
    },
    {
      title: "รายละเอียด",
      key: "action",
      render: (_: unknown, record: BlockStorageRunResponse) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => onSelectRun(record)}
          >
            ดูรายละเอียด
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={runs}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{ pageSize: 10 }}
    />
  );
};

export default BlockStorageList;

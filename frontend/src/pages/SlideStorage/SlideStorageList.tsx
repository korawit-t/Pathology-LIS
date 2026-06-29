import React, { useEffect, useState } from "react";
import { Table, Button, message, Space } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import SlideStorageService from "../../services/slideStorageService";
import type { SlideStorageRunResponse } from "../../types/slideStorage";

import { StainCategory } from "../../types/slideStorage";

interface SlideStorageListProps {
  onSelectRun: (run: SlideStorageRunResponse) => void;
  stainCategory: StainCategory;
}

const SlideStorageList: React.FC<SlideStorageListProps> = ({
  onSelectRun,
  stainCategory,
}) => {
  const [runs, setRuns] = useState<SlideStorageRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadHistory();
  }, [stainCategory]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await SlideStorageService.getAllRuns({}, stainCategory);
      setRuns(data);
    } catch (err) {
      message.error("โหลดประวัติการจัดเก็บสไลด์ไม่สำเร็จ");
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
      title: "Remark",
      dataIndex: "remark",
      key: "remark",
    },
    {
      title: "รายละเอียด",
      key: "action",
      render: (_: unknown, record: SlideStorageRunResponse) => (
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

export default SlideStorageList;

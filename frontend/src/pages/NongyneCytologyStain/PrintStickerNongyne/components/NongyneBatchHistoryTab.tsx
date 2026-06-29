import React from "react";
import { Table, Button, Tag, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import type { TablePaginationConfig } from "antd/es/table";
import dayjs from "dayjs";
import { NongyneStainRun } from "../../../../types/nongyne-stain";

const { Text } = Typography;

interface Props {
  runs: NongyneStainRun[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  onPrint: (run: NongyneStainRun) => void;
  printingId: number | null;
}

const NongyneBatchHistoryTab: React.FC<Props> = ({
  runs, loading, total, page, pageSize, onPageChange, onPrint, printingId,
}) => {
  const columns = [
    {
      title: "Run No.",
      dataIndex: "run_no",
      render: (val: string) => <Text strong style={{ color: "#fa8c16" }}>{val}</Text>,
    },
    {
      title: "Date / Time",
      dataIndex: "created_at",
      render: (val: string) => dayjs(val).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Slides",
      render: (_: unknown, record: NongyneStainRun) => (
        <Tag color="orange">{record.details?.length || 0} Slides</Tag>
      ),
    },
    {
      title: "Print Status",
      render: (_: unknown, record: NongyneStainRun) => {
        const details = record.details || [];
        const tot = details.length;
        const printed = details.filter((d) => d.stain_order?.is_printed).length;
        if (tot === 0) return <Tag>No Data</Tag>;
        if (printed === tot) return <Tag color="green">Fully Printed ({printed}/{tot})</Tag>;
        if (printed > 0) return <Tag color="orange">Partial ({printed}/{tot})</Tag>;
        return <Tag color="default">Not Printed</Tag>;
      },
    },
    {
      title: "Actions",
      align: "center" as const,
      render: (_: unknown, record: NongyneStainRun) => (
        <Button
          type="primary"
          size="small"
          icon={<PrinterOutlined />}
          loading={printingId === record.id}
          onClick={() => onPrint(record)}
          style={{ backgroundColor: "#fa8c16", borderColor: "#fa8c16" }}
        >
          Print
        </Button>
      ),
    },
  ];

  const handleTableChange = (nav: TablePaginationConfig) => {
    onPageChange(nav.current || 1, nav.pageSize || pageSize);
  };

  return (
    <Table
      columns={columns}
      dataSource={runs}
      rowKey="id"
      loading={loading}
      size="middle"
      onChange={handleTableChange}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (t) => `ทั้งหมด ${t} รายการ`,
      }}
    />
  );
};

export default NongyneBatchHistoryTab;

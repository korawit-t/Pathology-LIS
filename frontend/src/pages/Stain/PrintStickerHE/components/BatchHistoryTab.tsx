import React from "react";
import { Table, Button, Tag, Space, Popconfirm, Typography } from "antd";
import { PrinterOutlined, DeleteOutlined } from "@ant-design/icons";
import { StainingRunResponse } from "../../../../types/stains";

const { Text } = Typography;

interface BatchHistoryTabProps {
  runs: StainingRunResponse[];
  loading: boolean;
  onRefresh: () => void;
  onPrint: (id: number) => void;
  onViewDetail: (run: StainingRunResponse) => void;
  onDelete: (id: number) => void;
}

const BatchHistoryTab: React.FC<BatchHistoryTabProps> = ({
  runs,
  loading,
  onRefresh,
  onPrint,
  onViewDetail,
  onDelete,
}) => {
  const columns = [
    {
      title: "Run No.",
      dataIndex: "run_no",
      key: "run_no",
      render: (text: string) => (
        <Text strong style={{ color: "#1890ff" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "Date/Time",
      dataIndex: "started_at",
      key: "started_at",
      render: (date: string) =>
        date ? new Date(date).toLocaleString("th-TH") : "-",
    },
    {
      title: "Slides",
      dataIndex: "details",
      key: "details",
      render: (details: StainingRunResponse["details"]) => (
        <Tag color="blue">{details?.length || 0} Slides</Tag>
      ),
    },
    {
      title: "Status",
      key: "print_status",
      render: (_: unknown, record: StainingRunResponse) => {
        const details = record.details || [];
        const total = details.length;
        // เช็คจำนวนที่พิมพ์แล้วจาก stain_order
        const printedCount = details.filter(
          (d) => d.stain_order?.is_printed,
        ).length;

        if (total === 0) return <Tag>No Data</Tag>;

        if (printedCount === total) {
          return (
            <Tag color="green">
              Fully Printed ({printedCount}/{total})
            </Tag>
          );
        } else if (printedCount > 0) {
          return (
            <Tag color="orange">
              Partial ({printedCount}/{total})
            </Tag>
          );
        } else {
          return <Tag color="default">Not Printed</Tag>;
        }
      },
    },
    {
      title: "Actions",
      key: "action",
      align: "center" as const,
      render: (_: unknown, record: StainingRunResponse) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => onPrint(record.id)}
          >
            Print
          </Button>
          <Button size="small" onClick={() => onViewDetail(record)}>
            Details
          </Button>
          <Popconfirm
            title="Are you sure to delete this run?"
            onConfirm={() => onDelete(record.id)}
            okText="Yes"
            cancelText="No"
            okButtonProps={{ danger: true }}
          >
            <Button danger type="text" size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        dataSource={runs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        size="middle"
        bordered
      />
    </>
  );
};

export default BatchHistoryTab;

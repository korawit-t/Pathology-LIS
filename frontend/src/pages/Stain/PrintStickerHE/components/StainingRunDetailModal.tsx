import React from "react";
import { Modal, Table, Tag, Button, Typography, Space } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { StainingRunResponse } from "../../../../types/stains";

const { Text } = Typography;

interface StainRunDetail {
  id: number;
  accession_no?: string;
  stain_order?: {
    block?: { accession_no?: string; block_code?: string };
    stain_type?: string;
    stain_name?: string;
    is_printed?: boolean;
  };
}

interface Props {
  visible: boolean;
  onCancel: () => void;
  run: StainingRunResponse | null;
  onPrint: (runId: number) => void;
}

const StainingRunDetailModal: React.FC<Props> = ({
  visible,
  onCancel,
  run,
  onPrint,
}) => {
  const columns = [
    {
      title: "Accession No.",
      key: "accession_no",
      render: (_: unknown, record: StainRunDetail) => (
        <Text strong>
          {record.accession_no ||
            record.stain_order?.block?.accession_no ||
            "N/A"}
        </Text>
      ),
    },
    {
      title: "Block",
      key: "block_code",
      render: (_: unknown, record: StainRunDetail) =>
        record.stain_order?.block?.block_code || "N/A",
    },
    {
      title: "Stain Type",
      key: "stain",
      render: (_: unknown, record: StainRunDetail) => (
        <Space>
          <Tag color="blue">{record.stain_order?.stain_type}</Tag>
          {record.stain_order?.stain_name && (
            <Text type="secondary">{record.stain_order.stain_name}</Text>
          )}
        </Space>
      ),
    },
    {
      title: "Print Status",
      key: "is_printed",
      render: (_: unknown, record: StainRunDetail) => (
        <Tag color={record.stain_order?.is_printed ? "green" : "default"}>
          {record.stain_order?.is_printed ? "Printed" : "Pending"}
        </Tag>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <PrinterOutlined />
          <span>รายละเอียดสไลด์ในรอบการย้อม: {run?.run_no}</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={800}
      footer={[
        <Button key="close" onClick={onCancel}>
          ปิดหน้าต่าง
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          disabled={!run}
          onClick={() => run && onPrint(run.id)}
        >
          พิมพ์สติกเกอร์ทั้งหมดใน Run นี้
        </Button>,
      ]}
    >
      <Table
        dataSource={(run?.details || []) as StainRunDetail[]}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        bordered
        scroll={{ y: 400 }}
      />
    </Modal>
  );
};

export default StainingRunDetailModal;

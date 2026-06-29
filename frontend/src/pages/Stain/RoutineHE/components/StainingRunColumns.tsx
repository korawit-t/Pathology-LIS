import { Button, Space, Tag, Typography, Tooltip } from "antd";
import { EyeOutlined, DeleteOutlined, PrinterOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { StainingRunResponse } from "../../../../types/stains";

const { Text } = Typography;

interface ColumnProps {
  onSelectRun: (run: StainingRunResponse) => void;
  onDelete: (run: StainingRunResponse) => void;
  onPrint: (id: number) => void;
}

export const getStainingRunColumns = ({
  onSelectRun,
  onDelete,
  onPrint,
}: ColumnProps) => [
  {
    title: "Run Number",
    dataIndex: "run_no",
    key: "run_no",
    render: (text: string) => (
      <Text strong style={{ color: "#1890ff" }}>
        {text}
      </Text>
    ),
  },
  {
    title: "Stainer / User",
    key: "info",
    render: (_: unknown, record: StainingRunResponse) => (
      <div>
        <Tag color="cyan" style={{ marginBottom: 4 }}>
          {record.stainer_id || "Manual"}
        </Tag>
        <br />
        <Text type="secondary" style={{ fontSize: "12px" }}>
          {record.operator?.full_name || "System"}
        </Text>
      </div>
    ),
  },
  {
    title: "Slides",
    dataIndex: "details",
    key: "slide_count",
    align: "center" as const,
    render: (details: StainingRunResponse["details"]) => (
      <Tag color={details?.length > 0 ? "processing" : "default"}>
        {details?.length || 0} Slides
      </Tag>
    ),
  },
  {
    title: "Time",
    dataIndex: "started_at",
    key: "started_at",
    render: (time: string) => (
      <Tooltip title={dayjs(time).format("DD/MM/YYYY HH:mm:ss")}>
        {dayjs(time).format("DD/MM/YYYY HH:mm")}
      </Tooltip>
    ),
  },
  {
    title: "Status",
    key: "print_status",
    align: "center" as const,
    render: (_: unknown, record: StainingRunResponse) => {
      const details = record.details || [];
      const total = details.length;
      const printed = details.filter((d) => d.stain_order?.is_printed).length;
      if (total === 0) return <Tag>No Data</Tag>;
      if (printed === total) return <Tag color="green">Printed ({printed}/{total})</Tag>;
      if (printed > 0) return <Tag color="orange">Partial ({printed}/{total})</Tag>;
      return <Tag color="default">Not Printed</Tag>;
    },
  },
  {
    title: "Action",
    key: "action",
    width: 120,
    align: "center" as const,
    render: (_: unknown, record: StainingRunResponse) => (
      <Space>
        <Tooltip title="พิมพ์สติกเกอร์">
          <Button
            type="primary"
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => onPrint(record.id)}
          />
        </Tooltip>
        <Tooltip title="ดูรายละเอียด">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => onSelectRun(record)}
          />
        </Tooltip>
        <Tooltip title="ลบรอบการย้อม">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(record)}
          />
        </Tooltip>
      </Space>
    ),
  },
];

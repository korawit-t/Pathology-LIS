import React, { useEffect, useState, useCallback } from "react";
import { Table, Tag, Button, Tooltip, Space, message } from "antd";
import type { TablePaginationConfig } from "antd/es/table";
import {
  EyeOutlined,
  ExperimentOutlined,
  UserOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import GyneStainService from "../../services/gyneStainService";
import { GyneStainRun, GyneStainRunDetail } from "../../types/gyne-stain";
import { executePrint } from "../Stain/PrintStickerHE/utils/generateHEStickers";
import logger from "../../utils/logger";

interface GyneStainRunTableProps {
  onSelectRun: (run: GyneStainRun) => void;
  refreshKey?: number;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "default",
  stained: "blue",
  completed: "green",
  cancelled: "red",
};

const ExpandedSlides: React.FC<{ details: GyneStainRunDetail[] }> = ({ details }) => (
  <Table
    dataSource={details}
    rowKey="id"
    size="small"
    pagination={false}
    style={{ margin: "0 48px" }}
    columns={[
      {
        title: "#",
        width: 40,
        render: (_: unknown, __: unknown, idx: number) => idx + 1,
      },
      {
        title: "Accession No.",
        render: (_: unknown, record: GyneStainRunDetail) => (
          <b style={{ color: "#722ed1" }}>
            {record.stain_order?.accession_no || record.stain_order?.case?.accession_no || "-"}
          </b>
        ),
      },
      {
        title: "Test",
        render: (_: unknown, record: GyneStainRunDetail) => (
          <Tag color="purple">{record.stain_order?.test?.name || "Pap Smear"}</Tag>
        ),
      },
      {
        title: "Slide No.",
        align: "center" as const,
        render: (_: unknown, record: GyneStainRunDetail) => record.stain_order?.slide_no ?? "-",
      },
      {
        title: "Status",
        render: (_: unknown, record: GyneStainRunDetail) => {
          const status = record.stain_order?.status || "pending";
          return <Tag color={STATUS_COLOR[status]}>{status.toUpperCase()}</Tag>;
        },
      },
      {
        title: "Printed",
        align: "center" as const,
        render: (_: unknown, record: GyneStainRunDetail) =>
          record.stain_order?.is_printed
            ? <Tag color="green">✓</Tag>
            : <Tag color="default">-</Tag>,
      },
    ]}
  />
);

const GyneStainRunTable: React.FC<GyneStainRunTableProps> = ({
  onSelectRun,
  refreshKey,
}) => {
  const [data, setData] = useState<GyneStainRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [printingId, setPrintingId] = useState<number | null>(null);

  const loadData = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const res = await GyneStainService.getAllRuns(skip, pageSize);

      if (res && "items" in res) {
        setData(res.items);
        setTotal(res.total);
      } else {
        setData(Array.isArray(res) ? res : []);
      }
    } catch (err) {
      logger.error("Error loading runs:", err);
      message.error("ไม่สามารถโหลดประวัติการย้อมได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(pagination.current, pagination.pageSize);
  }, [loadData, refreshKey]);

  const handleTableChange = (nav: TablePaginationConfig) => {
    const current = nav.current || 1;
    const pageSize = nav.pageSize || 10;
    setPagination({ current, pageSize });
    loadData(current, pageSize);
  };

  const handlePrint = async (run: GyneStainRun) => {
    setPrintingId(run.id);
    try {
      const blob = await GyneStainService.printRunStickers(run.id);
      executePrint(blob);
      await loadData(pagination.current, pagination.pageSize);
    } catch {
      message.error("ไม่สามารถพิมพ์สติกเกอร์ได้");
    } finally {
      setTimeout(() => setPrintingId(null), 1500);
    }
  };

  const columns = [
    {
      title: "Run No.",
      dataIndex: "run_no",
      key: "run_no",
      width: 150,
      render: (val: string) => <b style={{ color: "#722ed1" }}>{val}</b>,
    },
    {
      title: "Stainer / Method",
      dataIndex: "stainer_id",
      key: "stainer_id",
      render: (id: string) => (
        <Tag icon={<ExperimentOutlined />} color="purple">
          {id || "Manual Staining"}
        </Tag>
      ),
    },
    {
      title: "Date / Time",
      dataIndex: "created_at",
      key: "created_at",
      render: (val: string) => dayjs(val).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Operator",
      key: "operator",
      render: (_: unknown, record: GyneStainRun) => (
        <span>
          <UserOutlined style={{ marginRight: 4, color: "#bfbfbf" }} />
          {record.operator?.full_name || record.operator?.name || "-"}
        </span>
      ),
    },
    {
      title: "Slides",
      key: "slide_count",
      align: "center" as const,
      render: (_: unknown, record: GyneStainRun) => {
        const tot = record.details?.length || 0;
        const printed = record.details?.filter((d) => d.stain_order?.is_printed).length || 0;
        if (tot === 0) return <Tag>{tot}</Tag>;
        if (printed === tot) return <Tag color="green">{printed}/{tot} Printed</Tag>;
        if (printed > 0) return <Tag color="orange">{printed}/{tot} Printed</Tag>;
        return <Tag color="default">{tot} slides</Tag>;
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={STATUS_COLOR[status?.toLowerCase()] ?? "default"}>
          {status?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 120,
      align: "center" as const,
      render: (_: unknown, record: GyneStainRun) => (
        <Space>
          <Tooltip title="พิมพ์สติ๊กเกอร์">
            <Button
              size="small"
              icon={<PrinterOutlined />}
              loading={printingId === record.id}
              onClick={(e) => { e.stopPropagation(); handlePrint(record); }}
              style={{ borderColor: "#722ed1", color: "#722ed1" }}
            />
          </Tooltip>
          <Tooltip title="ดูรายละเอียด">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={(e) => { e.stopPropagation(); onSelectRun(record); }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Table
      loading={loading}
      columns={columns}
      dataSource={data}
      rowKey="id"
      size="middle"
      bordered
      onChange={handleTableChange}
      expandable={{
        expandedRowRender: (record) => <ExpandedSlides details={record.details || []} />,
        rowExpandable: (record) => (record.details?.length || 0) > 0,
      }}
      onRow={(record) => ({
        onDoubleClick: () => onSelectRun(record),
        style: { cursor: "pointer" },
      })}
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: total,
        showSizeChanger: true,
        showTotal: (total) => `ทั้งหมด ${total} รายการ`,
      }}
    />
  );
};

export default GyneStainRunTable;

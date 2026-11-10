import React, { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { ReloadOutlined, RollbackOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import legacyImportService, { LegacyImportBatch } from "../../../services/legacyImportService";
import { REPORT_TYPE_COLOR, REPORT_TYPE_LABEL, apiErrorText } from "./mappingUtils";

const { Text } = Typography;
const PAGE_SIZE = 20;

interface Props {
  /** Bumped by the page after a commit, to reload the list. */
  refreshKey: number;
}

const BatchHistory: React.FC<Props> = ({ refreshKey }) => {
  const [items, setItems] = useState<LegacyImportBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await legacyImportService.getBatches({ skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      message.error(apiErrorText(e, "โหลดประวัติการนำเข้าไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const rollback = async (batch: LegacyImportBatch) => {
    setRollingBack(batch.id);
    try {
      const res = await legacyImportService.rollback(batch.id);
      message.success(`ยกเลิกชุดที่ #${batch.id} แล้ว ลบ ${res.rolled_back_count ?? 0} รายงาน`);
      load();
    } catch (e) {
      message.error(apiErrorText(e, "ยกเลิกไม่สำเร็จ"));
    } finally {
      setRollingBack(null);
    }
  };

  const columns = [
    { title: "#", dataIndex: "id", key: "id", width: 70 },
    {
      title: "วันที่นำเข้า",
      dataIndex: "created_at",
      key: "created_at",
      width: 120,
      render: (v?: string | null) => (v ? dayjs(v).format("DD/MM/YY HH:mm") : "—"),
    },
    {
      title: "ไฟล์",
      dataIndex: "file_name",
      key: "file_name",
      width: 240,
      render: (v: string | null, b: LegacyImportBatch) => (
        <Space orientation="vertical" size={2}>
          <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 220 }}>
            {v || "—"}
          </Text>
          <Space size={4}>
            <Tag color={REPORT_TYPE_COLOR[b.report_type]} style={{ marginInlineEnd: 0 }}>
              {REPORT_TYPE_LABEL[b.report_type] ?? b.report_type}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {b.source_system}
            </Text>
          </Space>
        </Space>
      ),
    },
    {
      title: "ผล",
      key: "counts",
      render: (_: unknown, b: LegacyImportBatch) => (
        <Space size={4} wrap>
          <Tag color="green">เพิ่ม {b.inserted_count.toLocaleString()}</Tag>
          {b.updated_count > 0 && <Tag color="blue">อัปเดต {b.updated_count.toLocaleString()}</Tag>}
          {b.skipped_count > 0 && <Tag>ข้าม {b.skipped_count.toLocaleString()}</Tag>}
          {b.error_count > 0 && <Tag color="red">ไม่นำเข้า {b.error_count.toLocaleString()}</Tag>}
        </Space>
      ),
    },
    { title: "ผู้นำเข้า", dataIndex: "created_by_name", key: "created_by_name", width: 150, render: (v?: string | null) => v || "—" },
    {
      title: "สถานะ",
      key: "status",
      width: 190,
      render: (_: unknown, b: LegacyImportBatch) =>
        b.status === "rolled_back" ? (
          <Tooltip
            title={`โดย ${b.rolled_back_by_name ?? "—"} เมื่อ ${b.rolled_back_at ? dayjs(b.rolled_back_at).format("DD/MM/YY HH:mm") : "—"} (ลบ ${b.rolled_back_count ?? 0} รายงาน)`}
          >
            <Tag>ยกเลิกแล้ว</Tag>
          </Tooltip>
        ) : (
          <Space size={6}>
            <Tag color="success" style={{ marginInlineEnd: 0 }}>
              นำเข้าแล้ว
            </Tag>
            <Popconfirm
              title={`ยกเลิกชุดที่ #${b.id}?`}
              description={
                <div style={{ maxWidth: 320 }}>
                  ลบรายงาน {b.inserted_count.toLocaleString()} ฉบับที่ชุดนี้เพิ่มเข้าไป ทำย้อนกลับไม่ได้
                  {b.updated_count > 0 && " รายงานที่ชุดนี้อัปเดตจะไม่ถูกเปลี่ยนกลับ"}
                </div>
              }
              okText="ยกเลิกชุดนี้"
              okButtonProps={{ danger: true }}
              cancelText="ไม่"
              onConfirm={() => rollback(b)}
            >
              <Button size="small" danger icon={<RollbackOutlined />} loading={rollingBack === b.id}>
                ยกเลิก
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          โหลดใหม่
        </Button>
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={columns}
        scroll={{ x: 860 }}
        locale={{ emptyText: "ยังไม่มีการนำเข้า" }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, onChange: setPage, showSizeChanger: false }}
      />
    </div>
  );
};

export default BatchHistory;

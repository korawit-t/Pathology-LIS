import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Descriptions,
  Input,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { TablePaginationConfig } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type {
  NongyneDisposalBatch,
  NongyneDisposalBatchStatus,
} from "../../types/nongyneSpecimenDisposal";
import logger from "../../utils/logger";

const { Text } = Typography;
const PAGE_SIZE = 20;

const STATUS_META: Record<
  NongyneDisposalBatchStatus,
  { color: string; label: string }
> = {
  PRINTED: { color: "orange", label: "รอตรวจสอบหน้างาน" },
  DISPOSED: { color: "green", label: "ทำลายแล้ว" },
  CANCELLED: { color: "default", label: "ยกเลิก" },
};

type StatusFilter = NongyneDisposalBatchStatus | "ALL";

interface Props {
  /** ยิงเมื่อจำนวนใบที่ค้างเปลี่ยน เพื่อให้หน้าแม่รีเฟรช badge และ tab อื่น */
  onChanged?: () => void;
}

const NongyneDisposalBatchTab: React.FC<Props> = ({ onChanged }) => {
  const [batches, setBatches] = useState<NongyneDisposalBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PRINTED");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      const data = await NongyneSpecimenDisposalService.getAll({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      });
      setBatches(data.items);
      setTotal(data.total);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถโหลดรายการรอบการทำลายได้");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const handlePrint = async (batch: NongyneDisposalBatch) => {
    try {
      setBusyId(batch.id);
      await NongyneSpecimenDisposalService.openChecklistPdf(batch.id);
    } catch (error) {
      logger.error(error);
      message.error("เปิดใบไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirm = (batch: NongyneDisposalBatch) => {
    let method = "";
    let remark = "";

    Modal.confirm({
      title: `ยืนยันการทำลายตามใบ ${batch.batch_no}`,
      width: 560,
      okText: "ยืนยันทำลาย",
      okType: "danger",
      cancelText: "ยกเลิก",
      content: (
        <div>
          <Text type="secondary">
            สิ่งส่งตรวจ {batch.item_count} รายการในใบนี้จะถูกบันทึกว่าทำลายแล้ว
            โดยลงชื่อผู้ทิ้งเป็น <b>{batch.disposer_name || "-"}</b> — ย้อนกลับไม่ได้
          </Text>
          <div style={{ marginTop: 12 }}>
            <Text>วิธีทำลาย</Text>
            <Input
              placeholder="เช่น เตาเผาขยะติดเชื้อ"
              onChange={(e) => {
                method = e.target.value;
              }}
              style={{ marginTop: 4 }}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Text>หมายเหตุ</Text>
            <Input.TextArea
              rows={2}
              placeholder="เช่น ไม่พบ 2 รายการ ตามที่บันทึกไว้บนใบ"
              onChange={(e) => {
                remark = e.target.value;
              }}
              style={{ marginTop: 4 }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        try {
          await NongyneSpecimenDisposalService.confirm(batch.id, {
            disposal_method: method || undefined,
            remark: remark || undefined,
          });
          message.success(`บันทึกการทำลายตามใบ ${batch.batch_no} แล้ว`);
          fetchBatches();
          onChanged?.();
        } catch (error: unknown) {
          logger.error(error);
          const detail = (error as { response?: { data?: { detail?: string } } })
            ?.response?.data?.detail;
          message.error(detail || "ยืนยันการทำลายไม่สำเร็จ");
          throw error;
        }
      },
    });
  };

  const handleCancel = (batch: NongyneDisposalBatch) => {
    let reason = "";
    Modal.confirm({
      title: `ยกเลิกใบ ${batch.batch_no}`,
      okText: "ยกเลิกใบนี้",
      okType: "danger",
      cancelText: "ปิด",
      content: (
        <div>
          <Text type="secondary">
            เคส {batch.item_count} รายการจะกลับไปเลือกทำใบใหม่ได้
          </Text>
          <Input
            placeholder="เหตุผล เช่น พิมพ์ผิดรอบ"
            onChange={(e) => {
              reason = e.target.value;
            }}
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      onOk: async () => {
        try {
          await NongyneSpecimenDisposalService.cancel(batch.id, reason || undefined);
          message.success(`ยกเลิกใบ ${batch.batch_no} แล้ว`);
          fetchBatches();
          onChanged?.();
        } catch (error: unknown) {
          logger.error(error);
          const detail = (error as { response?: { data?: { detail?: string } } })
            ?.response?.data?.detail;
          message.error(detail || "ยกเลิกใบไม่สำเร็จ");
          throw error;
        }
      },
    });
  };

  const columns = [
    {
      title: "เลขที่ใบ",
      dataIndex: "batch_no",
      key: "batch_no",
      width: 160,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "วันที่พิมพ์",
      dataIndex: "printed_at",
      key: "printed_at",
      width: 150,
      render: (date: string) =>
        date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "จำนวน",
      dataIndex: "item_count",
      key: "item_count",
      width: 110,
      render: (count: number, record: NongyneDisposalBatch) => {
        const types = new Set(
          record.items.map((i) => i.specimen_type || "-")
        );
        return (
          <Tooltip title={`ชนิด: ${Array.from(types).sort().join(", ")}`}>
            <span>{count} รายการ</span>
          </Tooltip>
        );
      },
    },
    {
      title: "ผู้ทิ้ง",
      dataIndex: "disposer_name",
      key: "disposer_name",
      render: (name: string) => name || "-",
    },
    {
      title: "ผู้ตรวจสอบ",
      dataIndex: "verifier_name",
      key: "verifier_name",
      render: (name: string) => name || "-",
    },
    {
      title: "ผู้อนุมัติ",
      dataIndex: "approver_name",
      key: "approver_name",
      render: (name: string) => name || "-",
    },
    {
      title: "สถานะ",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (
        status: NongyneDisposalBatchStatus,
        record: NongyneDisposalBatch
      ) => {
        const meta = STATUS_META[status];
        const tag = <Tag color={meta.color}>{meta.label}</Tag>;
        if (status === "DISPOSED" && record.disposed_at) {
          return (
            <Tooltip title={dayjs(record.disposed_at).format("DD/MM/YYYY HH:mm")}>
              {tag}
            </Tooltip>
          );
        }
        if (status === "CANCELLED" && record.cancel_reason) {
          return <Tooltip title={record.cancel_reason}>{tag}</Tooltip>;
        }
        return tag;
      },
    },
    {
      title: "",
      key: "actions",
      width: 300,
      render: (_: unknown, record: NongyneDisposalBatch) => (
        <Space>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            loading={busyId === record.id}
            onClick={() => handlePrint(record)}
          >
            พิมพ์ซ้ำ
          </Button>
          {record.status === "PRINTED" && (
            <>
              <Button
                size="small"
                type="primary"
                danger
                icon={<CheckCircleOutlined />}
                onClick={() => handleConfirm(record)}
              >
                ยืนยันทำลาย
              </Button>
              <Button
                size="small"
                icon={<CloseCircleOutlined />}
                onClick={() => handleCancel(record)}
              >
                ยกเลิกใบ
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const expandedRowRender = (record: NongyneDisposalBatch) => (
    <div style={{ padding: "4px 0 8px" }}>
      <Descriptions size="small" column={3} style={{ marginBottom: 10 }}>
        <Descriptions.Item label="เกณฑ์อายุ">
          {record.retention_days != null ? `${record.retention_days} วัน` : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="ผู้พิมพ์">
          {record.printed_by?.full_name || record.printed_by?.username || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="วิธีทำลาย">
          {record.disposal_method || "-"}
        </Descriptions.Item>
        {record.remark && (
          <Descriptions.Item label="หมายเหตุ" span={3}>
            {record.remark}
          </Descriptions.Item>
        )}
      </Descriptions>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={record.items}
        columns={[
          { title: "Accession No.", dataIndex: "accession_no", width: 140 },
          { title: "HN", dataIndex: "hn", width: 110 },
          { title: "ชื่อ-สกุลผู้ป่วย", dataIndex: "patient_name" },
          { title: "ชนิดสิ่งส่งตรวจ", dataIndex: "specimen_type", width: 130 },
          { title: "ตำแหน่งที่เก็บ", dataIndex: "collection_site", width: 150 },
          {
            title: "ออกผลมาแล้ว",
            dataIndex: "days_since_report",
            width: 120,
            render: (days: number | null) =>
              days == null ? "-" : `${days} วัน`,
          },
        ]}
      />
    </div>
  );

  return (
    <div style={{ padding: "16px 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Segmented
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as StatusFilter);
            setPage(1);
          }}
          options={[
            { label: "รอตรวจสอบหน้างาน", value: "PRINTED" },
            { label: "ทำลายแล้ว", value: "DISPOSED" },
            { label: "ยกเลิก", value: "CANCELLED" },
            { label: "ทั้งหมด", value: "ALL" },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchBatches} loading={loading}>
          Refresh
        </Button>
      </div>
      <Table
        size="middle"
        bordered
        rowKey="id"
        columns={columns}
        dataSource={batches}
        loading={loading}
        expandable={{ expandedRowRender }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
        }}
        onChange={(pagination: TablePaginationConfig) =>
          setPage(pagination.current || 1)
        }
      />
    </div>
  );
};

export default NongyneDisposalBatchTab;

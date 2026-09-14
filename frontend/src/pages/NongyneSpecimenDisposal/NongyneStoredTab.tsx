import React, { useCallback, useEffect, useState } from "react";
import { Button, Table, Tag, Typography, message } from "antd";
import type { TablePaginationConfig } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type { NongyneDisposalCandidate } from "../../types/nongyneSpecimenDisposal";
import { formatPatientName } from "../../utils/patientName";
import logger from "../../utils/logger";

const { Text } = Typography;
const PAGE_SIZE = 20;

interface Props {
  search: string;
  /** ยิงกลับพร้อมเกณฑ์อายุที่ backend ใช้ เพื่อให้หน้าแม่โชว์เลขเดียวกัน */
  onRetentionDays?: (days: number) => void;
}

const NongyneStoredTab: React.FC<Props> = ({ search, onRetentionDays }) => {
  const [cases, setCases] = useState<NongyneDisposalCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const data = await NongyneSpecimenDisposalService.getStored({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      setCases(data.items);
      setTotal(data.total);
      onRetentionDays?.(data.retention_days);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถโหลดรายการที่จัดเก็บแล้วได้");
    } finally {
      setLoading(false);
    }
    // onRetentionDays ตั้งใจไม่ใส่ใน deps — เป็น callback ของหน้าแม่ที่สร้างใหม่ทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 150,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: "HN", dataIndex: "hn", key: "hn", width: 110 },
    {
      title: "ชื่อ-สกุลผู้ป่วย",
      key: "patient",
      render: (_: unknown, record: NongyneDisposalCandidate) => (
        <span>{formatPatientName(record.patient)}</span>
      ),
    },
    {
      title: "ชนิดสิ่งส่งตรวจ",
      dataIndex: "specimen_type",
      key: "specimen_type",
      width: 130,
      render: (text: string) => <Tag color="blue">{text || "-"}</Tag>,
    },
    {
      title: "ที่เก็บ / เลขกล่อง",
      dataIndex: "specimen_storage_container",
      key: "specimen_storage_container",
      width: 150,
      // เคสที่ backfill มาตอน deploy ยังไม่มีเลขกล่อง จนกว่าจะมีคนไประบุ
      render: (text: string) =>
        text ? <Tag color="blue">{text}</Tag> : <Text type="warning">ยังไม่ระบุ</Text>,
    },
    {
      title: "วันที่จัดเก็บ",
      dataIndex: "specimen_storage_at",
      key: "specimen_storage_at",
      width: 160,
      render: (date: string) =>
        date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "ผู้จัดเก็บ",
      key: "specimen_storer",
      render: (_: unknown, record: NongyneDisposalCandidate) => (
        <Text>{record.specimen_storer?.full_name || "-"}</Text>
      ),
    },
  ];

  return (
    <div style={{ padding: "16px 24px" }}>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchCases} loading={loading}>
          Refresh
        </Button>
      </div>
      <Table
        size="middle"
        bordered
        rowKey="id"
        columns={columns}
        dataSource={cases}
        loading={loading}
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

export default NongyneStoredTab;

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { CheckSquareOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type { NongyneDisposalCandidate } from "../../types/nongyneSpecimenDisposal";
import { formatPatientName } from "../../utils/patientName";
import logger from "../../utils/logger";

const { Text } = Typography;

interface Props {
  search: string;
  /** ยิงเมื่อมีเคสถูกระบุที่เก็บ เพื่อให้ tab อื่นรีเฟรชตาม */
  onChanged?: () => void;
}

const NongyneUnstoredTab: React.FC<Props> = ({ search, onChanged }) => {
  const [cases, setCases] = useState<NongyneDisposalCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [container, setContainer] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const data = await NongyneSpecimenDisposalService.getUnstored(search);
      setCases(data);
      setSelectedRowKeys([]);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถโหลดรายการที่ยังไม่ได้จัดเก็บได้");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const handleBulkUpdate = () => {
    if (selectedRowKeys.length === 0) {
      return message.warning("กรุณาเลือกอย่างน้อย 1 รายการ");
    }
    if (!container.trim()) {
      return message.warning("กรุณาระบุที่เก็บ / เลขกล่อง");
    }

    const selected = cases.filter((c) => selectedRowKeys.includes(c.id));

    Modal.confirm({
      title: "ยืนยันการระบุที่เก็บ",
      width: 620,
      okText: "บันทึกที่เก็บ",
      cancelText: "ยกเลิก",
      content: (
        <div>
          <p>
            กำลังบันทึก <b>{selected.length}</b> รายการ ลงที่เก็บ{" "}
            <Tag color="blue">{container}</Tag>
          </p>
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={selected}
            style={{ marginTop: 12 }}
            columns={[
              { title: "Accession No.", dataIndex: "accession_no", width: 140 },
              { title: "HN", dataIndex: "hn", width: 100 },
              {
                title: "ชื่อ-สกุลผู้ป่วย",
                render: (_: unknown, r: NongyneDisposalCandidate) =>
                  formatPatientName(r.patient),
              },
            ]}
          />
        </div>
      ),
      onOk: async () => {
        try {
          setSaving(true);
          await NongyneSpecimenDisposalService.bulkUpdateStorage({
            case_ids: selectedRowKeys as number[],
            container_number: container.trim(),
          });
          message.success(`บันทึกที่เก็บ ${selectedRowKeys.length} รายการแล้ว`);
          setContainer("");
          fetchCases();
          onChanged?.();
        } catch (error: unknown) {
          logger.error(error);
          const detail = (error as { response?: { data?: { detail?: string } } })
            ?.response?.data?.detail;
          message.error(detail || "บันทึกที่เก็บไม่สำเร็จ");
          throw error;
        } finally {
          setSaving(false);
        }
      },
    });
  };

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
      title: "ตำแหน่งที่เก็บ",
      dataIndex: "collection_site",
      key: "collection_site",
      render: (text: string) => text || "-",
    },
    {
      title: "วันที่รับเคส",
      dataIndex: "registered_at",
      key: "registered_at",
      width: 130,
      render: (date: string) => (date ? dayjs(date).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "สถานะเคส",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (text: string) => (
        <Text type="secondary" style={{ textTransform: "capitalize" }}>
          {text}
        </Text>
      ),
    },
  ];

  return (
    <div style={{ padding: "16px 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Space size="large" wrap>
          <Text strong>เลือกไว้ {selectedRowKeys.length} รายการ</Text>
          <Space>
            <Text>ที่เก็บ / เลขกล่อง:</Text>
            <Input
              placeholder="เช่น NG-12"
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              style={{ width: 160 }}
            />
          </Space>
          <Button
            type="primary"
            icon={<CheckSquareOutlined />}
            onClick={handleBulkUpdate}
            loading={saving}
            disabled={selectedRowKeys.length === 0}
          >
            บันทึกที่เก็บ
          </Button>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={fetchCases} loading={loading}>
          Refresh
        </Button>
      </div>
      <Table
        size="middle"
        bordered
        rowKey="id"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        columns={columns}
        dataSource={cases}
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
};

export default NongyneUnstoredTab;

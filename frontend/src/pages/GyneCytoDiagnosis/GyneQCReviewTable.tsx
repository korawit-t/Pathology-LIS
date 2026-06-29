import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  Tag,
  Typography,
  Segmented,
  Input,
  Button,
  Tooltip,
  Modal,
  message,
  Space,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  ExclamationCircleFilled,
  CheckCircleFilled,
  ClockCircleOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import SystemSettingService from "../../services/systemSettingService";
import { GyneCytologyCase } from "../../types/gyne-cytology";
import AccessionTag from "../../components/AccessionTag";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;

type ReviewFilter = "pending" | "reviewed" | "any" | "random_10pct" | "abnormal";

const REVIEW_REASON_CONFIG: Record<string, { color: string; label: string }> = {
  random_10pct: { color: "blue", label: "NILM 10%" },
  abnormal: { color: "orange", label: "Abnormal" },
  manual: { color: "default", label: "Manual" },
};

const RESULT_CONFIG: Record<
  string,
  { color: string; label: string; icon: React.ReactNode }
> = {
  agree: { color: "success", label: "Agree", icon: <CheckCircleFilled /> },
  disagree: {
    color: "error",
    label: "Disagree",
    icon: <ExclamationCircleFilled />,
  },
};

interface GyneQCReviewTableProps {
  onSelectCase?: (id: number) => void;
  standAlone?: boolean;
}

const GyneQCReviewTable: React.FC<GyneQCReviewTableProps> = ({
  onSelectCase,
  standAlone = true,
}) => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<GyneCytologyCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [searchText, setSearchText] = useState("");
  const [nilmN, setNilmN] = useState<number>(10);
  const [infoOpen, setInfoOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    SystemSettingService.getSettings()
      .then((s) => setNilmN(s.nilm_review_every_n ?? 10))
      .catch(() => {});
  }, []);

  const filterOptions = useMemo<{ label: string; value: ReviewFilter }[]>(
    () => [
      { label: "Pending Review", value: "pending" },
      { label: "Reviewed", value: "reviewed" },
      { label: "All", value: "any" },
      { label: `NILM — ${nilmN}%`, value: "random_10pct" },
      { label: "Abnormal", value: "abnormal" },
    ],
    [nilmN],
  );

  const handleSelectCase = (id: number) => {
    if (onSelectCase) {
      onSelectCase(id);
    } else {
      navigate(`/gyne-cyto-diagnosis-entry?id=${id}`);
    }
  };

  const loadCases = async () => {
    try {
      setLoading(true);
      const params: Parameters<typeof GyneCytologyCaseService.getAll>[0] = {
        search: searchText.trim() || undefined,
        limit: 100,
      };
      if (filter === "pending") {
        params.review_reason = "any";
        params.is_reviewed = false;
      } else if (filter === "reviewed") {
        params.review_reason = "any";
        params.is_reviewed = true;
      } else {
        params.review_reason = filter;
      }
      const data = await GyneCytologyCaseService.getAll(params);
      setCases(data.items);
      setTotal(data.total);
    } catch {
      message.error("ไม่สามารถโหลดข้อมูล QC Review ได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, searchText]);

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 160,
      render: (text: string) => <AccessionTag value={text} />,
    },
    {
      title: "Regist At",
      dataIndex: "registered_at",
      key: "registered_at",
      width: 100,
      render: (date: string) =>
        date ? (
          <Tooltip title={dayjs(date).format("DD/MM/YYYY HH:mm")}>
            <Text style={{ fontSize: 12 }}>{dayjs(date).format("DD/MM/YY")}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ),
    },
    {
      title: "Patient",
      key: "patient",
      render: (_: unknown, record: GyneCytologyCase) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {[
              record.patient?.title?.title,
              record.patient?.name,
              record.patient?.ln,
            ]
              .filter(Boolean)
              .join(" ")}
          </div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            {record.hospital?.name || "—"}
          </div>
        </div>
      ),
    },
    {
      title: "Review Type",
      dataIndex: "review_reason",
      key: "review_reason",
      width: 140,
      render: (reason: string) => {
        const cfg = REVIEW_REASON_CONFIG[reason];
        return cfg ? (
          <Tag color={cfg.color} style={{ borderRadius: 20 }}>
            {cfg.label}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: "Cytotechnologist",
      key: "cytotechnologist",
      width: 160,
      render: (_: unknown, record: GyneCytologyCase) =>
        record.cytotechnologist?.full_name ? (
          <Text style={{ fontSize: 13 }}>
            {record.cytotechnologist.full_name}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Case Status",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          pending_review: "purple",
          pending_approval: "gold",
          published: "green",
          revised: "volcano",
        };
        const labelMap: Record<string, string> = {
          pending_review: "Pending Review",
          pending_approval: "Pending Approval",
          published: "Published",
          revised: "Revised",
        };
        return (
          <Tag color={colorMap[status] ?? "default"}>
            {labelMap[status] ?? status}
          </Tag>
        );
      },
    },
    {
      title: "Review Result",
      dataIndex: "review_result",
      key: "review_result",
      width: 140,
      render: (result: string, record: GyneCytologyCase) => {
        if (!result) {
          return (
            <Tag icon={<ClockCircleOutlined />} color="warning">
              Pending
            </Tag>
          );
        }
        const cfg = RESULT_CONFIG[result];
        if (!cfg) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={record.review_note || undefined}>
            <Tag
              icon={cfg.icon}
              color={cfg.color}
              style={{ cursor: record.review_note ? "help" : "default" }}
            >
              {cfg.label}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Reviewed By",
      key: "reviewed_by",
      width: 160,
      render: (_: unknown, record: GyneCytologyCase) =>
        record.reviewed_by?.full_name ? (
          <Text style={{ fontSize: 13 }}>{record.reviewed_by.full_name}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Reviewed At",
      dataIndex: "reviewed_at",
      key: "reviewed_at",
      width: 110,
      render: (date: string) =>
        date ? (
          <Tooltip title={dayjs(date).format("DD/MM/YYYY HH:mm")}>
            <Text style={{ fontSize: 12 }}>
              {dayjs(date).format("DD/MM/YY")}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Text>
        ),
    },
    {
      title: "Note",
      dataIndex: "review_note",
      key: "review_note",
      render: (note: string) =>
        note ? (
          <Tooltip title={note}>
            <Text
              style={{
                fontSize: 12,
                maxWidth: 200,
                display: "inline-block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {note}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  const content = (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Segmented
          options={filterOptions}
          value={filter}
          onChange={(v) => {
            setFilter(v as ReviewFilter);
            setSearchText("");
          }}
        />
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <Input
            placeholder="Search Accession / Patient"
            prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
            style={{ width: 260 }}
            allowClear
            value={searchText}
            onChange={(e) => {
              const val = e.target.value;
              if (searchTimer.current) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => setSearchText(val), 400);
            }}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={loadCases}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={cases}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => handleSelectCase(record.id),
          style: { cursor: "pointer" },
        })}
        pagination={{
          total,
          pageSize: 100,
          showSizeChanger: false,
          hideOnSinglePage: true,
          showTotal: (t) => `${t} case${t !== 1 ? "s" : ""}`,
        }}
        size="middle"
        bordered
        rowClassName={(record) =>
          record.review_result === "disagree" ? "qc-row-disagree" : ""
        }
      />
    </div>
  );

  if (!standAlone) return content;

  return (
    <>
      <PageContainer
        title="Gyne Cytology — QC Review Log"
        subTitle={`${total} case${total !== 1 ? "s" : ""} flagged for review`}
        withCard
        extra={
          <Space>
            <Button
              icon={<QuestionCircleOutlined />}
              onClick={() => setInfoOpen(true)}
            >
              วิธีการทำงาน
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadCases}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        }
      >
        {content}
      </PageContainer>

      <Modal
        title={
          <span>
            <QuestionCircleOutlined
              style={{ marginRight: 8, color: "#1d39c4" }}
            />
            วิธีการทำงานของ QC Review
          </span>
        }
        open={infoOpen}
        onCancel={() => setInfoOpen(false)}
        footer={null}
        width={560}
      >
        <div style={{ lineHeight: 1.8, color: "#262626" }}>
          <p style={{ marginBottom: 16 }}>
            ระบบจะคัดเลือก case เพื่อให้ Reviewer ตรวจสอบซ้ำ (QC Review)
            โดยอัตโนมัติ 2 กรณี:
          </p>

          <div style={{ marginBottom: 16 }}>
            <Tag color="blue" style={{ borderRadius: 20, marginBottom: 8 }}>
              NILM — {nilmN}% Random
            </Tag>
            <p style={{ margin: 0 }}>
              เมื่อ cytotechnologist รายงานผลเป็น <strong>NILM</strong>{" "}
              ระบบจะสุ่มอัตโนมัติ โดยแต่ละ case มีโอกาสถูกเลือก{" "}
              <strong>{nilmN}%</strong> อย่างอิสระ
              ไม่สามารถคาดเดาได้ว่า case ใดจะถูกสุ่ม
            </p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <Tag color="orange" style={{ borderRadius: 20, marginBottom: 8 }}>
              Abnormal
            </Tag>
            <p style={{ margin: 0 }}>
              ทุก case ที่มีผลผิดปกติจะถูกส่ง QC Review <strong>ทุกราย</strong>{" "}
              โดยไม่มีการสุ่ม
            </p>
          </div>

          <div
            style={{
              background: "#f0f5ff",
              border: "1px solid #d6e4ff",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#595959",
            }}
          >
            อัตราการสุ่มปัจจุบัน: <strong>{nilmN}% ต่อเคส</strong> —
            ปรับได้ในหน้าตั้งค่าระบบ
          </div>
        </div>
      </Modal>
    </>
  );
};

export default GyneQCReviewTable;

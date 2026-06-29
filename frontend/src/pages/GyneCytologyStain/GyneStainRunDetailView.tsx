import React, { useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Descriptions,
  message,
  Popconfirm,
} from "antd";
import {
  CheckCircleOutlined,
  ExperimentOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { printGyneStickers, toStickerSlide } from "./PrintStickerGyne/utils/generateGyneStickers";
import PageContainer from "../../components/Layout/PageContainer";
import GyneStainService from "../../services/gyneStainService";
import { GyneStainRun, GyneStainRunDetail, GyneStainStatus } from "../../types/gyne-stain";

interface Props {
  initialRun: GyneStainRun;
  onBack: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "default",
  stained: "blue",
  completed: "green",
  cancelled: "red",
};

const GyneStainRunDetailView: React.FC<Props> = ({ initialRun, onBack }) => {
  const [run, setRun] = useState<GyneStainRun>(initialRun);
  const [completing, setCompleting] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());

  const handleUpdateSlide = async (detail: GyneStainRunDetail, newStatus: GyneStainStatus) => {
    if (!detail.stain_order) return;
    setUpdatingIds((prev) => new Set(prev).add(detail.stain_id));
    try {
      await GyneStainService.update(detail.stain_id, { status: newStatus });
      setRun((prev) =>
        prev
          ? {
              ...prev,
              details: prev.details.map((d) =>
                d.stain_id === detail.stain_id
                  ? { ...d, stain_order: { ...d.stain_order!, status: newStatus } }
                  : d
              ),
            }
          : prev
      );
    } catch {
      message.error("อัปเดตสถานะสไลด์ไม่สำเร็จ");
    } finally {
      setUpdatingIds((prev) => {
        const s = new Set(prev);
        s.delete(detail.stain_id);
        return s;
      });
    }
  };

  const handleMarkAllStained = async () => {
    if (!run) return;
    const pending = run.details.filter((d) => d.stain_order?.status === "pending");
    for (const d of pending) {
      await handleUpdateSlide(d, "stained");
    }
    message.success("Mark all slides as Stained");
  };

  const handleCompleteRun = async () => {
    setCompleting(true);
    try {
      const updated = await GyneStainService.completeRun(run.id);
      setRun((prev) => (prev ? { ...prev, status: updated.status } : prev));
      message.success("Run completed successfully");
    } catch {
      message.error("ไม่สามารถปิด Run ได้");
    } finally {
      setCompleting(false);
    }
  };

  const isCompleted = run?.status?.toLowerCase() === "completed";

  const handlePrintStickers = async () => {
    const details = run.details.filter((d) => d.stain_order);
    const slides = details.map((d) => toStickerSlide(d.stain_order!));
    printGyneStickers(slides);
    try {
      await Promise.all(
        details.map((d) => GyneStainService.update(d.stain_id, { is_printed: true }))
      );
    } catch {
      message.error("ไม่สามารถอัปเดตสถานะการพิมพ์ได้");
    }
  };

  const columns = [
    {
      title: "#",
      width: 50,
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
      render: (_: unknown, record: GyneStainRunDetail) => record.stain_order?.slide_no ?? "-",
      align: "center" as const,
    },
    {
      title: "Status",
      render: (_: unknown, record: GyneStainRunDetail) => {
        const status = record.stain_order?.status || "pending";
        return <Tag color={STATUS_COLOR[status]}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: "Action",
      width: 160,
      render: (_: unknown, record: GyneStainRunDetail) => {
        if (isCompleted) return null;
        const status = record.stain_order?.status;
        const busy = updatingIds.has(record.stain_id);
        if (status === "stained" || status === "completed") return null;
        return (
          <Button
            size="small"
            type="primary"
            ghost
            loading={busy}
            icon={<CheckCircleOutlined />}
            onClick={() => handleUpdateSlide(record, "stained")}
          >
            Mark Stained
          </Button>
        );
      },
    },
  ];

  return (
    <PageContainer
      withCard
      title={`Gyne Staining Run: ${run?.run_no ?? "..."}`}
      onBack={onBack}
      extra={[
        <Button
          key="print"
          icon={<PrinterOutlined />}
          onClick={handlePrintStickers}
          disabled={run.details.length === 0}
          style={{ borderColor: "#722ed1", color: "#722ed1" }}
        >
          พิมพ์สติ๊กเกอร์
        </Button>,
        ...(!isCompleted
          ? [
              <Button
                key="all-stained"
                onClick={handleMarkAllStained}
              >
                Mark All Stained
              </Button>,
              <Popconfirm
                key="complete"
                title="ยืนยันปิด Run นี้?"
                description="สถานะจะเปลี่ยนเป็น Completed และไม่สามารถแก้ไขได้"
                onConfirm={handleCompleteRun}
                okText="ยืนยัน"
                cancelText="ยกเลิก"
              >
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={completing}
                  style={{ backgroundColor: "#52c41a", borderColor: "#52c41a" }}
                >
                  Complete Run
                </Button>
              </Popconfirm>,
            ]
          : []),
      ]}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={16}>
        <Descriptions bordered size="small" column={4}>
          <Descriptions.Item label="Run No.">{run.run_no}</Descriptions.Item>
          <Descriptions.Item label="Stainer">
            <Tag icon={<ExperimentOutlined />} color="purple">
              {run.stainer_id || "Manual"}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Date">
            {dayjs(run.created_at).format("DD/MM/YYYY HH:mm")}
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={STATUS_COLOR[run.status?.toLowerCase()] ?? "default"}>
              {run.status?.toUpperCase()}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Total Slides" span={4}>
            {run.details.length} slides
          </Descriptions.Item>
        </Descriptions>

        <Table
          columns={columns}
          dataSource={run.details}
          rowKey="stain_id"
          size="middle"
          pagination={{ pageSize: 20, showTotal: (t) => `${t} slides` }}
        />
      </Space>
    </PageContainer>
  );
};

export default GyneStainRunDetailView;

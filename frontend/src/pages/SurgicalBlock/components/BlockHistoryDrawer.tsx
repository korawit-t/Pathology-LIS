import React, { useEffect, useState } from "react";
import {
  Drawer,
  Timeline,
  Button,
  Popconfirm,
  Spin,
  message,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  ClockCircleOutlined,
  DeleteOutlined,
  ExportOutlined,
  ImportOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  InboxOutlined,
  DeploymentUnitOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  BlockTimelineService,
  BlockTimelineEntry,
} from "../../../services/blockTimelineService";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";

interface OutlabRunDetail {
  block_id?: number;
  stain_order?: { block_id?: number; test?: { name?: string } };
}

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  blockId: number | null;
  blockCode?: string;
  accessionNo?: string;
}

const DOT_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode }
> = {
  GROSSED: { color: "#52c41a", icon: <CheckCircleOutlined /> },
  PROCESSING_IN: { color: "#1677ff", icon: <InboxOutlined /> },
  PROCESSING_OUT: { color: "#1677ff", icon: <InboxOutlined /> },
  EMBEDDED: { color: "#722ed1", icon: <DeploymentUnitOutlined /> },
  SECTIONED: { color: "#13c2c2", icon: <ExperimentOutlined /> },
  STAINED: { color: "#eb2f96", icon: <ExperimentOutlined /> },
  STORED: { color: "#fa8c16", icon: <InboxOutlined /> },
  SENT_TO_OUTLAB: { color: "#f5222d", icon: <ExportOutlined /> },
  RETURNED_FROM_OUTLAB: { color: "#52c41a", icon: <ImportOutlined /> },
  NOTE: { color: "#8c8c8c", icon: <FileTextOutlined /> },
};

function getTimelineItemColor(entry: BlockTimelineEntry): string {
  return DOT_CONFIG[entry.event_type]?.color ?? "#8c8c8c";
}

export const BlockHistoryDrawer: React.FC<Props> = ({
  open,
  onClose,
  blockId,
  blockCode,
  accessionNo,
}) => {
  const [entries, setEntries] = useState<BlockTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTimeline = async () => {
    if (!blockId) return;
    setLoading(true);
    try {
      const [timelineData, allRuns] = await Promise.all([
        BlockTimelineService.getTimeline(blockId),
        SurgicalBlockStainService.getOutlabRuns({ limit: 500 }),
      ]);

      // Build outlab entries from runs that involve this block
      const outlabEntries: BlockTimelineEntry[] = [];
      for (const run of allRuns) {
        const details = (run.details as OutlabRunDetail[] | undefined) ?? [];
        const involved = details.some(
          (d) => d.block_id === blockId || d.stain_order?.block_id === blockId,
        );
        if (!involved) continue;

        const stainNames = details
          .filter(
            (d) => d.block_id === blockId || d.stain_order?.block_id === blockId,
          )
          .map((d) => d.stain_order?.test?.name ?? "")
          .filter(Boolean)
          .join(", ");

        const trackingNote = run.tracking_number
          ? `Tracking: ${run.tracking_number}`
          : undefined;

        outlabEntries.push({
          event_type: "SENT_TO_OUTLAB",
          source: "auto",
          label: `Sent to Outlab${stainNames ? ` — ${stainNames}` : ""}`,
          location: run.destination_lab,
          note: trackingNote,
          event_at: run.sent_at,
        });

        if (run.status === "received" && run.received_at) {
          outlabEntries.push({
            event_type: "RETURNED_FROM_OUTLAB",
            source: "auto",
            label: `Returned from Outlab${stainNames ? ` — ${stainNames}` : ""}`,
            location: run.destination_lab,
            note: trackingNote,
            event_at: run.received_at,
          });
        }
      }

      const merged = [...timelineData, ...outlabEntries].sort(
        (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime(),
      );
      setEntries(merged);
    } catch {
      message.error("โหลด timeline ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && blockId) {
      fetchTimeline();
    }
  }, [open, blockId]);

  const handleDelete = async (eventId: number) => {
    try {
      await BlockTimelineService.deleteEvent(eventId);
      message.success("ลบเหตุการณ์สำเร็จ");
      fetchTimeline();
    } catch {
      message.error("ลบไม่สำเร็จ");
    }
  };

  const timelineItems = entries.map((entry, i) => {
    const dotCfg = DOT_CONFIG[entry.event_type];
    return {
      key: i,
      color: getTimelineItemColor(entry),
      dot: dotCfg?.icon ? (
        <span style={{ fontSize: 14, color: dotCfg.color }}>
          {dotCfg.icon}
        </span>
      ) : (
        <ClockCircleOutlined style={{ fontSize: 14 }} />
      ),
      children: (
        <div style={{ paddingBottom: 4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Text strong>{entry.label}</Text>
            {entry.source === "manual" && (
              <Tag color="orange" style={{ margin: 0 }}>
                manual
              </Tag>
            )}
            {entry.source === "manual" && entry.event_id && (
              <Popconfirm
                title="ลบเหตุการณ์นี้?"
                onConfirm={() => handleDelete(entry.event_id!)}
                okText="ลบ"
                cancelText="ยกเลิก"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ padding: "0 4px" }}
                />
              </Popconfirm>
            )}
          </div>
          {entry.location && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                สถานที่: {entry.location}
              </Text>
            </div>
          )}
          {entry.note && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {entry.note}
              </Text>
            </div>
          )}
          {entry.performed_by_name && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                โดย: {entry.performed_by_name}
              </Text>
            </div>
          )}
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {dayjs(entry.event_at).format("DD/MM/YYYY HH:mm")}
            </Text>
          </div>
        </div>
      ),
    };
  });

  return (
    <Drawer
      title={
        <Space>
          <ClockCircleOutlined />
          <span>
            Block History
            {blockCode && (
              <Tag color="blue" style={{ marginLeft: 8 }}>
                {blockCode}
              </Tag>
            )}
            {accessionNo && (
              <Tag color="geekblue" style={{ marginLeft: 4 }}>
                {accessionNo}
              </Tag>
            )}
          </span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={520}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : entries.length === 0 ? (
        <Text type="secondary">ยังไม่มีข้อมูล timeline</Text>
      ) : (
        <Timeline items={timelineItems} />
      )}
    </Drawer>
  );
};

export default BlockHistoryDrawer;

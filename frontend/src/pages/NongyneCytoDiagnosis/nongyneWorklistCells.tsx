// src/pages/NongyneCytoDiagnosis/nongyneWorklistCells.tsx
//
// Table cells shared by the two Non-Gyne worklists (pathologist and
// cytotechnologist), drawn the way GyneCytoWorklist draws the same columns so
// the Gyne and Non-Gyne tabs of My Worklist match.
//
// These cells used Tailwind classes (font-medium, text-xs text-gray-500,
// rounded-full...), but this project has no Tailwind, so none of them applied:
// hospital and HN printed at full size beside the name, the specimen site
// likewise, and the status tag lost its pill shape.
import React from "react";
import { Tag, Tooltip, Typography } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  ExclamationCircleFilled,
  FileDoneOutlined,
  LinkOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { NongyneCytologyCase } from "../../types/nongyne";
import { renderConsultBadge } from "../../utils/consultBadge";

const { Text } = Typography;

/** One line, as Gyne and Surgical show it. */
export const formatRegisteredAt = (value?: string | null): string =>
  value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-";

export const renderPatientCell = (record: NongyneCytologyCase) => (
  <div>
    <div style={{ fontWeight: 500, lineHeight: "20px" }}>
      {[record.patient?.title?.title, record.patient?.name, record.patient?.ln]
        .filter(Boolean)
        .join(" ")}
    </div>
    <div style={{ fontSize: 12, color: "#8c8c8c" }}>{record.hospital?.name || "—"}</div>
    <div style={{ fontSize: 11, color: "#bfbfbf" }}>HN: {record.hn}</div>
  </div>
);

export const renderSpecimenCell = (record: NongyneCytologyCase) =>
  record.specimen_type ? (
    <div>
      <Tag color="blue" style={{ borderRadius: 4, margin: 0 }}>
        {record.specimen_type}
      </Tag>
      {record.collection_site && (
        <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>{record.collection_site}</div>
      )}
    </div>
  ) : (
    <Text type="secondary">—</Text>
  );

export const renderCytotechnologistCell = (record: NongyneCytologyCase) =>
  record.cytotechnologist?.full_name ? (
    <Text style={{ fontSize: 13 }}>{record.cytotechnologist.full_name}</Text>
  ) : (
    <Text type="secondary" style={{ fontSize: 12 }}>
      —
    </Text>
  );

// Colours, icons and labels as GyneCytoWorklist's STATUS_CONFIG, plus the two
// statuses only Non-Gyne has (screening, completed).
const STATUS_CONFIG: Record<string, { color: string; label: string; icon?: React.ReactNode }> = {
  registered: { color: "default", label: "Registered", icon: <ClockCircleOutlined /> },
  stained: { color: "cyan", label: "Stained", icon: <SyncOutlined /> },
  screening: { color: "geekblue", label: "Screening", icon: <SyncOutlined spin /> },
  screened: { color: "geekblue", label: "Screened", icon: <SyncOutlined spin /> },
  pending_approval: { color: "gold", label: "Pending Approval", icon: <ClockCircleOutlined /> },
  reported: { color: "green", label: "Reported", icon: <CheckCircleFilled /> },
  completed: { color: "green", label: "Completed", icon: <CheckCircleFilled /> },
  revised: { color: "volcano", label: "Revised", icon: <ExclamationCircleFilled /> },
  published: { color: "green", label: "Published", icon: <FileDoneOutlined /> },
  cancelled: { color: "red", label: "Cancelled" },
};

// A finished case keeps its own status even when it was screened on the way.
const FINAL_STATUSES = new Set(["reported", "completed", "published", "cancelled", "pending_approval"]);

/** The status a row should show: "screened" until the case reaches a final status. */
export const displayStatus = (record: NongyneCytologyCase): string => {
  const raw = (record.status || "").toLowerCase();
  return !FINAL_STATUSES.has(raw) && record.is_screened ? "screened" : raw;
};

export const renderStatusCell = (record: NongyneCytologyCase, opts: { consultBadge?: boolean } = {}) => {
  const status = displayStatus(record);
  const cfg = STATUS_CONFIG[status] ?? {
    color: "default",
    label: record.status ? record.status.toUpperCase() : "—",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <Tag color={cfg.color} icon={cfg.icon} style={{ borderRadius: 20, padding: "2px 10px", margin: 0 }}>
        {cfg.label}
      </Tag>
      {record.has_correlation && (
        <Tooltip title="Has a cytology–histology correlation">
          <Tag color="blue" icon={<LinkOutlined />} style={{ fontSize: 11, margin: 0 }}>
            Correlated
          </Tag>
        </Tooltip>
      )}
      {opts.consultBadge && renderConsultBadge(record)}
    </div>
  );
};

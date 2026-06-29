import React from "react";
import { Tag } from "antd";
import { CASE_TYPE_COLOR } from "../../components/AccessionTag";
import { STATUS_OPTIONS } from "../../constants/lab.constants";

export const SURGICAL_STATUS_MAP: Record<string, { color: string; label: string }> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, { color: o.color, label: o.label }]),
);

export const CYTO_STATUS: Record<string, { color: string; label: string }> = {
  registered: { color: "default", label: "Registered" },
  screening: { color: "geekblue", label: "Screening" },
  screened: { color: "geekblue", label: "Screened" },
  stained: { color: "purple", label: "Stained" },
  reported: { color: "green", label: "Reported" },
  revised: { color: "volcano", label: "Revised" },
  pending_approval: { color: "gold", label: "Pending Approval" },
  published: { color: "success", label: "Final Report" },
  cancelled: { color: "error", label: "Cancelled" },
};

export const STAIN_STATUS_COLOR: Record<string, string> = {
  pending: "default",
  stained: "blue",
  completed: "green",
  cancelled: "red",
};

export const TYPE_TAG: Record<string, { color: string; label: string }> = {
  surgical: { color: CASE_TYPE_COLOR.surgical, label: "Surgical" },
  gyne: { color: CASE_TYPE_COLOR.gyne, label: "Gyne" },
  nongyne: { color: CASE_TYPE_COLOR.nongyne, label: "Non-Gyne" },
};

export const statusTag = (
  status: string,
  map: Record<string, { color: string; label: string }>,
): React.ReactElement => {
  const cfg = map[status] ?? { color: "warning", label: status };
  return React.createElement(Tag, { color: cfg.color }, cfg.label);
};

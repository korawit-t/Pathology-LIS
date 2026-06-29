import React from "react";
import { Typography } from "antd";
import { WarningOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface CompactStatRowProps {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
  tatOverdue?: number;
  tatWarning?: number;
  hideZero?: boolean;
}

export const CompactStatRow: React.FC<CompactStatRowProps> = ({
  label, value, color, onClick,
  tatOverdue = 0, tatWarning = 0,
  hideZero = false,
}) => {
  if (hideZero && value === 0) return null;

  const hasOverdue = tatOverdue > 0;
  const hasWarning = tatWarning > 0 && !hasOverdue;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 6px",
        borderRadius: 6,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
      className="compact-stat-row"
    >
      <Text
        strong
        style={{
          fontSize: 20,
          color: value === 0 ? "#d9d9d9" : color,
          minWidth: 34,
          textAlign: "right",
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Text>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
        <Text style={{ fontSize: 13, color: value === 0 ? "#bfbfbf" : "#434343" }}>
          {label}
        </Text>
        {hasOverdue && (
          <span style={{
            background: "#ff4d4f", color: "#fff",
            borderRadius: 10, padding: "1px 7px",
            fontSize: 11, fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 3,
            whiteSpace: "nowrap",
          }}>
            <WarningOutlined style={{ fontSize: 10 }} /> {tatOverdue} overdue
          </span>
        )}
        {hasWarning && (
          <span style={{
            background: "#faad14", color: "#fff",
            borderRadius: 10, padding: "1px 7px",
            fontSize: 11, fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 3,
            whiteSpace: "nowrap",
          }}>
            <WarningOutlined style={{ fontSize: 10 }} /> {tatWarning} due soon
          </span>
        )}
      </div>
    </div>
  );
};

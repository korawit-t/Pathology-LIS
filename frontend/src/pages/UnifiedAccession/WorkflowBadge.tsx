import React from "react";
import { Tag, Tooltip } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";

interface WorkflowBadgeProps {
  label: string;
  isDone: boolean;
  color: string;
  tooltip: string;
}

const WorkflowBadge: React.FC<WorkflowBadgeProps> = ({ label, isDone, color, tooltip }) => (
  <Tooltip title={tooltip}>
    <div style={{ position: "relative", display: "inline-block" }}>
      <Tag
        color={isDone ? color : "default"}
        style={{
          margin: 0,
          width: 38,
          textAlign: "center",
          fontWeight: isDone ? 600 : "normal",
          fontSize: 11,
          borderRadius: 4,
          border: isDone ? `1px solid ${color}` : "1px solid #d9d9d9",
        }}
      >
        {label}
      </Tag>
      {isDone && (
        <CheckCircleFilled
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            fontSize: 11,
            color: "#52c41a",
            backgroundColor: "#fff",
            borderRadius: "50%",
            boxShadow: "0 0 2px rgba(0,0,0,0.3)",
            zIndex: 1,
          }}
        />
      )}
    </div>
  </Tooltip>
);

export default WorkflowBadge;

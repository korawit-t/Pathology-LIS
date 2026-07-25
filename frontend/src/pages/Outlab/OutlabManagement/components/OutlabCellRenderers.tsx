import React from "react";
import { Tag, Typography } from "antd";

const { Text } = Typography;

export const AccessionNoText: React.FC<{ text?: string | null }> = ({ text }) => (
  <Text strong style={{ color: "#1890ff" }}>{text}</Text>
);

export const BlockTag: React.FC<{ text?: string | null }> = ({ text }) => (
  <Tag color="cyan">{text || "-"}</Tag>
);

export const StainTag: React.FC<{ text?: string | null; fallback?: string }> = ({
  text,
  fallback = "Unknown",
}) => (
  <Tag color="purple">{text || fallback}</Tag>
);

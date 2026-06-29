import React from "react";
import { Typography } from "antd";

const { Title } = Typography;

interface SectionHeaderProps {
  title: string;
  color: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, color }) => (
  <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ width: 4, height: 24, background: color, borderRadius: 2 }} />
    <Title level={4} style={{ margin: 0, fontWeight: 700, letterSpacing: "-0.5px" }}>
      {title}
    </Title>
  </div>
);

export default SectionHeader;

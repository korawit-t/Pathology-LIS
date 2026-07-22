import React from "react";
import { Col, Spin, Typography, Card } from "antd";
import { useImmunoStats } from "./hooks/useImmunoStats";
import { CompactStatRow } from "../shared/CompactStatRow";
import SectionHeader from "../shared/SectionHeader";

const { Text } = Typography;

interface ImmunoSectionProps {
  tatOverdue?: Record<string, number>;
  tatWarning?: Record<string, number>;
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const SubLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginTop: 8, marginBottom: 2, paddingLeft: 6 }}>
    {children}
  </Text>
);

const ImmunoSection: React.FC<ImmunoSectionProps> = ({ tatOverdue = {}, tatWarning = {}, onNavigate, hideZero }) => {
  const { stats, loading } = useImmunoStats();
  const nav = (view: string) => onNavigate?.(view);

  return (
    <Col xs={24} md={12} xl={8} style={{ marginBottom: 16 }}>
      <Card size="small" style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }} styles={{ body: { padding: "12px 16px" } }}>
        <SectionHeader title="Special Stain & IHC" color="#2f54eb" />
        <Spin spinning={loading}>
          {(!hideZero || stats.pendingIHCInternal > 0 || stats.pendingSpecialStainInternal > 0) && (
            <SubLabel>Internal</SubLabel>
          )}
          <CompactStatRow label="IHC" value={stats.pendingIHCInternal} color="#2f54eb" onClick={() => nav("staining-manager")} tatOverdue={tatOverdue["pending immuno"] || 0} tatWarning={tatWarning["pending immuno"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Special Stain" value={stats.pendingSpecialStainInternal} color="#2f54eb" onClick={() => nav("staining-manager")} tatOverdue={tatOverdue["pending special stains"] || 0} tatWarning={tatWarning["pending special stains"] || 0} hideZero={hideZero} />
          {(!hideZero || stats.pendingIHCOutlab > 0 || stats.pendingSpecialStainOutlab > 0 || stats.pendingMolecularOutlab > 0) && (
            <SubLabel>Outlab</SubLabel>
          )}
          <CompactStatRow label="IHC" value={stats.pendingIHCOutlab} color="#2f54eb" onClick={() => nav("outlab")} hideZero={hideZero} />
          <CompactStatRow label="Special Stain" value={stats.pendingSpecialStainOutlab} color="#2f54eb" onClick={() => nav("outlab")} hideZero={hideZero} />
          <CompactStatRow label="Molecular" value={stats.pendingMolecularOutlab} color="#2f54eb" onClick={() => nav("molecular-cases")} hideZero={hideZero} />
        </Spin>
      </Card>
    </Col>
  );
};

export default ImmunoSection;

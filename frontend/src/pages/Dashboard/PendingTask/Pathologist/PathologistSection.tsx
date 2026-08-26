import React from "react";
import { Col, Spin, Card } from "antd";
import { usePathologistStats } from "./hooks/usePathologistStats";
import { CompactStatRow } from "../shared/CompactStatRow";
import SectionHeader from "../shared/SectionHeader";

interface PathologistSectionProps {
  userId?: number;
  tatOverdue?: Record<string, number>;
  tatWarning?: Record<string, number>;
  onNavigate?: (view: string) => void;
  hideZero?: boolean;
}

const PathologistSection: React.FC<PathologistSectionProps> = ({ userId, tatOverdue = {}, tatWarning = {}, onNavigate, hideZero }) => {
  const { stats, loading } = usePathologistStats(userId);
  const nav = (view: string) => onNavigate?.(view);

  return (
    <Col xs={24} md={12} xl={8} style={{ marginBottom: 16 }}>
      <Card size="small" style={{ borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", height: "100%" }} styles={{ body: { padding: "12px 16px" } }}>
        {/* Was "Surgical Worklist" — renamed when the Molecular rows landed,
            since the card is no longer surgical-only. */}
        <SectionHeader title="Pathologist Worklist" color="#eb2f96" />
        <Spin spinning={loading}>
          <CompactStatRow label="Awaiting Gross Examination" value={stats.pendingGross} color="#eb2f96" onClick={() => nav("grossing")} hideZero={hideZero} />
          <CompactStatRow label="Awaiting Diagnosis" value={stats.pendingDiagnosis} color="#eb2f96" onClick={() => nav("pathologist-page")} tatOverdue={tatOverdue["slide sent"] || 0} tatWarning={tatWarning["slide sent"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Awaiting Special Stains" value={stats.pendingSpecialStains} color="#eb2f96" onClick={() => nav("staining-manager")} tatOverdue={tatOverdue["pending special stains"] || 0} tatWarning={tatWarning["pending special stains"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Awaiting Immunohistochemistry" value={stats.pendingImmuno} color="#eb2f96" onClick={() => nav("staining-manager")} tatOverdue={tatOverdue["pending immuno"] || 0} tatWarning={tatWarning["pending immuno"] || 0} hideZero={hideZero} />
          <CompactStatRow label="Awaiting Peer Review" value={stats.pendingPeerReview} color="#eb2f96" onClick={() => nav("pathologist-page")} hideZero={hideZero} />
          <CompactStatRow label="Pending Addendum" value={stats.pendingAddendum} color="#eb2f96" onClick={() => nav("pathologist-page")} hideZero={hideZero} />
          {/* Molecular runs its own status track (pending -> reported) and is not
              covered by the case TAT counters, so it carries no overdue badge —
              the count itself is the signal. Split in-house vs external because
              the two need different chasing: one is our bench, the other is
              somebody else's turnaround. */}
          <CompactStatRow label="Molecular: Awaiting Result" value={stats.molecularPendingInHouse} color="#eb2f96" onClick={() => nav("molecular-cases")} hideZero={hideZero} />
          <CompactStatRow label="Molecular: Awaiting External Laboratory" value={stats.molecularPendingExternal} color="#eb2f96" onClick={() => nav("molecular-cases")} hideZero={hideZero} />
        </Spin>
      </Card>
    </Col>
  );
};

export default PathologistSection;

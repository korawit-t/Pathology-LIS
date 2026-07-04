import React from "react";
import { Tag } from "antd";

export interface ConsultBadgeRow {
  is_out_lab_consult?: boolean;
  consult_status?: string | null;
  consult_pdf_path?: string | null;
}

/**
 * Out-lab consult worklist badge shared by Surgical and NonGyne. Only worth
 * flagging while still active — "received" means the round already
 * finished, so callers' own SIGNED/status tag already covers that case.
 */
export function renderConsultBadge(row: ConsultBadgeRow): React.ReactNode {
  if (!row.is_out_lab_consult || row.consult_status === "received") return null;

  if (row.consult_status === "processing") {
    return row.consult_pdf_path ? (
      <Tag color="purple">CONSULT: READY TO SIGN</Tag>
    ) : (
      <Tag color="gold">CONSULT: SENT</Tag>
    );
  }

  return <Tag color="default">CONSULT: PENDING DISPATCH</Tag>;
}

import React from "react";
import { Tag, Tooltip } from "antd";
import { consultRound } from "../../services/outlabConsultService";

/** The out-lab consult round ("C2") as a small tag, with the full consult
 * number on hover. Renders nothing for a case without a round. Sits beside
 * the accession or the consult status — never inside the accession, which is
 * the case's own number. */
const ConsultRoundTag: React.FC<{ consultNo?: string | null }> = ({ consultNo }) => {
  const round = consultRound(consultNo);
  if (!round) return null;
  return (
    <Tooltip title={consultNo}>
      <Tag color="purple" style={{ marginInlineEnd: 0 }}>
        {round}
      </Tag>
    </Tooltip>
  );
};

export default ConsultRoundTag;

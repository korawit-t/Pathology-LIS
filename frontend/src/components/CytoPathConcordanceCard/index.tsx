import React, { useCallback, useEffect, useState } from "react";
import { Card, Col, Empty, Row, Space, Tag, Tooltip, Typography } from "antd";
import { CheckCircleOutlined, TeamOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import CytoPathCorrelationService, {
  type CytoPathCorrelation,
  type CytoPathResult,
} from "../../services/cytoPathCorrelationService";
import { sanitizeHtml } from "../../utils/sanitize";
import logger from "../../utils/logger";

const { Text } = Typography;

const RESULT_LABEL: Record<CytoPathResult, { label: string; color: string }> = {
  concordant: { label: "ตรงกัน", color: "green" },
  minor_discrepancy: { label: "ต่างเล็กน้อย", color: "orange" },
  major_discrepancy: { label: "ต่างอย่างมีนัยสำคัญ", color: "red" },
  not_applicable: { label: "เทียบไม่ได้", color: "default" },
};

interface Props {
  caseId: number;
  caseType: "gyne" | "nongyne";
  /** Bump to refetch — e.g. after the case is signed out on this screen. */
  refreshKey?: number;
}

/**
 * Read-only view of this case's cytotech-vs-final comparison.
 *
 * Grading happens in the QC report, not here: the pathologist reading this
 * screen is usually the one whose diagnosis is on the right-hand side, and a
 * verdict on one's own case is not a QC control.
 */
const CytoPathConcordanceCard: React.FC<Props> = ({ caseId, caseType, refreshKey }) => {
  const [row, setRow] = useState<CytoPathCorrelation | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!caseId) return;
    setLoading(true);
    CytoPathCorrelationService.getByCase(caseType, caseId)
      .then(setRow)
      .catch((err) => logger.error("โหลดผลเทียบ cyto-path ไม่สำเร็จ", err))
      .finally(() => setLoading(false));
  }, [caseId, caseType]);

  useEffect(() => load(), [load, refreshKey]);

  // Nothing to show until a screening side exists — most of a case's life.
  if (!loading && (!row || !row.screening_diagnosis)) return null;

  const verdict = row?.result ? RESULT_LABEL[row.result] : null;

  return (
    <Card
      size="small"
      loading={loading}
      style={{ marginTop: 16 }}
      title={
        <Space>
          <TeamOutlined />
          <span>เทียบผล Cytotech กับผล Final</span>
        </Space>
      }
      extra={
        verdict ? (
          <Tag
            color={verdict.color}
            icon={row?.result === "concordant" ? <CheckCircleOutlined /> : undefined}
          >
            {verdict.label}
          </Tag>
        ) : (
          <Tooltip title="ตัดสินได้ที่ Report Analytics → Quality & Registry → Cyto–Path Concordance">
            <Tag>รอตัดสิน</Tag>
          </Tooltip>
        )
      }
    >
      {row ? (
        <>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Cytotechnologist
                {row.cytotechnologist ? ` · ${row.cytotechnologist.full_name}` : ""}
                {row.screened_at ? ` · ${dayjs(row.screened_at).format("DD/MM/YYYY")}` : ""}
              </Text>
              <div
                style={{ marginTop: 4 }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.screening_diagnosis) }}
              />
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Final
                {row.pathologist ? ` · ${row.pathologist.full_name}` : ""}
                {row.signed_out_at
                  ? ` · ${dayjs(row.signed_out_at).format("DD/MM/YYYY")}`
                  : ""}
              </Text>
              {row.final_diagnosis ? (
                <div
                  style={{ marginTop: 4 }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.final_diagnosis) }}
                />
              ) : (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">ยังไม่ได้เซ็นออก</Text>
                </div>
              )}
            </Col>
          </Row>
          {row.comment && (
            <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
              หมายเหตุ QC: {row.comment}
            </Text>
          )}
        </>
      ) : (
        <Empty description="ไม่มีข้อมูล" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Card>
  );
};

export default CytoPathConcordanceCard;

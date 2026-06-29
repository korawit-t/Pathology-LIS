import React, { useState, useEffect } from "react";
import { Modal, Row, Col, Radio, Space, Tag, Spin } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import GyneDiagnosisService from "../../../services/gyneDiagnosisService";
import CriticalNotificationSection from "../../../components/CriticalNotificationSection";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";
import logger from "../../../utils/logger";

interface GyneSlideQualityModalProps {
  open: boolean;
  caseId: number | string | undefined;
  caseData: GyneCytologyCase | null;
  finalizing: boolean;
  onClose: () => void;
  onFinalize: (
    slideQuality: string | null,
    stainQuality: string | null,
  ) => Promise<void>;
}

const GyneSlideQualityModal: React.FC<GyneSlideQualityModalProps> = ({
  open,
  caseId,
  caseData,
  finalizing,
  onClose,
  onFinalize,
}) => {
  const [slideQuality, setSlideQuality] = useState<string | null>(null);
  const [stainQuality, setStainQuality] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    let activeUrl: string | null = null;
    if (open && caseId) {
      setSlideQuality(null);
      setStainQuality(null);
      setPdfLoading(true);
      GyneDiagnosisService.previewReportPdf(Number(caseId))
        .then((blob) => {
          activeUrl = URL.createObjectURL(blob);
          setPdfUrl(activeUrl);
        })
        .catch((err) => logger.error("slideQuality pdf preview", err))
        .finally(() => setPdfLoading(false));
    } else {
      setPdfUrl(null);
    }
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [open, caseId]);

  return (
    <Modal
      open={open}
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: "#faad14" }} />
          <span>Slide Quality Assessment</span>
        </Space>
      }
      okText="Confirm & Finalize"
      cancelText="Cancel"
      okButtonProps={{
        disabled: !slideQuality || !stainQuality,
        loading: finalizing,
        style: { background: "#cf1322", border: "none" },
      }}
      onCancel={onClose}
      onOk={async () => {
        onClose();
        await onFinalize(slideQuality, stainQuality);
      }}
      width={1200}
      centered
      style={{ top: 20 }}
    >
      <Row gutter={24}>
        {/* Left: quality form */}
        <Col span={10} style={{ borderRight: "1px solid #f0f0f0" }}>
          <p style={{ margin: "0 0 16px 0", color: "#595959" }}>
            Results cannot be edited after sign-off. Please verify the accuracy
            of the report before confirming.
          </p>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              1. Slide Quality{" "}
              <span style={{ color: "#ff4d4f" }}>*</span>
            </div>
            <Radio.Group
              value={slideQuality}
              onChange={(e) => setSlideQuality(e.target.value)}
              style={{ width: "100%" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Radio value="good">
                  <Tag color="success">Good</Tag>
                  <span style={{ color: "#595959" }}>
                    Good quality, ready to read
                  </span>
                </Radio>
                <Radio value="fair">
                  <Tag color="warning">Fair</Tag>
                  <span style={{ color: "#595959" }}>
                    Moderate quality, readable with limitations
                  </span>
                </Radio>
                <Radio value="poor">
                  <Tag color="error">Poor</Tag>
                  <span style={{ color: "#595959" }}>
                    Poor quality, difficult to read
                  </span>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              2. Stain Quality{" "}
              <span style={{ color: "#ff4d4f" }}>*</span>
            </div>
            <Radio.Group
              value={stainQuality}
              onChange={(e) => setStainQuality(e.target.value)}
              style={{ width: "100%" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Radio value="good">
                  <Tag color="success">Good</Tag>
                  <span style={{ color: "#595959" }}>
                    Uniform and clear staining
                  </span>
                </Radio>
                <Radio value="fair">
                  <Tag color="warning">Fair</Tag>
                  <span style={{ color: "#595959" }}>
                    Acceptable staining with minor defects
                  </span>
                </Radio>
                <Radio value="poor">
                  <Tag color="error">Poor</Tag>
                  <span style={{ color: "#595959" }}>
                    Non-uniform staining, affecting diagnosis
                  </span>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          {(!slideQuality || !stainQuality) && (
            <div style={{ marginTop: 12, color: "#ff4d4f", fontSize: 12 }}>
              Please complete both assessments before proceeding.
            </div>
          )}

          {caseId && (
            <CriticalNotificationSection
              caseId={Number(caseId)}
              caseType="GYNE_CYTO"
              accessionNo={caseData?.accession_no}
            />
          )}
        </Col>

        {/* Right: PDF preview */}
        <Col span={14}>
          <div
            style={{
              height: "70vh",
              background: "#f5f5f5",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 8,
              border: "1px solid #d9d9d9",
              overflow: "hidden",
            }}
          >
            {pdfLoading ? (
              <Spin tip="Generating Preview..." size="large" />
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="PDF Preview"
              />
            ) : (
              <div style={{ textAlign: "center", color: "#999" }}>
                <span
                  style={{ fontSize: 48, display: "block", marginBottom: 8 }}
                >
                  📄
                </span>
                <p>No Preview Available</p>
              </div>
            )}
          </div>
        </Col>
      </Row>
    </Modal>
  );
};

export default GyneSlideQualityModal;

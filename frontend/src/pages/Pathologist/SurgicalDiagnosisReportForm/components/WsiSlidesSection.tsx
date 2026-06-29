import { useEffect, useState } from "react";
import { Button, Space, Tag, Tooltip, Typography } from "antd";
import { EyeOutlined, RightOutlined, ScanOutlined } from "@ant-design/icons";
import WsiSettingService from "../../../../services/wsiSettingService";
import StyledCard from "../../../../components/Layout/StyledCard";
import type { WsiFile } from "../../../../types/system";

const { Text } = Typography;

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Props {
  caseId: number;
}

export default function WsiSlidesSection({ caseId }: Props) {
  const [slides, setSlides] = useState<WsiFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    WsiSettingService.getCaseSlides(caseId).then(setSlides).catch(() => {});
  }, [caseId]);

  if (slides.length === 0) return null;

  return (
    <StyledCard size="small" styles={{ body: { padding: "12px 16px" } }}>
      {/* Header row — same pattern as PatientInfoCard */}
      <div
        onClick={() => setIsOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none" }}
      >
        <RightOutlined
          rotate={isOpen ? 90 : 0}
          style={{ fontSize: 12, marginRight: 12, color: "#bfbfbf", transition: "transform 0.3s" }}
        />
        <Space size={8}>
          <ScanOutlined style={{ color: "#1677ff" }} />
          <Text strong style={{ color: "#1677ff", fontSize: 15 }}>WSI Slides</Text>
          <Tag color="blue" style={{ marginLeft: 4 }}>{slides.length}</Tag>
        </Space>
      </div>

      {/* Slide grid — shown when expanded */}
      {isOpen && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          {slides.map((slide) => (
            <div
              key={slide.id}
              style={{
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                overflow: "hidden",
                background: "#fafafa",
              }}
            >
              <img
                src={`${API_BASE}/wsi/thumbnail?path=${encodeURIComponent(slide.file_path)}&size=256`}
                alt={slide.filename}
                style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div style={{ padding: "8px 10px" }}>
                <Tooltip title={slide.filename}>
                  <Text ellipsis style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    {slide.filename}
                  </Text>
                </Tooltip>
                <Space size={4} wrap>
                  {slide.parsed_block && (
                    <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{slide.parsed_block}</Tag>
                  )}
                  {slide.format && (
                    <Tag style={{ fontSize: 11, margin: 0 }}>{slide.format}</Tag>
                  )}
                </Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<EyeOutlined />}
                  block
                  style={{ marginTop: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`/wsi-viewer?path=${encodeURIComponent(slide.file_path)}`, "_blank");
                  }}
                >
                  Open
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </StyledCard>
  );
}

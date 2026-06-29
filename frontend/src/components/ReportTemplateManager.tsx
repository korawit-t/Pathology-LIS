import React, { useEffect, useState } from "react";
import {
  Card, Col, Row, Tag, Button, Typography, Space, Spin, Divider, message, Tooltip, ColorPicker,
} from "antd";
import { BgColorsOutlined, CheckCircleFilled, EyeOutlined, FileTextOutlined, ReloadOutlined } from "@ant-design/icons";
import type { Color } from "antd/es/color-picker";
import SystemSettingService from "../services/systemSettingService";
import { API_BASE_URL } from "../services/httpClient";
import logger from "../utils/logger";

const { Text, Title } = Typography;

const DEFAULT_PRIMARY = "#0056b3";

interface TemplateGroup {
  available: string[];
  active: string;
}

const REPORT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  surgical: { label: "Surgical Pathology", color: "#1677ff" },
  gyne:     { label: "Gyne Cytology",      color: "#eb2f96" },
  nongyne:  { label: "Non-Gyne Cytology",  color: "#722ed1" },
};

function friendlyName(filename: string): string {
  return filename
    .replace(/\.html$/, "")
    .replace(/^(surgical|gyne_cyto|nongyne_cyto)_report_template/, "")
    .trim()
    .replace(/^[-_ ]+/, "")
    || "Default";
}

function previewUrl(reportType: string, filename: string): string {
  return `${API_BASE_URL}/system-settings/report-templates/preview?report_type=${encodeURIComponent(reportType)}&template_name=${encodeURIComponent(filename)}`;
}

const ReportTemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<Record<string, TemplateGroup>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_PRIMARY);
  const [savingColor, setSavingColor] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const [tmpl, settings] = await Promise.all([
        SystemSettingService.getReportTemplates(),
        SystemSettingService.getSettings(),
      ]);
      setTemplates(tmpl);
      setPrimaryColor(settings.report_primary_color || DEFAULT_PRIMARY);
    } catch (err) {
      logger.error(err);
      message.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleActivate = async (reportType: string, filename: string) => {
    setSaving(`${reportType}::${filename}`);
    try {
      await SystemSettingService.setReportTemplate(reportType, filename);
      message.success("Template updated — next generated report will use this layout.");
      setTemplates((prev) => ({
        ...prev,
        [reportType]: { ...prev[reportType], active: filename },
      }));
    } catch {
      message.error("Failed to set template");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveColor = async (hex: string) => {
    setSavingColor(true);
    try {
      await SystemSettingService.updateSettings({ report_primary_color: hex });
      setPrimaryColor(hex);
      message.success("Color saved — next generated report will use this color.");
    } catch {
      message.error("Failed to save color");
    } finally {
      setSavingColor(false);
    }
  };

  if (loading) return <Spin style={{ display: "block", padding: 40 }} />;

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button icon={<ReloadOutlined />} onClick={fetchTemplates}>Refresh</Button>
      </div>

      {/* ── Color Scheme ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 12 }}>
          <Tag color="default" icon={<BgColorsOutlined />} style={{ fontSize: 13, padding: "3px 12px" }}>
            Color Scheme
          </Tag>
        </div>
        <Card size="small" style={{ borderRadius: 10, maxWidth: 420 }}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Primary accent color used for borders, headers, and highlights in all PDF reports.
            </Text>
            <Space align="center" size={12}>
              <ColorPicker
                format="hex"
                showText
                value={primaryColor}
                onChange={(color: Color) => setPrimaryColor(color.toHexString())}
                onChangeComplete={(color: Color) => handleSaveColor(color.toHexString())}
              />
              {savingColor && <Text type="secondary" style={{ fontSize: 12 }}>Saving…</Text>}
              {primaryColor !== DEFAULT_PRIMARY && (
                <Button
                  size="small"
                  onClick={() => handleSaveColor(DEFAULT_PRIMARY)}
                >
                  Reset to default
                </Button>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Default: {DEFAULT_PRIMARY}
            </Text>
          </Space>
        </Card>
      </div>

      <Divider />

      {/* ── Template Selection ── */}
      {(["surgical", "gyne", "nongyne"] as const).map((rt) => {
        const group = templates[rt];
        if (!group) return null;
        const { label, color } = REPORT_TYPE_LABELS[rt];

        return (
          <div key={rt} style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 12 }}>
              <Tag color={color} style={{ fontSize: 13, padding: "3px 12px" }}>{label}</Tag>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                {group.available.length} template{group.available.length !== 1 ? "s" : ""} available
              </Text>
            </div>

            <Row gutter={[12, 12]}>
              {group.available.map((filename) => {
                const isActive = filename === group.active;
                const isSaving = saving === `${rt}::${filename}`;
                const name = friendlyName(filename);

                return (
                  <Col xs={24} sm={12} md={8} lg={6} key={filename}>
                    <Card
                      size="small"
                      style={{
                        borderRadius: 10,
                        border: isActive ? `2px solid ${color}` : "1px solid #f0f0f0",
                        background: isActive ? "#f0f7ff" : "#fff",
                        cursor: "default",
                      }}
                    >
                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        <Space>
                          <FileTextOutlined style={{ color, fontSize: 20 }} />
                          <Text strong style={{ fontSize: 13 }}>
                            {name || "Default"}
                          </Text>
                          {isActive && (
                            <Tooltip title="Currently active">
                              <CheckCircleFilled style={{ color: "#52c41a" }} />
                            </Tooltip>
                          )}
                        </Space>

                        <Text type="secondary" style={{ fontSize: 11, wordBreak: "break-all" }}>
                          {filename}
                        </Text>

                        <Space size={6}>
                          <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => window.open(previewUrl(rt, filename), "_blank")}
                          >
                            Preview
                          </Button>
                          {isActive ? (
                            <Tag color="success" style={{ margin: 0 }}>Active</Tag>
                          ) : (
                            <Button
                              size="small"
                              type="primary"
                              ghost
                              loading={isSaving}
                              onClick={() => handleActivate(rt, filename)}
                              style={{ borderColor: color, color }}
                            >
                              Set Active
                            </Button>
                          )}
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            <Divider style={{ margin: "16px 0 0" }} />
          </div>
        );
      })}
    </div>
  );
};

export default ReportTemplateManager;

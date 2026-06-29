import React from "react";
import {
  Button,
  Typography,
  Space,
  Popconfirm,
  Anchor,
  Badge,
  Tooltip,
  Checkbox,
} from "antd";
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FileTextOutlined,
  SendOutlined,
  HistoryOutlined,
  LayoutOutlined,
  SplitCellsOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useTheme } from "../../../../contexts/ThemeContext";

const { Title } = Typography;

interface SurgicalReportToolbarProps {
  accessionNo?: string;
  onBack: () => void;
  onSave: () => void;
  onPreview: () => void;
  onSignOff: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;

  loading: boolean;
  generatingPdf: boolean;
  isLocked: boolean;
  showTopAnchor: boolean;
  isSplitMode: boolean;
  onToggleSplitMode: () => void;

  allDiagnosesCount: number;
  isDirty?: boolean;
  lastSavedAt?: Date | null;
  onDiscard?: () => void;
  hasReport?: boolean;
}

const SurgicalReportToolbar: React.FC<SurgicalReportToolbarProps> = ({
  accessionNo,
  onBack,
  onSave,
  onPreview,
  onSignOff,
  onOpenSettings,
  onOpenHistory,
  allDiagnosesCount,
  loading,
  generatingPdf,
  isLocked,
  showTopAnchor,
  isSplitMode,
  onToggleSplitMode,
  isDirty,
  lastSavedAt,
  onDiscard,
  hasReport,
}) => {
  const { isDarkMode } = useTheme();

  const buttonStyles = {
    save: {
      background: isDarkMode
        ? "linear-gradient(135deg, #237804 0%, #389e0d 100%)" // เขียวเข้มหรู
        : "#52c41a",
      boxShadow: isDarkMode ? "0 0 12px rgba(82, 196, 26, 0.2)" : "none",
      border: "none",
    },
    signOff: {
      background: isDarkMode
        ? "linear-gradient(135deg, #820014 0%, #a8071a 100%)" // แดงก่ำมีมิติ
        : "#cf1322",
      boxShadow: isDarkMode ? "0 0 15px rgba(207, 19, 34, 0.3)" : "none",
      border: "none",
      fontWeight: 600,
    },
  };
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        // 🚩 พื้นหลัง Toolbar แบบโปร่งแสงและเบลอ (Glassmorphism)
        background: isDarkMode
          ? "rgba(20, 20, 20, 0.85)"
          : "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: isDarkMode ? "1px solid #303030" : "1px solid #f0f0f0",
        boxShadow: isDarkMode
          ? "0 4px 15px rgba(0,0,0,0.4)"
          : "0 2px 8px rgba(0,0,0,0.06)",
        padding: "12px 0",
        transition: "all 0.3s ease",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          width: "95%",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {/* --- ส่วนฝั่งซ้าย --- */}
        <Space size="large">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            type="text"
            style={{ color: isDarkMode ? "rgba(255,255,255,0.65)" : undefined }}
          />
          <Title
            level={4}
            style={{ margin: 0, color: isDarkMode ? "#fff" : undefined }}
          >
            Case: <span style={{ color: "#40a9ff" }}>{accessionNo}</span>
          </Title>

          {showTopAnchor && (
            <Anchor
              direction="horizontal"
              targetOffset={100}
              bounds={150}
              style={{ marginLeft: 24, background: "transparent" }}
              items={[
                { key: "1", href: "#patient-info", title: "Patient" },
                { key: "2", href: "#clinical-info", title: "Clinical" },
                { key: "3", href: "#diagnostic-station", title: "Diagnosis" },
              ]}
            />
          )}
        </Space>

        {/* --- Save status indicator --- */}
        {!isLocked && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {isDirty ? (
              <span style={{ color: "#faad14" }}>
                <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                Unsaved changes
              </span>
            ) : lastSavedAt ? (
              <span style={{ color: "#52c41a" }}>
                <CheckCircleOutlined style={{ marginRight: 4 }} />
                Saved {dayjs(lastSavedAt).format("HH:mm:ss")}
              </span>
            ) : null}
          </span>
        )}

        {/* --- ส่วนฝั่งขวา (Buttons) --- */}
        <Space>
          {/* 🚩 ปุ่ม Setting Modal */}
          <Tooltip title="Report Settings">
            <Button
              icon={<SettingOutlined />}
              onClick={onOpenSettings}
              type="text"
              style={{
                color: isDarkMode ? "rgba(255,255,255,0.45)" : "#8c8c8c",
                fontSize: "18px",
              }}
            />
          </Tooltip>

          <Tooltip title="Entry History">
            <Badge count={allDiagnosesCount} size="small" offset={[-2, 2]}>
              <Button
                icon={<HistoryOutlined />}
                onClick={onOpenHistory}
                style={{
                  color: isDarkMode ? "rgba(255,255,255,0.65)" : undefined,
                }}
              >
                History
              </Button>
            </Badge>
          </Tooltip>

          <Button
            icon={isSplitMode ? <LayoutOutlined /> : <SplitCellsOutlined />}
            onClick={onToggleSplitMode}
            title={
              isSplitMode ? "Switch to Single Column" : "Switch to 2 Columns"
            }
          >
            {isSplitMode ? "Single" : "Split"}{" "}
          </Button>

          {isDirty && !isLocked && onDiscard && (
            <Tooltip title="Discard all unsaved changes and reload from server">
              <Button
                icon={<RollbackOutlined />}
                onClick={onDiscard}
                style={{ color: "#ff4d4f", borderColor: "#ff4d4f" }}
              >
                Discard
              </Button>
            </Tooltip>
          )}

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={onSave}
            loading={loading}
            disabled={isLocked}
            style={!isLocked ? buttonStyles.save : {}}
          >
            Save Draft
          </Button>

          {hasReport && (
            <Button
              icon={<FileTextOutlined />}
              onClick={onPreview}
              loading={generatingPdf}
              style={{
                color: isDarkMode ? "#40a9ff" : "#1890ff",
                borderColor: isDarkMode ? "#40a9ff" : "#1890ff",
                background: "transparent",
              }}
            >
              Preview
            </Button>
          )}

          <Button
            type="primary"
            danger
            icon={<SendOutlined />}
            loading={loading}
            disabled={isLocked}
            style={!isLocked ? buttonStyles.signOff : {}}
            onClick={onSignOff}
          >
            Sign-off
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default SurgicalReportToolbar;

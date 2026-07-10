import React from "react";
import { Form, Input, Typography } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
// 🚩 Uses the shared StyledCard
import StyledCard from "./Layout/StyledCard";
import SimpleTiptapEditor from "./Editors/SimpleTiptapEditor";
import { useTheme } from "../contexts/ThemeContext";

const { Title } = Typography;
const { TextArea } = Input;

interface ClinicalInfoSectionProps {
  name?: string;
  label?: string;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
  required?: boolean;
}

const ClinicalInfoSection: React.FC<ClinicalInfoSectionProps> = ({
  name = "clinical_diagnosis",
  label = "Clinical Information",
  placeholder = "Enter the clinical diagnosis or a brief history...",
  readOnly = false,
  required = true,
}) => {
  const { isDarkMode } = useTheme();
  return (
    <StyledCard
      size="small"
      style={{
        height: "100%", // 🚩 Changed from auto to 100% so it fills the row
        display: "flex",
        flexDirection: "column",
      }}
      bodyStyle={{
        padding: "16px 20px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%", // 🚩 Let the body stretch fully
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: 16, // 🚩 Added margin-bottom for balance instead of 1
        }}
      >
        <Title
          level={5}
          style={{
            color: isDarkMode ? "rgba(255, 255, 255, 0.85)" : "#262626",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "1.2px",
            fontWeight: 600,
          }}
        >
          <FileSearchOutlined style={{ marginRight: 8, color: "#1890ff" }} />
          {label}
        </Title>
      </div>

      <Form.Item
        name={name}
        className="stretch-form-item"
        style={{
          marginBottom: 0,
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
        }}
        // 🚩 Important: Tiptap emits its value as an HTML string
        rules={
          required && !readOnly
            ? [{ required: true, message: `Please enter ${label}` }]
            : []
        }
      >
        {/* 🚩 Replaced TextArea with SimpleTiptapEditor */}
        <SimpleTiptapEditor
          placeholder={placeholder}
          style={{
            flex: 1,
            width: "100%",
            minHeight: "30px",
            // 🚩 4. Border and background color must be dynamic
            border: isDarkMode ? "1px solid #434343" : "1px solid #d9d9d9",
            borderRadius: "6px",
            background: isDarkMode
              ? readOnly
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.2)"
              : readOnly
                ? "#fafafa"
                : "#ffffff",
            // Set text color in the editor (in case Tiptap doesn't handle it)
            color: isDarkMode ? "#e6e6e6" : "#000000",
          }}
        />
      </Form.Item>

      {/* 🚩 Fixed CSS selector to cover every Ant Design layer */}
      <style>{`
        .stretch-form-item {
          display: flex;
          flex-direction: column;
          width: 100%; /* Force full width */
        }
        .stretch-form-item .ant-form-item-row {
          flex: 1;
          display: flex;
          flex-direction: column;
          width: 100%;
          align-items: stretch; /* 🚩 Force children to stretch horizontally */
        }
        .stretch-form-item .ant-form-item-control {
          flex: 1;
          display: flex;
          flex-direction: column;
          width: 100%;
        }
        .stretch-form-item .ant-form-item-control-input,
        .stretch-form-item .ant-form-item-control-input-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%; /* 🚩 Reinforce full width on the innermost layer */
        }
        /* Prevent Ant Design from adding margin or a fixed width */
        .stretch-form-item .ant-col {
          width: 100%;
          max-width: 100%;
          display: flex; /* 🚩 Add flex to squeeze the inner content */
          flex-direction: column;
          flex: 1; /* 🚩 Cover the full height of the row */
        }
          ${
            isDarkMode
              ? `
          .ProseMirror {
            color: #e6e6e6;
          }
          .ProseMirror p.is-editor-empty:first-child::before {
            color: rgba(255, 255, 255, 0.3);
          }
        `
              : ""
          }
      `}</style>
    </StyledCard>
  );
};

export default ClinicalInfoSection;

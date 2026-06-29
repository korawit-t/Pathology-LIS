import React from "react";
import { Form, Input, Typography } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
// 🚩 เรียกใช้ StyledCard ที่เราสร้างไว้เป็นกองกลาง
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
  placeholder = "ระบุการวินิจฉัยทางคลินิกหรือประวัติโดยสังเขป...",
  readOnly = false,
  required = true,
}) => {
  const { isDarkMode } = useTheme();
  return (
    <StyledCard
      size="small"
      style={{
        height: "100%", // 🚩 เปลี่ยนจาก auto เป็น 100% เพื่อให้ยืดเต็ม Row
        display: "flex",
        flexDirection: "column",
      }}
      bodyStyle={{
        padding: "16px 20px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%", // 🚩 ให้ body ยืดเต็ม
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: 16, // 🚩 เพิ่ม margin-bottom ให้สมดุลแทน 1
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
        // 🚩 สำคัญ: Tiptap ส่งค่าเป็น HTML String
        rules={
          required && !readOnly
            ? [{ required: true, message: `กรุณาระบุ ${label}` }]
            : []
        }
      >
        {/* 🚩 เปลี่ยน TextArea เป็น SimpleTiptapEditor */}
        <SimpleTiptapEditor
          placeholder={placeholder}
          style={{
            flex: 1,
            width: "100%",
            minHeight: "30px",
            // 🚩 4. ขอบและสีพื้นหลังต้องเป็น Dynamic
            border: isDarkMode ? "1px solid #434343" : "1px solid #d9d9d9",
            borderRadius: "6px",
            background: isDarkMode
              ? readOnly
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.2)"
              : readOnly
                ? "#fafafa"
                : "#ffffff",
            // เพิ่มสีตัวอักษรใน Editor (ถ้า Tiptap ไม่ได้จัดการให้)
            color: isDarkMode ? "#e6e6e6" : "#000000",
          }}
        />
      </Form.Item>

      {/* 🚩 แก้ไข CSS Selector ให้ครอบคลุมทุกเลเยอร์ของ Ant Design */}
      <style>{`
        .stretch-form-item {
          display: flex;
          flex-direction: column;
          width: 100%; /* บังคับกางกว้าง */
        }
        .stretch-form-item .ant-form-item-row {
          flex: 1;
          display: flex;
          flex-direction: column;
          width: 100%;
          align-items: stretch; /* 🚩 บังคับให้ลูกกางออกแนวขวาง */
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
          width: 100%; /* 🚩 ย้ำความกว้างชั้นในสุด */
        }
        /* ป้องกัน Ant Design ใส่ Margin หรือความกว้างคงที่ */
        .stretch-form-item .ant-col {
          width: 100%;
          max-width: 100%;
          display: flex; /* 🚩 เพิ่ม flex ไว้บีบไส้ใน */
          flex-direction: column;
          flex: 1; /* 🚩 ให้ครอบคลุมความสูงของ row */
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

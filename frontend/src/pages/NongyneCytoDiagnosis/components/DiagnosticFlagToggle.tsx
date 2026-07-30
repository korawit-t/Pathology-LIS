import React from "react";
import { Form, Space, Switch, Typography } from "antd";

const { Text } = Typography;

interface DiagnosticFlagToggleProps {
  icon: React.ReactNode;
  color: string;
  background: string;
  border: string;
  label: string;
  fieldName: string;
  disabled: boolean;
}

const DiagnosticFlagToggle: React.FC<DiagnosticFlagToggleProps> = ({
  icon,
  color,
  background,
  border,
  label,
  fieldName,
  disabled,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 12px",
      background,
      borderRadius: "8px",
      border: `1px solid ${border}`,
    }}
  >
    <Space>
      {icon}
      <Text strong style={{ color, fontSize: "13px" }}>
        {label}
      </Text>
    </Space>
    <Form.Item name={fieldName} valuePropName="checked" style={{ marginBottom: 0 }}>
      <Switch disabled={disabled} checkedChildren="Yes" unCheckedChildren="No" />
    </Form.Item>
  </div>
);

export default DiagnosticFlagToggle;

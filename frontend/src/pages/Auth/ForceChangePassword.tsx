import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  message,
  notification,
} from "antd";
import {
  LockOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";

// --- Custom Hooks & Services ---
import { useAuth } from "../../hooks/useAuth";
import AuthService from "../../services/authService";
import { handleApiError } from "../../utils/errorHandler";
import { ChangePasswordPayload } from "../../types/auth";

const { Title, Text } = Typography;

const ForceChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(false);
  const [form] = Form.useForm();

  const { logout, user } = useAuth();

  if (!user) {
    const lastSlug = localStorage.getItem("last_hospital_slug") || "master";
    const loginUrl = lastSlug === "master" ? "/login" : `/${lastSlug}`;
    return <Navigate to={loginUrl} replace />;
  }

  const needsPasswordChange = user.is_temporary_password || user.is_password_expired;
  if (!needsPasswordChange) {
    return <Navigate to="/dashboard" replace />;
  }

  const reason = user.is_password_expired
    ? "Your password has expired. Please set a new password to continue."
    : "A new password is required before you can continue.";

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // 🚩 ตรวจสอบว่ามี AuthService.changePassword จริงๆ หรือเปล่า
      // (ระวังเรื่องการส่งค่า payload.new_password)
      await AuthService.changePassword(values.current_password, values.new_password);

      message.success({
        content: "Password updated successfully! Redirecting to login...",
        duration: 2,
      });

      // 🚩 แก้ไขจุดนี้: ลบ logout() ที่ซ้ำซ้อนออก ให้เหลือแค่อันเดียวใน setTimeout
      setTimeout(() => {
        logout(); // ตัวนี้จะ clear localStorage และพาไปหน้า login เอง
      }, 1500);
    } catch (err) {
      handleApiError(err, form);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <Card style={styles.card} hoverable>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <SafetyCertificateOutlined
              style={{ fontSize: "48px", color: "#1890ff" }}
            />
          </div>
          <Title level={3} style={{ margin: 0, marginBottom: 8 }}>
            Security Update Required
          </Title>
          <Text type="secondary">{reason}</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          size="large"
        >
          <Form.Item
            name="current_password"
            label={<Text strong>Current Password</Text>}
            rules={[
              { required: true, message: "Please enter your current password!" },
            ]}
            hasFeedback
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
              placeholder="Enter current password"
            />
          </Form.Item>

          <Form.Item
            name="new_password"
            label={<Text strong>New Password</Text>}
            rules={[
              { required: true, message: "Please enter your new password!" },
              {
                // 🔒 SECURITY: must match the server-side min_length on
                // PasswordUpdate (backend/app/schemas/user.py). Bumping
                // one without the other will produce confusing errors.
                min: 8,
                message: "Password must be at least 8 characters long.",
              },
            ]}
            hasFeedback
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
              placeholder="Enter new password"
            />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label={<Text strong>Confirm New Password</Text>}
            dependencies={["new_password"]}
            hasFeedback
            rules={[
              { required: true, message: "Please confirm your new password!" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("new_password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error(
                      "The two passwords that you entered do not match!",
                    ),
                  );
                },
              }),
            ]}
          >
            <Input.Password
              prefix={
                <CheckCircleOutlined style={{ color: "rgba(0,0,0,0.25)" }} />
              }
              placeholder="Re-enter new password"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{
                height: "48px",
                borderRadius: "6px",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              Update Password & Sign In
            </Button>

            <Button
              type="link"
              block
              onClick={logout}
              style={{ marginTop: 12, color: "#8c8c8c" }}
            >
              Cancel and Back to Login
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

// --- Modern Layout Styles ---
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%", // เปลี่ยนจาก 100vw เป็น 100% เพื่อความชัวร์
    minHeight: "100vh",
    margin: 0,
    padding: 0,
    backgroundColor: "#f0f2f5",
    backgroundImage: "linear-gradient(180deg, #f0f2f5 0%, #e6f7ff 100%)",
    backgroundAttachment: "fixed", // 🚩 เพิ่มบรรทัดนี้เพื่อล็อค Gradient ให้เต็มจอเสมอ
  },
  card: {
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
    borderRadius: "16px",
    padding: "12px",
    border: "none",
  },
};

export default ForceChangePassword;

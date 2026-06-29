import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  message,
  Divider,
  Skeleton,
} from "antd";
import { UserOutlined, LockOutlined, NotificationOutlined } from "@ant-design/icons";
import { useParams, useNavigate } from "react-router-dom";

import { LoginPayload, LoginResponse } from "../../types/auth";
import AuthService from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";
import { getHomeRoute } from "../../utils/hasRole";
import SystemSettingService from "../../services/systemSettingService";
import { SystemSetting } from "../../types/system";
import { useTheme } from "../../contexts/ThemeContext";
import logger from "../../utils/logger";
import { APP_VERSION } from "../../constants/app.constants";

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const { isDarkMode, backgroundStyle } = useTheme();
  const { hospitalSlug } = useParams<{ hospitalSlug: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState<boolean>(false);
  const [branding, setBranding] = useState<SystemSetting | null>(null);
  const [fetchingBranding, setFetchingBranding] = useState<boolean>(true);

  const { handleLoginSuccess } = useAuth();
  const navigate = useNavigate();

  // 🚩 Fetch hospital name and logo branding as soon as the page loads
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        // Remember the slug for ProtectedRoute redirects
        localStorage.setItem("last_hospital_slug", hospitalSlug || "master");

        const brandingData = await SystemSettingService.getPublicSettings(hospitalSlug);
        setBranding(brandingData);

        // Update Browser Tab Title
        const hospitalName =
          brandingData.lab_name_en || brandingData.lab_name_th;

        if (hospitalName) {
          document.title = `${hospitalName} - Pathology LIS`;
        }
      } catch (err) {
        logger.error("Failed to load branding:", err);
      } finally {
        setFetchingBranding(false);
      }
    };

    fetchBranding();
  }, [hospitalSlug]);

  const onFinish = async (values: LoginPayload) => {
    setLoading(true);
    try {
      const response = await AuthService.login(values);
      const loginData: LoginResponse = response.data;

      // 🔒 SECURITY: respect the force-change-password redirect from
      // handleLoginSuccess. Previously this code unconditionally set
      // window.location.href to the user's home route, which silently
      // stomped the navigate() to /force-change-password and let users
      // skip the temporary-password change.
      const { status: loginStatus } = handleLoginSuccess(loginData);

      if (loginStatus === "force_change") {
        message.warning("Please change your temporary password before continuing.");
        // handleLoginSuccess already navigated to /force-change-password
        return;
      }

      const destination = getHomeRoute(loginData.roles, loginData.user?.position_name);
      const isExternal = destination === "/results" || destination === "/hospital-results";
      message.success(isExternal ? "Logged in successfully (Referral Portal)" : "Logged in successfully");
      navigate(destination);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        message.error(
          err.response.data?.detail || "Invalid username or password.",
        );
      } else if (status === 429) {
        message.error("Too many login attempts. Please wait a moment and try again.");
      } else {
        logger.error("Login error:", err);
        message.error("An error occurred during login. Please try again.");
      }
      form.resetFields(["password"]);
    } finally {
      setLoading(false);
    }
  };

  const hasAnnouncement = !!branding?.login_announcement;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "20px",
        ...backgroundStyle,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <Card
          style={{
            width: "100%",
            maxWidth: hasAnnouncement ? 820 : 400,
            borderRadius: 16,
            border: "none",
            overflow: "hidden",
            padding: 0,
            background: isDarkMode ? "rgba(28,28,30,0.9)" : "rgba(255,255,255,0.95)",
            backdropFilter: "blur(10px)",
            boxShadow: isDarkMode
              ? "0 20px 40px rgba(0,0,0,0.4)"
              : "0 10px 30px rgba(0,0,0,0.08)",
            transition: "max-width 0.3s ease",
          }}
          styles={{ body: { padding: 0 } }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", minHeight: 460 }}>

            {/* ── Left panel: branding + announcement ─────────────── */}
            <div
              style={{
                flex: hasAnnouncement ? "0 0 340px" : "0 0 100%",
                minWidth: hasAnnouncement ? 280 : "100%",
                background: isDarkMode
                  ? "rgba(20,24,40,0.95)"
                  : "linear-gradient(160deg, #e8f0fe 0%, #f0f5ff 100%)",
                borderRight: hasAnnouncement
                  ? `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "#dce8ff"}`
                  : "none",
                padding: "40px 32px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                gap: 0,
              }}
            >
              {fetchingBranding ? (
                <Skeleton active title={{ width: "60%" }} paragraph={{ rows: 2, width: ["80%", "50%"] }} />
              ) : (
                <>
                  {branding?.login_logo_url && (
                    <img
                      src={`${import.meta.env.VITE_API_BASE_URL}/public-assets/${branding.login_logo_url}`}
                      alt="Hospital Logo"
                      style={{ height: 72, objectFit: "contain", marginBottom: 16 }}
                    />
                  )}
                  <Title
                    level={4}
                    style={{
                      margin: 0,
                      fontWeight: 600,
                      color: isDarkMode ? "#e0e8ff" : "#1d3557",
                    }}
                  >
                    {branding?.lab_name_en || branding?.lab_name_th || "Pathology Management System"}
                  </Title>
                  {branding?.lab_name_en && branding?.lab_name_th && (
                    <Text style={{ fontSize: 13, color: isDarkMode ? "#8899cc" : "#4a6fa5" }}>
                      {branding.lab_name_th}
                    </Text>
                  )}

                  {hasAnnouncement && (
                    <div
                      style={{
                        marginTop: 24,
                        padding: "14px 16px",
                        background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)",
                        borderRadius: 10,
                        border: `1px solid ${isDarkMode ? "rgba(99,143,255,0.25)" : "#b8ceff"}`,
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                        <NotificationOutlined style={{ color: "#4a7cf6", marginTop: 2, flexShrink: 0 }} />
                        <Text strong style={{ color: isDarkMode ? "#a0b4ff" : "#2d55c8", fontSize: 13 }}>
                          ประกาศ
                        </Text>
                      </div>
                      <Text
                        style={{
                          fontSize: 13,
                          color: isDarkMode ? "#c8d4f0" : "#2c3e6a",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.65,
                        }}
                      >
                        {branding.login_announcement}
                      </Text>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Right panel: login form ──────────────────────────── */}
            {hasAnnouncement && (
              <div
                style={{
                  flex: 1,
                  minWidth: 300,
                  padding: "40px 36px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div style={{ marginBottom: 28 }}>
                  <Title level={3} style={{ margin: 0, color: isDarkMode ? "#fff" : "inherit" }}>
                    Pathology LIS
                  </Title>
                  <Text type="secondary">Please log in to continue</Text>
                </div>

                <Form form={form} name="login_form" onFinish={onFinish} layout="vertical" size="large">
                  <Form.Item name="username" rules={[{ required: true, message: "Please enter your username." }]}>
                    <Input
                      prefix={<UserOutlined style={{ color: "#bfbfbf" }} />}
                      placeholder="Username"
                      autoComplete="username"
                      autoFocus
                    />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: "Please enter your password." }]}>
                    <Input.Password
                      prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
                      placeholder="Password"
                      autoComplete="current-password"
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 45, fontSize: 16 }}>
                      Login
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            )}

            {/* ── Single-column form (no announcement) ────────────── */}
            {!hasAnnouncement && (
              <div style={{ flex: 1, padding: "32px 32px 28px" }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <Divider style={{ margin: "16px 0" }} />
                  <Title level={3} style={{ margin: 0, color: isDarkMode ? "#fff" : "inherit" }}>
                    Pathology LIS
                  </Title>
                  <Text type="secondary">Please log in to continue</Text>
                </div>
                <Form form={form} name="login_form" onFinish={onFinish} layout="vertical" size="large">
                  <Form.Item name="username" rules={[{ required: true, message: "Please enter your username." }]}>
                    <Input
                      prefix={<UserOutlined style={{ color: "#bfbfbf" }} />}
                      placeholder="Username"
                      autoComplete="username"
                      autoFocus
                    />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: "Please enter your password." }]}>
                    <Input.Password
                      prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
                      placeholder="Password"
                      autoComplete="current-password"
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 45, fontSize: 16 }}>
                      Login
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            )}

          </div>
        </Card>

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <Text style={{ fontSize: 12, color: isDarkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)" }}>
            Developed by <b>Korawit Tawinkan</b> &nbsp;·&nbsp; Pathology LIS © 2026 &nbsp;·&nbsp; v{APP_VERSION}
          </Text>
        </div>
      </div>
    </div>
  );
};

export default Login;

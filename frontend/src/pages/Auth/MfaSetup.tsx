import React, { useState } from "react";
import { Button, Card, Form, Input, Result, Steps, Typography, message } from "antd";
import {
  LockOutlined,
  SafetyCertificateOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import bwipjs from "bwip-js/browser";

import AuthService from "../../services/authService";
import { MfaSetupResponse } from "../../types/auth";
import { useAuth } from "../../hooks/useAuth";
import { getHomeRoute } from "../../utils/hasRole";
import { useTheme } from "../../contexts/ThemeContext";
import logger from "../../utils/logger";

const { Title, Text, Paragraph } = Typography;

/**
 * Render the otpauth:// URI as a QR code.
 *
 * Reuses bwip-js, already a dependency for the specimen barcodes, so adding an
 * authenticator needs no new package. Returns null rather than throwing if the
 * encode fails — the typed-in secret below is a complete fallback, and a broken
 * image should not take the page down with it.
 */
const renderQr = (uri: string): string | null => {
  try {
    return (bwipjs as any).toSVG({
      bcid: "qrcode",
      text: uri,
      scale: 4,
      includetext: false,
    });
  } catch (err) {
    logger.error("Failed to render MFA QR code:", err);
    return null;
  }
};

const MfaSetup: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDarkMode, backgroundStyle } = useTheme();

  const [step, setStep] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [passwordForm] = Form.useForm();
  const [codeForm] = Form.useForm();

  const qrSvg = setupData ? renderQr(setupData.provisioning_uri) : null;

  const onStart = async ({ password }: { password: string }) => {
    setLoading(true);
    try {
      const { data } = await AuthService.startMfaSetup(password);
      setSetupData(data);
      setStep(1);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        message.error("That password is not correct.");
      } else if (status === 409) {
        message.warning(
          err.response?.data?.detail ||
            "An authenticator app is already set up on this account.",
        );
      } else if (status === 503) {
        // The server has no MFA_ENCRYPTION_KEY. Nothing the user can do, so say
        // who can fix it rather than offering a retry.
        message.error(
          err.response?.data?.detail ||
            "Two-factor authentication is not configured on this server.",
        );
      } else {
        logger.error("MFA setup error:", err);
        message.error("Could not start setup. Please try again.");
      }
      passwordForm.resetFields(["password"]);
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async ({ code }: { code: string }) => {
    setLoading(true);
    try {
      await AuthService.confirmMfaSetup(code);
      setStep(2);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 400) {
        message.error(
          err.response?.data?.detail ||
            "That code is not valid. Check your authenticator app and try again.",
        );
      } else if (status === 429) {
        message.error("Too many attempts. Please wait a moment and try again.");
      } else {
        logger.error("MFA confirm error:", err);
        message.error("Could not confirm the code. Please try again.");
      }
      codeForm.resetFields(["code"]);
    } finally {
      setLoading(false);
    }
  };

  const goHome = () => navigate(getHomeRoute(user?.roles ?? [], user?.position_name));

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: 20,
        ...backgroundStyle,
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 16,
          border: "none",
          background: isDarkMode ? "rgba(28,28,30,0.9)" : "rgba(255,255,255,0.97)",
        }}
      >
        <Title level={4} style={{ marginTop: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8, color: "#4a7cf6" }} />
          Set up two-factor authentication
        </Title>

        <Steps
          size="small"
          current={step}
          style={{ margin: "20px 0 28px" }}
          items={[{ title: "Confirm" }, { title: "Scan" }, { title: "Done" }]}
        />

        {step === 0 && (
          <>
            <Paragraph type="secondary">
              You will need an authenticator app such as Google Authenticator,
              Microsoft Authenticator or FreeOTP. Enter your password to begin.
            </Paragraph>
            <Form form={passwordForm} onFinish={onStart} layout="vertical" size="large">
              <Form.Item
                name="password"
                rules={[{ required: true, message: "Please enter your password." }]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
                  placeholder="Your password"
                  autoComplete="current-password"
                  autoFocus
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 45 }}>
                Continue
              </Button>
              <Button type="link" block onClick={goHome} style={{ marginTop: 8 }}>
                Not now
              </Button>
            </Form>
          </>
        )}

        {step === 1 && setupData && (
          <>
            <Paragraph type="secondary">
              Scan this with your authenticator app, then enter the six-digit
              code it shows.
            </Paragraph>

            <div style={{ textAlign: "center", margin: "8px 0 20px" }}>
              {qrSvg ? (
                <div
                  style={{
                    display: "inline-block",
                    padding: 12,
                    background: "#fff",
                    borderRadius: 12,
                  }}
                  // bwip-js generates this SVG from the provisioning URI itself;
                  // nothing user-supplied reaches it.
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <Text type="secondary">
                  <QrcodeOutlined /> QR code unavailable — use the key below.
                </Text>
              )}
            </div>

            <Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 13 }}>
              Cannot scan? Enter this key by hand instead:
            </Paragraph>
            <Paragraph
              copyable={{ text: setupData.secret }}
              style={{
                fontFamily: "monospace",
                fontSize: 15,
                letterSpacing: 1,
                wordBreak: "break-all",
                background: isDarkMode ? "rgba(255,255,255,0.06)" : "#f5f5f5",
                padding: "10px 12px",
                borderRadius: 8,
              }}
            >
              {setupData.secret}
            </Paragraph>

            <Form
              form={codeForm}
              onFinish={onConfirm}
              layout="vertical"
              size="large"
              style={{ marginTop: 20 }}
            >
              <Form.Item
                name="code"
                rules={[{ required: true, message: "Please enter the 6-digit code." }]}
              >
                <Input
                  prefix={<SafetyCertificateOutlined style={{ color: "#bfbfbf" }} />}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 45 }}>
                Confirm
              </Button>
            </Form>
          </>
        )}

        {step === 2 && (
          <Result
            status="success"
            title="Two-factor authentication is on"
            subTitle={
              <>
                From now on you will be asked for a code from your authenticator
                app when you sign in.
                <br />
                <Text strong>
                  If you lose the device, an administrator has to reset it for
                  you — there are no printed recovery codes.
                </Text>
              </>
            }
            extra={
              <Button type="primary" onClick={goHome}>
                Continue
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
};

export default MfaSetup;

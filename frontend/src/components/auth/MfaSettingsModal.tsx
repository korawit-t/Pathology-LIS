import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  List,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  SafetyCertificateOutlined,
  DesktopOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import AuthService from "../../services/authService";
import { MfaStatus, TrustedDevice } from "../../types/auth";
import logger from "../../utils/logger";

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

/**
 * Where a user sees and controls their own second factor.
 *
 * The trusted-device list is as much the point as the switches. A browser that
 * skips the code is invisible everywhere else, so an entry nobody recognises is
 * the only signal that something is wrong — and this is the only screen that
 * would show it.
 */
const MfaSettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [statusRes, devicesRes] = await Promise.all([
        AuthService.getMfaStatus(),
        AuthService.getTrustedDevices(),
      ]);
      setStatus(statusRes.data);
      setDevices(devicesRes.data);
    } catch (err) {
      logger.error("Failed to load MFA settings:", err);
      message.error("Could not load your security settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const revokeOne = async (id: number) => {
    try {
      await AuthService.revokeTrustedDevice(id);
      message.success("That device will be asked for a code next time.");
      load();
    } catch (err) {
      logger.error("Failed to revoke device:", err);
      message.error("Could not remove that device.");
    }
  };

  const revokeAll = async () => {
    try {
      await AuthService.revokeAllTrustedDevices();
      message.success("Every device will be asked for a code next time.");
      load();
    } catch (err) {
      logger.error("Failed to revoke devices:", err);
      message.error("Could not remove the devices.");
    }
  };

  const goToSetup = () => {
    onClose();
    navigate("/mfa-setup");
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      title={
        <span>
          <SafetyCertificateOutlined style={{ marginRight: 8, color: "#4a7cf6" }} />
          Two-factor authentication
        </span>
      }
    >
      {loading && !status ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <Spin />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            {status?.enabled ? (
              <Tag color="green">On</Tag>
            ) : (
              <Tag color="default">Off</Tag>
            )}
            {status?.required_for_this_user && (
              <Tag color="blue">Required for your role</Tag>
            )}
          </div>

          {!status?.system_enabled && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Not in use on this system yet"
              description={
                "You can set up an authenticator now, but you will not be asked " +
                "for a code until an administrator turns the feature on."
              }
            />
          )}

          {!status?.enabled && (
            <>
              <Paragraph type="secondary">
                Add a second step to your login using an authenticator app. If you
                lose the device an administrator has to reset it for you — there
                are no printed recovery codes.
              </Paragraph>
              <Button type="primary" onClick={goToSetup}>
                Set up two-factor authentication
              </Button>
            </>
          )}

          {status?.enabled && (
            <>
              <Paragraph type="secondary" style={{ marginBottom: 4 }}>
                <Text strong>Trusted devices</Text>
              </Paragraph>
              <Paragraph type="secondary" style={{ fontSize: 13 }}>
                These browsers skip the code when you sign in. If you do not
                recognise one, remove it — and tell an administrator.
              </Paragraph>

              {devices.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No trusted devices — you are asked for a code every time."
                />
              ) : (
                <>
                  <List
                    size="small"
                    bordered
                    dataSource={devices}
                    renderItem={(device) => (
                      <List.Item
                        actions={[
                          <Popconfirm
                            key="revoke"
                            title="Remove this device?"
                            description="It will be asked for a code next time."
                            okText="Remove"
                            cancelText="Cancel"
                            onConfirm={() => revokeOne(device.id)}
                          >
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              // Icon-only and destructive: without a name a
                              // screen reader announces nothing useful.
                              aria-label={`Remove ${device.label || "device"}`}
                            />
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<DesktopOutlined style={{ fontSize: 18, color: "#8c8c8c" }} />}
                          title={device.label || "Unknown device"}
                          description={
                            <Space direction="vertical" size={0}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Last used: {formatDate(device.last_used_at)}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Expires: {formatDate(device.expires_at)}
                                {device.ip_address ? ` · from ${device.ip_address}` : ""}
                              </Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                  <Popconfirm
                    title="Remove every trusted device?"
                    description="Every browser will be asked for a code next time."
                    okText="Remove all"
                    cancelText="Cancel"
                    onConfirm={revokeAll}
                  >
                    <Button danger type="text" style={{ marginTop: 12 }}>
                      Remove all devices
                    </Button>
                  </Popconfirm>
                </>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
};

export default MfaSettingsModal;

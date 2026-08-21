import React, { useState } from "react";
import { Alert, Form, Input, Modal, Typography, message } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";

import AuthService from "../../services/authService";
import logger from "../../utils/logger";

const { Paragraph } = Typography;

/**
 * The server refuses an irreversible action with this, rather than a bare 403,
 * so the client can tell "you may not do this" from "confirm it is you".
 */
export const STEP_UP_REQUIRED = "step_up_required";

/** The server asked for a factor — whether or not it has already been asked for. */
export const isStepUpRefusal = (err: any): boolean =>
  err?.response?.status === 403 && err?.response?.data?.detail === STEP_UP_REQUIRED;

export const isStepUpRequired = (err: any): boolean =>
  isStepUpRefusal(err) &&
  // Already offered app-wide and dismissed (see StepUpGate) — putting a second
  // prompt up on top of the one the user just closed only loops them.
  !err?.__stepUpHandled;

interface Props {
  open: boolean;
  /** What the user is about to do, e.g. "reset Dr Smith's second factor". */
  action?: string;
  onCancel: () => void;
  /** Called once the factor has been re-checked; retry the original request here. */
  onVerified: () => void;
}

/**
 * Asks for a factor again before something that cannot be undone.
 *
 * Accepts a code or the account password, because the same prompt has to serve
 * users who have no second factor — making the client decide which it is only
 * moves the guesswork somewhere with less information.
 */
const StepUpModal: React.FC<Props> = ({ open, action, onCancel, onVerified }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  const onFinish = async ({ code }: { code: string }) => {
    setLoading(true);
    try {
      await AuthService.stepUp(code);
      form.resetFields();
      onVerified();
    } catch (err: any) {
      if (err?.response?.status === 401) {
        message.error("That code or password is not valid.");
      } else if (err?.response?.status === 429) {
        message.error("Too many attempts. Please wait a moment and try again.");
      } else {
        logger.error("Step-up failed:", err);
        message.error("Could not confirm your identity. Please try again.");
      }
      form.resetFields(["code"]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      okText="Confirm"
      confirmLoading={loading}
      title={
        <span>
          <SafetyCertificateOutlined style={{ marginRight: 8, color: "#4a7cf6" }} />
          Confirm it is you
        </span>
      }
      destroyOnHidden
    >
      {action && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`You are about to ${action}.`} />
      )}
      <Paragraph type="secondary">
        Enter the code from your authenticator app, or your password.
      </Paragraph>
      <Form form={form} onFinish={onFinish} layout="vertical">
        <Form.Item name="code" rules={[{ required: true, message: "Please enter a code or your password." }]}>
          <Input.Password
            placeholder="Code or password"
            autoComplete="one-time-code"
            autoFocus
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StepUpModal;

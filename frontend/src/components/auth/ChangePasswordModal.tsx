import React, { useState } from "react";
import { Modal, Form, Input, message } from "antd";
import { LockOutlined, CheckCircleOutlined } from "@ant-design/icons";
import AuthService from "../../services/authService";
import { handleApiError } from "../../utils/errorHandler";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<Props> = ({ open, onClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const onFinish = async (values: {
    current_password: string;
    new_password: string;
  }) => {
    setLoading(true);
    try {
      await AuthService.changePassword(values.current_password, values.new_password);
      message.success("Password updated successfully.");
      handleClose();
    } catch (err) {
      handleApiError(err, form);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Change Password"
      open={open}
      onCancel={handleClose}
      onOk={() => form.submit()}
      okText="Update Password"
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="current_password"
          label="Current Password"
          rules={[{ required: true, message: "Please enter your current password!" }]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
            placeholder="Enter current password"
          />
        </Form.Item>

        <Form.Item
          name="new_password"
          label="New Password"
          rules={[
            { required: true, message: "Please enter your new password!" },
            { min: 8, message: "Password must be at least 8 characters long." },
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
          label="Confirm New Password"
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
                  new Error("The two passwords that you entered do not match!"),
                );
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<CheckCircleOutlined style={{ color: "rgba(0,0,0,0.25)" }} />}
            placeholder="Re-enter new password"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ChangePasswordModal;

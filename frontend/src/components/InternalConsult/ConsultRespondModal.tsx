import React, { useState } from "react";
import { Modal, Form, Input, Typography, message } from "antd";
import { InternalConsult } from "../../types/internalConsult";
import InternalConsultService from "../../services/internalConsultService";
import logger from "../../utils/logger";

const { Text } = Typography;

interface Props {
  open: boolean;
  consult: InternalConsult | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ConsultRespondModal: React.FC<Props> = ({ open, consult, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { opinion: string }) => {
    if (!consult) return;
    setLoading(true);
    try {
      await InternalConsultService.respond(consult.id, { opinion: values.opinion });
      message.success("Response submitted.");
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err) {
      logger.error(err);
      message.error("Failed to submit response.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Respond to Consult"
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => form.submit()}
      okText="Submit Opinion"
      confirmLoading={loading}
      destroyOnClose
    >
      {consult && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#f5f5f5", borderRadius: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Question from {consult.requester?.full_name}:</Text>
          <div style={{ marginTop: 4, fontWeight: 500 }}>{consult.reason}</div>
        </div>
      )}
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="opinion"
          label="Your Opinion"
          rules={[{ required: true, message: "Please provide your opinion" }]}
        >
          <Input.TextArea rows={5} placeholder="Enter your consultation opinion..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ConsultRespondModal;

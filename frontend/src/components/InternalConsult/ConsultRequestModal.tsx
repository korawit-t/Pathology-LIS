import React, { useState } from "react";
import { Modal, Form, Select, Input, message } from "antd";
import { ConsultCaseType } from "../../types/internalConsult";
import InternalConsultService from "../../services/internalConsultService";
import logger from "../../utils/logger";

interface PathologistOption {
  value: number;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  caseType: ConsultCaseType;
  reportId: number;
  pathologists: PathologistOption[];
}

const ConsultRequestModal: React.FC<Props> = ({
  open, onClose, onSuccess, caseType, reportId, pathologists,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { consultant_id: number; reason: string }) => {
    setLoading(true);
    try {
      await InternalConsultService.createConsult({
        case_type: caseType,
        report_id: reportId,
        consultant_id: values.consultant_id,
        reason: values.reason,
      });
      message.success("Consult request sent.");
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err) {
      logger.error(err);
      message.error("Failed to send consult request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Request Internal Consult"
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => form.submit()}
      okText="Send Request"
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="consultant_id"
          label="Consult to"
          rules={[{ required: true, message: "Please select a pathologist" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={pathologists}
            placeholder="Select pathologist"
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="Question / Reason"
          rules={[{ required: true, message: "Please describe the consult question" }]}
        >
          <Input.TextArea rows={4} placeholder="What would you like to consult about?" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ConsultRequestModal;

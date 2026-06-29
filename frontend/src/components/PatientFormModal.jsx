import React, { useEffect } from "react";
import { Modal, Form, Input, Select, DatePicker, message, Button } from "antd";
import dayjs from "dayjs";
import api from "../services/httpClient";

const { Option } = Select;

// Component สำหรับ Modal ฟอร์ม Patient โดยเฉพาะ
const PatientFormModal = ({
  open,
  onClose,
  onSuccess,
  titles,
  hospitals,
  schemes,
}) => {
  const [form] = Form.useForm();

  // ตั้งค่าเริ่มต้นเมื่อ Modal เปิด
  useEffect(() => {
    if (open) {
      form.resetFields();
      // อาจกำหนดค่าเริ่มต้นให้กับฟิลด์ที่ไม่จำเป็นต้องกรอกในครั้งแรก
      form.setFieldsValue({
        title_id: titles[0]?.id || null, // ตั้ง Title เป็นค่าแรกหากมี
        hospital_id: hospitals[0]?.id || null,
        gender: "Other",
      });
    }
  }, [open, form, titles, hospitals]);

  const handleSubmit = async (values) => {
    try {
      // แปลง DatePicker (dayjs object) ให้เป็น string "YYYY-MM-DD" ก่อนส่ง API
      const formattedValues = {
        ...values,
        birth_date: values.birth_date
          ? values.birth_date.format("YYYY-MM-DD")
          : null,
        // หากฟิลด์ CID ว่าง ให้ส่งค่าเป็น null แทน string ว่าง
        cid: values.cid || null,
      };

      // ส่งข้อมูลไปยัง API เพื่อสร้าง Patient ใหม่
      const response = await api.post("/patients", formattedValues);

      const patientName = response.data?.name || values.name;
      message.success(`เพิ่มคนไข้ ${patientName} สำเร็จ!`);

      onClose();
      onSuccess(response.data);
    } catch (err) {
      console.error("Patient creation error:", err.response?.data);
      message.error(
        err.response?.data?.detail ||
          "เกิดข้อผิดพลาดในการบันทึกข้อมูล (HN/CID อาจซ้ำ)"
      );
    }
  };

  // ป้องกันไม่ให้ Render ฟอร์มหากไม่มี Master Data ในขณะที่ Modal ถูกเรียกใช้

  if (!open) {
    return null;
  }

  return (
    <Modal
      title="Register New Patient Data"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px",
          }}
        >
          {/* Row 1: Basic Info */}
          <Form.Item name="title_id" label="Title">
            <Select placeholder="Select Title">
              {titles.map((t) => (
                <Option key={t.id} value={t.id}>
                  {t.title}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="First Name"
            rules={[{ required: true, message: "กรุณากรอกชื่อ" }]}
          >
            <Input placeholder="ชื่อ" />
          </Form.Item>

          <Form.Item name="ln" label="Last Name">
            <Input placeholder="นามสกุล" />
          </Form.Item>

          <Form.Item name="gender" label="Gender" rules={[{ required: true }]}>
            <Select placeholder="Select Gender">
              <Option value="Male">ชาย (Male)</Option>
              <Option value="Female">หญิง (Female)</Option>
              <Option value="Other">อื่นๆ (Other)</Option>
            </Select>
          </Form.Item>

          {/* Row 2: Identifiers */}
          <Form.Item name="cid" label="CID (Citizen ID)">
            <Input placeholder="เลขบัตรประชาชน" maxLength={13} />
          </Form.Item>

          <Form.Item name="birth_date" label="Birthdate">
            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
          </Form.Item>
        </div>

        <Button
          type="primary"
          htmlType="submit"
          style={{ marginTop: 20 }}
          block
        >
          Create Patient
        </Button>
      </Form>
    </Modal>
  );
};

export default PatientFormModal;

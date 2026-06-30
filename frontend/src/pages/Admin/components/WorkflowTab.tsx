import React, { useEffect, useState } from "react";
import {
  Form,
  Switch,
  Typography,
  Alert,
  Divider,
  InputNumber,
  Row,
  Col,
  Space,
  Select,
  Modal,
  Button,
  message,
} from "antd";
import {
  ClockCircleOutlined,
  ControlOutlined,
  InfoCircleOutlined,
  UsergroupAddOutlined,
  ExperimentOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import SystemSettingService from "../../../services/systemSettingService";
import AnatomicalPathologyTestService, { AnatomicalPathologyTest } from "../../../services/anatomicalTestService";

const { Text, Title } = Typography;

const SettingRow = ({ title, description, children, icon }: { title: string; description?: string; children: React.ReactNode; icon?: React.ReactNode }) => (
  <Row
    gutter={[16, 16]}
    style={{ padding: "20px 0", borderBottom: "1px solid #f0f0f0" }}
  >
    <Col xs={24} md={14}>
      <Space direction="vertical" size={0}>
        <Space>
          {icon}
          <Text strong style={{ fontSize: "15px" }}>
            {title}
          </Text>
        </Space>
        <Text type="secondary" style={{ fontSize: "13px" }}>
          {description}
        </Text>
      </Space>
    </Col>
    <Col
      xs={24}
      md={10}
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      {children}
    </Col>
  </Row>
);

const NonGyneSignSwitch: React.FC<{
  value?: boolean;
  onChange?: (v: boolean) => void;
}> = ({ value, onChange }) => {
  const handleChange = (checked: boolean) => {
    if (!checked) {
      Modal.confirm({
        title: 'ปิด "Require All Signatures (Non-Gyne)"?',
        icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
        content: (
          <p>
            หากปิดการตั้งค่านี้{" "}
            <strong>
              Cytotechnologist จะสามารถออกผลโดยไม่ต้องมีพยาธิแพทย์ร่วมลงนาม
            </strong>{" "}
            ต้องการปิดจริงหรือไม่?
          </p>
        ),
        okText: "ปิดการตั้งค่า",
        okButtonProps: { danger: true },
        cancelText: "ยกเลิก",
        onOk: () => onChange?.(false),
      });
    } else {
      onChange?.(true);
    }
  };
  return (
    <Switch
      checkedChildren="ON"
      unCheckedChildren="OFF"
      checked={value ?? true}
      onChange={handleChange}
    />
  );
};

const WorkflowTab: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [masterTests, setMasterTests] = useState<AnatomicalPathologyTest[]>([]);

  const warningMinutes = Form.useWatch("idle_warning_minutes", form) ?? 1;
  const gyneQcOn = Form.useWatch("enable_gyne_qc_system", form);

  const gyneOptions = masterTests
    .filter((t) => t.category === "Cytology")
    .map((t) => ({ label: t.name, value: t.id }));

  const surgicalOptions = masterTests
    .filter((t) => t.category === "Surgical" || t.category === "Histochem")
    .map((t) => ({ label: t.name, value: t.id }));

  const load = async () => {
    try {
      const [settings, testsRes] = await Promise.all([
        SystemSettingService.getSettings(),
        AnatomicalPathologyTestService.getAllTests(),
      ]);
      form.setFieldsValue(settings);
      setMasterTests(testsRes.data);
    } catch {
      message.error("Failed to load workflow settings");
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await SystemSettingService.updateSettings(form.getFieldsValue());
      message.success("Workflow settings saved");
      load();
    } catch {
      message.error("Failed to save workflow settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        {/* Section 0: Default Test Configuration */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 24 }}>
            <ExperimentOutlined /> Default Test Selection
          </Title>

          <SettingRow
            title="Default Gynecology (PAP Smear) Test"
            description="The baseline test that will be automatically generated when registering a Gynecology case (e.g., PAP Stain)."
          >
            <Form.Item name="default_gyne_test_id" noStyle>
              <Select
                placeholder="เลือกรายการตรวจ"
                style={{ width: 220 }}
                options={gyneOptions}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </Form.Item>
          </SettingRow>

          <SettingRow
            title="Default Surgical H&E Test"
            description="The baseline test automatically generated for surgical specimen cases (e.g., H&E Stain)."
          >
            <Form.Item name="default_surgical_test_id" noStyle>
              <Select
                placeholder="เลือกรายการตรวจ"
                style={{ width: 220 }}
                options={surgicalOptions}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </Form.Item>
          </SettingRow>

        </div>

        <Divider />

        {/* Section 1: Approval */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 24 }}>
            <ControlOutlined /> Approval Process
          </Title>

          <SettingRow
            title="Enable Surgical Approval"
            description="ต้องมีการ Approve ผล Surgical Pathology ก่อนพิมพ์รายงาน"
          >
            <Form.Item
              name="enable_approve_system"
              valuePropName="checked"
              noStyle
            >
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
          </SettingRow>

          <SettingRow
            title="Enable Gyne QC & Review System"
            description="เปิดระบบ QC สำหรับ Gyne Cytology: สุ่มตรวจ NILM และบังคับให้ pathologist review เคส Abnormal ก่อน publish"
          >
            <Form.Item
              name="enable_gyne_qc_system"
              valuePropName="checked"
              noStyle
            >
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
          </SettingRow>

          {gyneQcOn && (
            <SettingRow
              icon={<ExperimentOutlined style={{ color: "#722ed1" }} />}
              title="NILM QC Review — อัตราสุ่มตรวจ"
              description="% ของเคส NILM ที่จะถูกสุ่มส่ง QC Review แต่ละเคสมีโอกาสถูกเลือกอย่างอิสระ (เช่น 10 = แต่ละเคสมีโอกาส 10%)"
            >
              <Space>
                <Form.Item name="nilm_review_every_n" noStyle>
                  <InputNumber min={1} max={100} style={{ width: 90 }} placeholder="10" suffix="%" />
                </Form.Item>
              </Space>
            </SettingRow>
          )}

          <SettingRow
            title="Enable Non-Gyne Approval"
            description="ต้องมีการ Approve ผล Non-Gynecology ก่อนพิมพ์รายงาน"
          >
            <Form.Item
              name="enable_non_gyne_approve_system"
              valuePropName="checked"
              noStyle
            >
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
          </SettingRow>

          <SettingRow
              icon={<UsergroupAddOutlined style={{ color: "#1890ff" }} />}
              title="Require All Signatures (Surgical)"
              description="Surgical Patho: ต้องให้พยาธิแพทย์ทุกคน (Co-signers) เซ็นครบก่อน จึงจะดำเนินการขั้นต่อไป (Pending Approval หรือ Public)"
          >
              <Form.Item
              name="require_all_pathologists_sign"
              valuePropName="checked"
              noStyle
              >
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
              </Form.Item>
          </SettingRow>

          {gyneQcOn && (
            <SettingRow
              icon={<UsergroupAddOutlined style={{ color: "#eb2f96" }} />}
              title="Require All Signatures (Gyne)"
              description="Gyne Cyto: ต้องให้ทั้ง Cytotechnologist และ Pathologist เซ็นครบก่อน จึงจะ publish"
            >
              <Form.Item name="require_all_gyne_sign" valuePropName="checked" noStyle>
                <Switch checkedChildren="ON" unCheckedChildren="OFF" />
              </Form.Item>
            </SettingRow>
          )}

          <SettingRow
              icon={<UsergroupAddOutlined style={{ color: "#722ed1" }} />}
              title="Require All Signatures (Non-Gyne)"
              description="Non-Gyne Cyto: ต้องให้ทั้ง Cytotechnologist และ Pathologist เซ็นครบก่อน จึงจะดำเนินการขั้นต่อไป — หากปิด Cytotechnologist จะออกผลได้โดยไม่ต้องมีพยาธิแพทย์"
          >
              <Form.Item name="require_all_non_gyne_sign" noStyle>
                <NonGyneSignSwitch />
              </Form.Item>
          </SettingRow>

          <SettingRow
            icon={<ControlOutlined style={{ color: "#722ed1" }} />}
            title="Non-Gyne: Enable Slide Dispatch"
            description='สำหรับ Non-Gyne Cytology — เปิด: Cytotechnologist กด "Send to Pathologist" แล้วต้องรอ Lab Tech สแกนส่งสไลด์ผ่านหน้า Slide Dispatch อีกครั้ง | ปิด: กด "Send to Pathologist" เพียงครั้งเดียวแล้วสไลด์ถูกส่งถึง Pathologist ทันที'
          >
            <Form.Item name="nongyne_slide_dispatch_enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
          </SettingRow>
        </div>

        {/* Section: Session Security */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            <ControlOutlined /> Session Security
          </Title>
          <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8 }}>
            <SettingRow
              title="Idle Timeout"
              description={`ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน — จะแสดงคำเตือน ${warningMinutes} นาทีก่อนหมดเวลา`}
              icon={<ClockCircleOutlined style={{ color: "#faad14" }} />}
            >
              <Form.Item name="idle_timeout_minutes" noStyle>
                <InputNumber min={2} max={480} step={5} addonAfter="นาที" style={{ width: 160 }} />
              </Form.Item>
            </SettingRow>
            <SettingRow
              title="Warning Lead Time"
              description="แสดงคำเตือนล่วงหน้าก่อนออกจากระบบ"
              icon={<ClockCircleOutlined style={{ color: "#faad14" }} />}
            >
              <Form.Item name="idle_warning_minutes" noStyle>
                <InputNumber min={1} max={10} step={1} addonAfter="นาที" style={{ width: 160 }} />
              </Form.Item>
            </SettingRow>
          </div>
        </div>

        {/* Password Policy */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            <ControlOutlined /> Password Policy
          </Title>
          <div style={{ background: "#fafafa", padding: "0 20px", borderRadius: 8 }}>
            <SettingRow
              title="Minimum Password Length"
              description="Minimum number of characters required for all user passwords"
              icon={<ControlOutlined style={{ color: "#1890ff" }} />}
            >
              <Space>
                <Form.Item name="password_min_length" noStyle>
                  <InputNumber min={6} max={32} style={{ width: 100 }} />
                </Form.Item>
                <Text type="secondary">chars</Text>
              </Space>
            </SettingRow>
            <SettingRow
              title="Password Expiry"
              description="Users must change their password after this many days. Set to 0 to disable."
              icon={<ClockCircleOutlined style={{ color: "#faad14" }} />}
            >
              <Space>
                <Form.Item name="password_expiry_days" noStyle>
                  <InputNumber min={0} max={365} style={{ width: 100 }} />
                </Form.Item>
                <Text type="secondary">days</Text>
              </Space>
            </SettingRow>
          </div>
        </div>

        {/* Section 2: TAT SLA */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            <ClockCircleOutlined /> Turnaround Time (SLA)
          </Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
            กำหนดเป้าหมายเวลาทำงาน (Working Days)
            โดยระบบจะไม่นับรวมวันเสาร์-อาทิตย์ และวันหยุดราชการ
          </Text>

          <div
            style={{
              background: "#fafafa",
              padding: "0 20px",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <SettingRow
              title="Surgical Pathology"
              description="เป้าหมายเวลาสำหรับเคสตรวจชิ้นเนื้อทางศัลยกรรม"
            >
              <Space size="large">
                <Form.Item
                  name="surgical_tat_days"
                  label="Routine"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} style={{ width: 100 }} addonAfter="d" />
                </Form.Item>
                <Form.Item
                  name="surgical_express_tat_days"
                  label={<Text type="danger">Express</Text>}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} style={{ width: 100 }} addonAfter="d" status="error" />
                </Form.Item>
              </Space>
            </SettingRow>

            <SettingRow
              title="Non-Gynecology"
              description="เป้าหมายเวลาสำหรับเคสเซลล์วิทยาที่ไม่ใช่สูตินรีเวช"
            >
              <Space size="large">
                <Form.Item
                  name="non_gyne_tat_days"
                  label="Routine"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} style={{ width: 100 }} addonAfter="d" />
                </Form.Item>
                <Form.Item
                  name="non_gyne_express_tat_days"
                  label={<Text type="danger">Express</Text>}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} style={{ width: 100 }} addonAfter="d" status="error" />
                </Form.Item>
              </Space>
            </SettingRow>

            <SettingRow
              title="Gynecology (Pap Smear)"
              description="เป้าหมายเวลาสำหรับเคสตรวจมะเร็งปากมดลูก"
              icon={null}
            >
              <Space size="large">
                <Form.Item
                  name="gyne_tat_days"
                  label="Routine"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} style={{ width: 100 }} addonAfter="d" />
                </Form.Item>
                <Form.Item
                  name="gyne_express_tat_days"
                  label={<Text type="danger">Express</Text>}
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber min={1} style={{ width: 100 }} addonAfter="d" status="error" />
                </Form.Item>
              </Space>
            </SettingRow>
          </div>
        </div>

        <Alert
          icon={<InfoCircleOutlined />}
          message="การตั้งค่าเหล่านี้จะมีผลกับเคสใหม่ที่ลงทะเบียนหลังจากกดบันทึกแล้วเท่านั้น"
          type="info"
          showIcon
        />
      </div>

      <div style={{
        position: "sticky", bottom: 0, marginTop: 32,
        marginLeft: -48, marginRight: -48, padding: "12px 48px",
        background: "rgba(255,255,255,0.95)", borderTop: "1px solid #f0f0f0",
        backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end",
      }}>
        <Button type="primary" icon={<SaveOutlined />} size="large" loading={loading} onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </Form>
  );
};

export default WorkflowTab;

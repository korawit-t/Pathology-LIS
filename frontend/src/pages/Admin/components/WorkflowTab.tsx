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
        title: 'Turn off "Require All Signatures (Non-Gyne)"?',
        icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
        content: (
          <p>
            If you turn off this setting,{" "}
            <strong>
              the Cytotechnologist will be able to issue results without a pathologist co-signing
            </strong>{" "}
            . Are you sure you want to turn it off?
          </p>
        ),
        okText: "Turn Off",
        okButtonProps: { danger: true },
        cancelText: "Cancel",
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
                placeholder="Select test"
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
                placeholder="Select test"
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
            description="Requires approval of Surgical Pathology results before printing the report"
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
            description="Enables the QC system for Gyne Cytology: randomly samples NILM cases and requires a pathologist to review Abnormal cases before publishing"
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
              title="NILM QC Review — Sampling Rate"
              description="% of NILM cases randomly sent to QC Review. Each case has an independent chance of being selected (e.g. 10 = each case has a 10% chance)"
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
            description="Requires approval of Non-Gynecology results before printing the report"
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
              description="Surgical Patho: requires all pathologists (Co-signers) to sign before proceeding to the next step (Pending Approval or Publish)"
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
              description="Gyne Cyto: requires both the Cytotechnologist and Pathologist to sign before publishing"
            >
              <Form.Item name="require_all_gyne_sign" valuePropName="checked" noStyle>
                <Switch checkedChildren="ON" unCheckedChildren="OFF" />
              </Form.Item>
            </SettingRow>
          )}

          <SettingRow
              icon={<UsergroupAddOutlined style={{ color: "#722ed1" }} />}
              title="Require All Signatures (Non-Gyne)"
              description="Non-Gyne Cyto: requires both the Cytotechnologist and Pathologist to sign before proceeding — if turned off, the Cytotechnologist can issue results without a pathologist"
          >
              <Form.Item name="require_all_non_gyne_sign" noStyle>
                <NonGyneSignSwitch />
              </Form.Item>
          </SettingRow>

          <SettingRow
            icon={<ControlOutlined style={{ color: "#722ed1" }} />}
            title="Non-Gyne: Enable Slide Dispatch"
            description='For Non-Gyne Cytology — On: after the Cytotechnologist clicks "Send to Pathologist", the Lab Tech must scan and send the slide again via the Slide Dispatch page | Off: clicking "Send to Pathologist" once sends the slide to the Pathologist immediately'
          >
            <Form.Item name="nongyne_slide_dispatch_enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
          </SettingRow>
        </div>

        {/* Section 2: TAT SLA */}
        <div style={{ marginBottom: 40 }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            <ClockCircleOutlined /> Turnaround Time (SLA)
          </Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
            Sets the target turnaround time (Working Days).
            The system excludes Saturdays, Sundays, and public holidays.
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
              description="Target turnaround time for surgical tissue cases"
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
              description="Target turnaround time for non-gynecologic cytology cases"
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
              description="Target turnaround time for cervical cancer screening cases"
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
          message="These settings will only apply to new cases registered after saving"
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

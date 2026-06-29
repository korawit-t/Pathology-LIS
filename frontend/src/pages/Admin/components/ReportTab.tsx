import React, { useEffect, useState } from "react";
import { Form, Switch, Input, Card, Row, Col, Typography, Divider, Button, message } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import SystemSettingService from "../../../services/systemSettingService";

const { Text } = Typography;

const ReportTab = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const data = await SystemSettingService.getSettings();
      form.setFieldsValue(data);
    } catch {
      message.error("Failed to load report settings");
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await SystemSettingService.updateSettings(form.getFieldsValue());
      message.success("Report settings saved");
      load();
    } catch {
      message.error("Failed to save report settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical">
      <Card variant="outlined">
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="show_specimen_name"
              label="Show Specimen Name in Header"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Text type="secondary">On: A: Appendix &nbsp;|&nbsp; Off: A:</Text>
          </Col>
          <Col span={12}>
            <Form.Item name="accession_no_format" label="Accession No. Format">
              <Input placeholder="{year}-{no}" style={{ width: 200 }} />
            </Form.Item>
          </Col>
        </Row>
        <Divider />
        <Text strong>Accession No. Prefix</Text>
        <Text type="secondary" style={{ display: "block", marginBottom: 16, marginTop: 4 }}>
          Letter prefix per case type. Resets every year automatically. e.g. <code>S26-00001</code>
        </Text>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="surgical_accession_prefix" label="Surgical">
              <Input placeholder="S" maxLength={5} style={{ width: 100 }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="gyne_accession_prefix" label="Gyne Cytology">
              <Input placeholder="C" maxLength={5} style={{ width: 100 }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="nongyne_accession_prefix" label="Non-Gyne Cytology">
              <Input placeholder="N" maxLength={5} style={{ width: 100 }} />
            </Form.Item>
          </Col>
        </Row>
        <Divider />
        <Text strong>Report Footer Text</Text>
        <Text type="secondary" style={{ display: "block", marginBottom: 16, marginTop: 4 }}>
          Appears at the bottom of each report. Set per case type.
        </Text>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="surgical_report_footer" label="Surgical">
              <Input.TextArea rows={3} placeholder="Footer for surgical reports..." />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="gyne_report_footer" label="Gyne Cytology">
              <Input.TextArea rows={3} placeholder="Footer for gyne reports..." />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="nongyne_report_footer" label="Non-Gyne Cytology">
              <Input.TextArea rows={3} placeholder="Footer for non-gyne reports..." />
            </Form.Item>
          </Col>
        </Row>
        <Divider />
        <Form.Item
          name="is_cumulative_report"
          label="Cumulative Report"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Text type="secondary">
          Show previous diagnosis history in the latest report
        </Text>
      </Card>

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

export default ReportTab;

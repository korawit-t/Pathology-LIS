import React, { useEffect, useState } from "react";
import { Form, Switch, Input, InputNumber, Card, Row, Col, Typography, Divider, Button, message } from "antd";
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
          <Col span={24}>
            <Form.Item
              name="show_specimen_name"
              label="Show Specimen Name in Header"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Text type="secondary">On: A: Appendix &nbsp;|&nbsp; Off: A:</Text>
          </Col>
        </Row>
        <Divider />
        <Text strong>Accession No. Prefix</Text>
        <Text type="secondary" style={{ display: "block", marginBottom: 16, marginTop: 4 }}>
          Letter prefix per case type. Resets every year automatically. e.g. <code>S26-00001</code>
        </Text>
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item name="surgical_accession_prefix" label="Surgical">
              <Input placeholder="S" maxLength={5} style={{ width: 100 }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="gyne_accession_prefix" label="Gyne Cytology">
              <Input placeholder="C" maxLength={5} style={{ width: 100 }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="nongyne_accession_prefix" label="Non-Gyne Cytology">
              <Input placeholder="N" maxLength={5} style={{ width: 100 }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="molecular_accession_prefix" label="Molecular">
              <Input placeholder="M" maxLength={5} style={{ width: 100 }} />
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
        <Text strong>Controlled Document No.</Text>
        <Text type="secondary" style={{ display: "block", marginBottom: 16, marginTop: 4 }}>
          Printed in the bottom-left corner of the form, on every page. Free text — enter
          it exactly as your quality system words it, e.g.{" "}
          <code>FM-PAT-025 แก้ไขครั้งที่ 01 วันที่บังคับใช้ 01/01/2569</code>. Leave blank
          to print no number.
        </Text>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="specimen_disposal_doc_no"
              label="ใบตรวจสอบและทำลายชิ้นเนื้อ (Specimen Disposal Checklist)"
            >
              <Input placeholder="e.g. FM-PAT-025 แก้ไขครั้งที่ 01" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="nongyne_specimen_disposal_doc_no"
              label="ใบตรวจสอบและทำลายสิ่งส่งตรวจ Non-Gyne (Non-Gyne Disposal Checklist)"
            >
              <Input placeholder="e.g. FM-CYT-011 แก้ไขครั้งที่ 01" />
            </Form.Item>
          </Col>
        </Row>
        <Divider />
        <Text strong>Non-Gyne Specimen Retention</Text>
        <Text type="secondary" style={{ display: "block", marginBottom: 16, marginTop: 4 }}>
          จำนวนวันหลังรายงานผลที่ต้องเก็บสิ่งส่งตรวจ non-gyne ไว้ก่อนทำลาย
          ระบบบังคับตามค่านี้จริง — เคสที่ยังไม่ครบกำหนด หรือยังค้าง Pending
          จะใส่ในใบตรวจสอบก่อนทำลายไม่ได้
        </Text>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="nongyne_specimen_retention_days"
              label="เก็บไว้อย่างน้อย (วันนับจากวันรายงานผล)"
            >
              <InputNumber min={0} style={{ width: "100%" }} placeholder="30" />
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
        <Form.Item
          name="cumulative_report_newest_first"
          label="Newest Round First"
          valuePropName="checked"
          style={{ marginTop: 16 }}
        >
          <Switch />
        </Form.Item>
        <Text type="secondary">
          On: most recent Addendum/Revised round shown first &nbsp;|&nbsp; Off: oldest round first (Surgical Pathology only)
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

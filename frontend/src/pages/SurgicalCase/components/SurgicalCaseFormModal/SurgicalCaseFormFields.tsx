import React from "react";
import {
  Form,
  Input,
  Select,
  DatePicker,
  Checkbox,
  Row,
  Col,
  Typography,
} from "antd";
import { FireOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import type { Hospital } from "../../../../types/hospital";
import type { Department } from "../../../../types/department";
import type { MedicalScheme } from "../../../../types/medicalScheme";
import type { User } from "../../../../types/user";

const { Option } = Select;
const { Text } = Typography;

interface SurgicalCaseFormFieldsProps {
  hospitals: Hospital[];
  departments: Department[];
  schemes: MedicalScheme[];
  pathologists: User[];
  editingId: number | null;
  form: FormInstance;
}

const SurgicalCaseFormFields: React.FC<SurgicalCaseFormFieldsProps> = ({
  hospitals,
  departments,
  schemes,
  pathologists,
  editingId,
  form,
}) => {
  return (
    <>
      {/* Row: HN / VN / AN / Scheme */}
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item name="hn" label="HN" rules={[{ required: true }]}>
            <Input placeholder="Hospital Number" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="vn" label="VN (Visit No.)">
            <Input placeholder="Visit Number" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="an" label="AN (Admission No.)">
            <Input placeholder="Admission Number" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="medical_scheme_id" label="Medical Scheme">
            <Select placeholder="Select Scheme">
              {schemes.map((s) => (
                <Option key={s.id} value={s.id}>
                  {s.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {/* Row: Lab No / Clinician / Department / Pathologist */}
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item name="lab_number" label="Lab No.">
            <Input placeholder="e.g., 612345" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="clinician_name" label="Requesting Clinician">
            <Input placeholder="Referring physician name" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="department_id" label="Department">
            <Select
              placeholder="Select department"
              showSearch
              optionFilterProp="children"
            >
              {departments.map((d) => (
                <Option key={d.id} value={d.id}>
                  {d.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="pathologist_id" label="Pathologist">
            <Select
              placeholder="Select pathologist"
              showSearch
              optionFilterProp="children"
            >
              {pathologists.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.report_name || p.full_name || p.username}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {/* Row: Clinical History / Diagnosis + Collection Date / Registration Date */}
      <Row gutter={16} align="bottom">
        <Col span={editingId ? 8 : 12}>
          <Form.Item
            name="clinical_diagnosis"
            label="Clinical History / Diagnosis"
          >
            <Input.TextArea
              rows={1}
              placeholder="Relevant clinical history, provisional diagnosis, etc."
            />
          </Form.Item>
        </Col>
        <Col span={editingId ? 8 : 12}>
          <Form.Item name="collect_at" label="Collection Date/Time">
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        {editingId && (
          <Col span={8}>
            <Form.Item name="registered_at" label="Registration Date">
              <DatePicker showTime style={{ width: "100%" }} disabled />
            </Form.Item>
          </Col>
        )}
      </Row>

      {/* Row: Express / Frozen / Fixation */}
      <Row gutter={16} align="bottom">
        <Col span={8}>
          <Form.Item name="is_express" valuePropName="checked" initialValue={false} label="Priority">
            <Checkbox
              style={{
                padding: "6px 14px",
                border: "1px solid #ffa39e",
                borderRadius: "6px",
                background: "#fff1f0",
                height: "36px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: "13px", color: "#cf1322", fontWeight: 600 }}>
                <FireOutlined style={{ marginRight: 4 }} /> Express
              </Text>
            </Checkbox>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="is_frozen_section" valuePropName="checked" initialValue={false} label=" ">
            <Checkbox
              style={{
                padding: "6px 14px",
                border: "1px solid #87e8de",
                borderRadius: "6px",
                background: "#e6fffb",
                height: "36px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: "13px", color: "#08979c", fontWeight: 600 }}>
                ❄ Frozen
              </Text>
            </Checkbox>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="is_extended_fix" valuePropName="checked" label="Fixation">
            <Checkbox
              style={{
                padding: "6px 14px",
                border: "1px solid #faad14",
                borderRadius: "6px",
                background: "#fffbe6",
                height: "36px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: "13px", color: "#d46b08" }}>
                ⏳ Ext. Fixation
              </Text>
            </Checkbox>
          </Form.Item>
        </Col>
      </Row>
    </>
  );
};

export default SurgicalCaseFormFields;

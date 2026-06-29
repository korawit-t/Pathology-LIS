import React from "react";
import {
  Form,
  Input,
  Select,
  DatePicker,
  Row,
  Col,
} from "antd";
import type { Hospital } from "../../../types/hospital";
import type { Department } from "../../../types/department";
import type { MedicalScheme } from "../../../types/medicalScheme";
import type { User } from "../../../types/user";

const { Option } = Select;

interface NongyneCaseFormFieldsProps {
  hospitals: Hospital[];
  departments: Department[];
  schemes: MedicalScheme[];
  staffs: {
    pathologists: User[];
    cytotechnologists: User[];
    specimenTypes: string[];
  };
  editingId: number | null;
}

const NongyneCaseFormFields: React.FC<NongyneCaseFormFieldsProps> = ({
  departments,
  schemes,
  staffs,
}) => {
  const { pathologists, cytotechnologists, specimenTypes } = staffs;

  return (
    <>
      {/* Row: HN / Scheme / Lab No / Clinician */}
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item name="hn" label="HN" rules={[{ required: true }]}>
            <Input placeholder="Hospital Number" />
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
        <Col span={6}>
          <Form.Item name="lab_number" label="Lab No.">
            <Input placeholder="e.g., 612345" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="clinician_name" label="Requesting Clinician">
            <Input placeholder="Requesting physician name" />
          </Form.Item>
        </Col>
      </Row>

      {/* Row: Department / Collection Date / Express / Specimen Type / Collection Site */}
      <Row gutter={16}>
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
        <Col span={8}>
          <Form.Item name="collect_at" label="Collection Date/Time">
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        <Col span={5}>
          <Form.Item
            name="specimen_type"
            label="Specimen Type"
            rules={[{ required: true }]}
          >
            <Select
              options={specimenTypes.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>
        </Col>
        <Col span={5}>
          <Form.Item name="collection_site" label="Collection Site">
            <Input placeholder="e.g. Right lobe, Ascitic fluid" />
          </Form.Item>
        </Col>
      </Row>

      {/* Row: Volume / Clinical History / Clinical Diagnosis */}
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item name="received_volume_ml" label="Received Volume (ml)">
            <Input placeholder="e.g. 50" />
          </Form.Item>
        </Col>
        <Col span={9}>
          <Form.Item name="clinical_history" label="Clinical History">
            <Input.TextArea
              rows={2}
              placeholder="Relevant treatment history and laboratory findings"
            />
          </Form.Item>
        </Col>
        <Col span={9}>
          <Form.Item name="clinical_diagnosis" label="Clinical Diagnosis">
            <Input.TextArea
              rows={2}
              placeholder="Preliminary clinical diagnosis from physician"
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Row: Cytotechnologist / Pathologist */}
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="cytotechnologist_id"
            label="Screened by (Cytotechnologist)"
          >
            <Select
              placeholder="Select Cytotechnologist"
              showSearch
              optionFilterProp="children"
              allowClear
            >
              {cytotechnologists.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.full_name || p.username}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="pathologist_id" label="Reported by (Pathologist)">
            <Select
              placeholder="Select Pathologist"
              showSearch
              optionFilterProp="children"
              allowClear
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
    </>
  );
};

export default NongyneCaseFormFields;

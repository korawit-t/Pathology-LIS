import React from "react";
import {
  Form,
  Input,
  Select,
  DatePicker,
  Row,
  Col,
  Checkbox,
} from "antd";
import type { Hospital } from "../../../types/hospital";
import type { Department } from "../../../types/department";
import type { MedicalScheme } from "../../../types/medicalScheme";
import type { User } from "../../../types/user";

const { Option } = Select;

interface GyneCytoFormFieldsProps {
  hospitals: Hospital[];
  departments: Department[];
  schemes: MedicalScheme[];
  staffs: User[];
  gyneSpecimenTypes: string[];
  editingId: number | null;
}

const GyneCytoFormFields: React.FC<GyneCytoFormFieldsProps> = ({
  hospitals,
  departments,
  schemes,
  staffs,
  gyneSpecimenTypes,
  editingId,
}) => {
  return (
    <>
      {/* Row 2: HN / Clinician / Department / Scheme */}
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item name="hn" label="HN" rules={[{ required: true }]}>
            <Input placeholder="Hospital Number" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item
            name="clinician_name"
            label="Clinician / Referring Doctor"
          >
            <Input placeholder="ชื่อแพทย์ผู้ส่งตรวจ" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="department_id" label="Department">
            <Select
              placeholder="เลือกแผนก"
              showSearch
              optionFilterProp="children"
              allowClear
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
          <Form.Item name="medical_scheme_id" label="Medical Scheme">
            <Select
              placeholder="สิทธิการรักษา"
              showSearch
              optionFilterProp="children"
              allowClear
            >
              {schemes.map((s) => (
                <Option key={s.id} value={s.id}>
                  {s.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {/* Row 3: Specimen / Collection Site / Collection Date / Express / LMP */}
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item
            name="specimen_type"
            label="Specimen Type"
            rules={[
              { required: true, message: "Please select specimen type" },
            ]}
          >
            <Select
              options={gyneSpecimenTypes.map((t) => ({
                value: t,
                label: t,
              }))}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="collection_site" label="Collection Site">
            <Select
              placeholder="Select collection site"
              allowClear
              options={[
                { value: "Vaginal", label: "Vaginal" },
                { value: "Cervical", label: "Cervical" },
                { value: "Endocervical", label: "Endocervical" },
                { value: "Cervical/Endocervical", label: "Cervical/Endocervical" },
              ]}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="collect_at" label="Collection Date">
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="last_menstrual_period" label="LMP Date">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </Col>
      </Row>

      {/* Row 4: Checkboxes + Hormone therapy + Clinical History */}
      <Row gutter={16}>
        <Col span={4}>
          <Form.Item
            name="is_postmenopausal"
            valuePropName="checked"
            label=" "
          >
            <Checkbox>Post-menopause</Checkbox>
          </Form.Item>
        </Col>
        <Col span={4}>
          <Form.Item name="is_pregnant" valuePropName="checked" label=" ">
            <Checkbox>Pregnant</Checkbox>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            name="hormone_therapy"
            label="Hormone Therapy / Contraception"
          >
            <Input placeholder="e.g., OCP, IUD, HRT" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            name="clinical_history"
            label="Clinical History / Findings"
          >
            <Input.TextArea
              rows={1}
              placeholder="Cervix appearance, previous abnormal Pap, etc."
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Row 5: Staff + Accession (when editing) */}
      <Row gutter={16}>
        <Col span={editingId ? 8 : 12}>
          <Form.Item
            name="cytotechnologist_id"
            label="Screened by (Cytotechnologist)"
          >
            <Select
              placeholder="เลือกนักเซลล์วิทยา"
              showSearch
              optionFilterProp="children"
            >
              {staffs
                .filter((s) => s.roles?.includes("cytotechnologist"))
                .map((s) => (
                  <Option key={s.id} value={s.id}>
                    {s.full_name}
                  </Option>
                ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={editingId ? 8 : 12}>
          <Form.Item
            name="pathologist_id"
            label="Reported by (Pathologist)"
          >
            <Select
              placeholder="เลือกพยาธิแพทย์"
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {staffs
                .filter((s) => s.roles?.includes("pathologist"))
                .map((s) => (
                  <Option key={s.id} value={s.id}>
                    {s.full_name}
                  </Option>
                ))}
            </Select>
          </Form.Item>
        </Col>
        {editingId && (
          <Col span={8}>
            <Form.Item name="accession_no" label="Accession No.">
              <Input
                disabled
                style={{ fontWeight: "bold", color: "black" }}
              />
            </Form.Item>
          </Col>
        )}
      </Row>
    </>
  );
};

export default GyneCytoFormFields;

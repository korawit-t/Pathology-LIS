import React from "react";
import { Form, Select, Button, Tooltip, Tag, Typography, Spin, Space } from "antd";
import {
  UserAddOutlined,
  CloudDownloadOutlined,
  ManOutlined,
  WomanOutlined,
  QuestionOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Patient } from "../../types/patient";
import type { Title } from "../../types/title";
import type { Hospital } from "../../types/hospital";

const { Text } = Typography;

const renderGenderIcon = (gender?: string) => {
  const g = gender?.toLowerCase();
  if (g === "male" || g === "ชาย") return <ManOutlined style={{ color: "#1890ff" }} />;
  if (g === "female" || g === "หญิง") return <WomanOutlined style={{ color: "#eb2f96" }} />;
  return <QuestionOutlined style={{ color: "#8c8c8c" }} />;
};

export interface PatientSearchFieldProps {
  patients: Patient[];
  titles: Title[];
  hospitals: Hospital[];
  isSearching: boolean;
  onSearch: (value: string) => void;
  onNewPatient: () => void;
  onHisSearch: () => void;
  onSelectHN: (e: React.MouseEvent, hnItem: string, patientId: number) => void;
}

const PatientSearchField: React.FC<PatientSearchFieldProps> = ({
  patients,
  titles,
  hospitals,
  isSearching,
  onSearch,
  onNewPatient,
  onHisSearch,
  onSelectHN,
}) => {
  const patientId = Form.useWatch("patient_id");
  const selectedPatient = patients.find((p) => p.id === patientId);

  return (
    <Form.Item label="Search Patient (Name / HN / CID)" required>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Space.Compact style={{ width: "100%" }}>
          <Form.Item
            name="patient_id"
            noStyle
            rules={[{ required: true, message: "Please select a patient" }]}
          >
            <Select
              showSearch
              placeholder="Search patient..."
              filterOption={false}
              onSearch={onSearch}
              notFoundContent={isSearching ? <Spin size="small" /> : "No results found"}
              options={patients.map((p) => ({
                label: `${p.title?.title || titles.find((t) => t.id === p.title_id)?.title || ""}${p.name}${p.ln ? " " + p.ln : ""}`,
                value: p.id,
                cid: p.cid,
                hn: p.hn,
              }))}
              optionRender={(option) => (
                <div style={{ padding: "4px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Text strong>{option.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>CID: {option.data.cid}</Text>
                  </div>
                  {option.data.hn && (
                    <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {[...new Set(option.data.hn.split(", ").map((s: string) => s.trim()))]
                        .filter(Boolean)
                        .map((item: string, i: number) => (
                          <Tag
                            key={`${item}-${i}`}
                            color="blue"
                            style={{ cursor: "pointer", margin: 0, borderStyle: "dashed" }}
                            onClick={(e) => onSelectHN(e, item, option.value as number)}
                          >
                            {item}
                          </Tag>
                        ))}
                    </div>
                  )}
                </div>
              )}
            />
          </Form.Item>
          <Tooltip title="Add New Patient">
            <Button icon={<UserAddOutlined />} onClick={onNewPatient} />
          </Tooltip>
          <Tooltip title="Pull from HIS">
            <Button
              icon={<CloudDownloadOutlined />}
              onClick={onHisSearch}
              style={{ backgroundColor: "#f0f5ff", color: "#1d39c4", borderColor: "#adc6ff" }}
            >
              HIS
            </Button>
          </Tooltip>
        </Space.Compact>

        {selectedPatient && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 6,
              whiteSpace: "nowrap", backgroundColor: "#f0f2f5",
              padding: "2px 8px", borderRadius: 6, height: 32,
            }}
          >
            <Tag
              color={
                selectedPatient.gender?.toLowerCase() === "female" || selectedPatient.gender === "หญิง"
                  ? "magenta"
                  : selectedPatient.gender?.toLowerCase() === "male" || selectedPatient.gender === "ชาย"
                  ? "blue"
                  : "default"
              }
              bordered={false}
              icon={renderGenderIcon(selectedPatient.gender)}
              style={{ margin: 0, borderRadius: 4 }}
            >
              {selectedPatient.gender || "N/A"}
            </Tag>
            <Text strong style={{ color: "#595959", fontSize: 14 }}>
              {selectedPatient.birth_date
                ? dayjs().diff(dayjs(selectedPatient.birth_date), "year") + "y"
                : "No DOB"}
            </Text>
          </div>
        )}
      </div>
    </Form.Item>
  );
};

export default PatientSearchField;

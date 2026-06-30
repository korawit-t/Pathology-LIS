import React from "react";
import {
  Row,
  Col,
  Form,
  DatePicker,
  Select,
  Button,
  Typography,
  Space,
  Tooltip,
} from "antd";
import { SaveOutlined, CheckCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import StyledCard from "../../../../components/Layout/StyledCard";
import type { User } from "../../../../types/user";

const { Option } = Select;
const { Text } = Typography;

interface GrossFinalizeSectionProps {
  users: User[];
  onSaveDraft?: () => void;
}

const GrossFinalizeSection: React.FC<GrossFinalizeSectionProps> = ({
  users,
  onSaveDraft,
}) => {
  return (
    <div>
      <Row gutter={24} align="bottom">
        <Col xs={24} lg={18}>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="gross_at"
                label={<Text strong>Grossing Date/Time</Text>}
                rules={[{ required: true }]}
              >
                <DatePicker
                  showTime
                  style={{ width: "100%" }}
                  format="YYYY-MM-DD HH:mm"
                  placeholder="เลือกวัน/เวลา"
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="gross_examiner_id"
                label={
                  <Space size={4}>
                    <Text strong>Gross Examiner</Text>
                    <Tooltip title="Examiner and assistant names will be automatically included in the gross description of the final report.">
                      <InfoCircleOutlined style={{ fontSize: 12, color: "#1890ff", cursor: "help" }} />
                    </Tooltip>
                  </Space>
                }
                rules={[{ required: true, message: "กรุณาเลือกผู้ตรวจ!" }]}
              >
                <Select
                  placeholder="Select Examiner"
                  showSearch
                  optionFilterProp="children"
                >
                  {users.filter((u) => !u.roles?.includes("clinician")).map((u) => (
                    <Option key={u.id} value={u.id}>
                      {u.report_name || u.full_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="gross_assistant_id"
                label={<Text strong>Assistant</Text>}
              >
                <Select
                  placeholder="Select Assistant"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                >
                  {users.filter((u) => !u.roles?.includes("clinician")).map((u) => (
                    <Option key={u.id} value={u.id}>
                      {u.report_name || u.full_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="pathologist_id"
                label={<Text strong>Assign Pathologist</Text>}
              >
                <Select
                  placeholder="Select Pathologist"
                  showSearch
                  optionFilterProp="children"
                >
                  {users
                    .filter((u) => u.roles?.includes("pathologist"))
                    .map((u) => (
                      <Option key={u.id} value={u.id}>
                        {u.report_name || u.full_name}
                      </Option>
                    ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Col>

        <Col xs={24} lg={6}>
          <Form.Item label=" " colon={false}>
          <div style={{ display: "flex", gap: 8 }}>
            {onSaveDraft && (
              <Button
                size="large"
                icon={<SaveOutlined />}
                onClick={onSaveDraft}
                style={{
                  flex: 1,
                  height: 50,
                  fontSize: 15,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: "transparent",
                  color: "#1890ff",
                  border: "1px dashed #1890ff",
                }}
              >
                Save Draft
              </Button>
            )}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              icon={<CheckCircleOutlined />}
              style={{
                flex: 2,
                height: 50,
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 8,
                background: "#52c41a",
                borderColor: "#52c41a",
                boxShadow: "0 4px 10px rgba(82, 196, 26, 0.2)",
              }}
            >
              Finish & Save All
            </Button>
          </div>
          </Form.Item>
        </Col>
      </Row>
    </div>
  );
};

export default GrossFinalizeSection;

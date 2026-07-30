import React, { useMemo } from "react";
import { Col, Form, Select, Space, Switch, Typography, Popover, Table, Tag, Input } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import StyledCard from "../../../components/Layout/StyledCard";
import type { GyneDiagnosisCategory } from "../../../types/gyne-diagnosis";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface GyneCategoryCardProps {
  mainCategories: GyneDiagnosisCategory[];
  subCategories: GyneDiagnosisCategory[];
  selectedCat1: number | null | undefined;
  isEditorLocked: boolean;
  isRevision: boolean;
  isAbnormal: boolean;
  setIsAbnormal: (value: boolean) => void;
  requiresPathologistReview: boolean;
}

const GyneCategoryCard: React.FC<GyneCategoryCardProps> = ({
  mainCategories,
  subCategories,
  selectedCat1,
  isEditorLocked,
  isRevision,
  isAbnormal,
  setIsAbnormal,
  requiresPathologistReview,
}) => {
  const form = Form.useFormInstance();

  const sortedMainCategories = useMemo(
    () => [...mainCategories].sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "")),
    [mainCategories],
  );

  const resultTypeHelpContent = (
    <div style={{ maxWidth: 380 }}>
      <Paragraph style={{ marginBottom: 8, fontSize: 12 }}>
        The case will be <b>forced to route to a Pathologist</b> (via the "Send to Pathologist"
        button) when either condition is met:
      </Paragraph>
      <ul style={{ paddingLeft: 18, marginBottom: 12, fontSize: 12 }}>
        <li>
          Adequacy = <b>Unsatisfactory</b>
        </li>
        <li>Selected Diagnosis Category is in the Abnormal group (code starts with 3)</li>
      </ul>
      <Table
        size="small"
        pagination={false}
        dataSource={sortedMainCategories}
        rowKey="id"
        scroll={{ y: 260 }}
        columns={[
          { title: "Code", dataIndex: "code", key: "code", width: 55 },
          { title: "Category", dataIndex: "text", key: "text" },
          {
            title: "Result",
            key: "result",
            width: 90,
            render: (_: unknown, c: { code: string }) =>
              c.code?.startsWith("3") ? <Tag color="orange">Abnormal</Tag> : <Tag color="green">NILM</Tag>,
          },
        ]}
      />
    </div>
  );

  return (
    <Col xs={24} lg={12} style={{ display: "flex", flexDirection: "column" }}>
      <StyledCard
        size="small"
        title={
          <Title
            level={5}
            style={{
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "1.2px",
              fontWeight: 600,
            }}
          >
            Diagnosis Category
          </Title>
        }
        style={{ flex: 1 }}
      >
        <Form.Item name="category_1_id" label="Main Category">
          <Select
            placeholder="Select main category"
            onChange={() => form.setFieldValue("category_2_id", null)}
            disabled={isEditorLocked}
            allowClear
            size="large"
          >
            {mainCategories.map((c) => (
              <Select.Option key={c.id} value={c.id}>
                <b>{c.code}</b> — {c.text}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="category_2_id" label="Sub Category" dependencies={["category_1_id"]}>
          <Select
            placeholder="Select sub category (optional)"
            allowClear
            disabled={!selectedCat1 || isEditorLocked}
            size="large"
          >
            {subCategories.map((c) => (
              <Select.Option key={c.id} value={c.id}>
                <b>{c.code}</b> — {c.text}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {!isRevision && (
          <Form.Item
            label={
              <Space size={4}>
                <span>Result Type</span>
                <Popover
                  content={resultTypeHelpContent}
                  title="Pathologist Routing Criteria"
                  trigger="click"
                  placement="rightTop"
                >
                  <QuestionCircleOutlined style={{ color: "#8c8c8c", cursor: "pointer" }} />
                </Popover>
              </Space>
            }
          >
            <Space>
              <Switch
                checked={isAbnormal}
                onChange={setIsAbnormal}
                checkedChildren="Abnormal"
                unCheckedChildren="NILM"
                disabled={isEditorLocked}
                style={{ background: isAbnormal ? "#fa8c16" : undefined }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {requiresPathologistReview
                  ? "Will route to pathologist for review"
                  : "Normal result — will finalize after sign-off"}
              </Text>
            </Space>
          </Form.Item>
        )}

        <Form.Item name="interpretation" label="Interpretation">
          <TextArea rows={2} placeholder="Additional diagnostic details..." disabled={isEditorLocked} />
        </Form.Item>
      </StyledCard>
    </Col>
  );
};

export default GyneCategoryCard;

import React, { useEffect } from "react";
import {
  Form,
  Select,
  Button,
  Typography,
  Tag,
  Tooltip,
  Input,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import StyledCard from "../../../../components/Layout/StyledCard";
import type { FormInstance } from "antd";
import type { User } from "../../../../types/user";

const { Title } = Typography;

interface PathologistDiagnosisManagerProps {
  form: FormInstance;
  pathologists: User[];
  defaultPathologistId?: number;
  isLocked?: boolean;
  namePath: (string | number)[];
  settings?: { require_all_pathologists_sign?: boolean };
}

const PathologistDiagnosisManager: React.FC<PathologistDiagnosisManagerProps> = ({
  form,
  pathologists,
  defaultPathologistId,
  isLocked,
  namePath,
  settings,
}) => {
  const isRequireAllSign = settings?.require_all_pathologists_sign ?? true;

  useEffect(() => {
    const currentSigners = form.getFieldValue(namePath);
    if ((!currentSigners || currentSigners.length === 0) && defaultPathologistId && !isLocked) {
      form.setFieldValue(namePath, [{ user_id: defaultPathologistId, role: "primary", signed_at: null }]);
    }
  }, [defaultPathologistId, isLocked, namePath, form]);

  return (
    <StyledCard
      size="small"
      style={{
        height: "100%",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #e8e8e8",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
      }}
      styles={{ body: { padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column" } }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: "#262626", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600 }}>
          <UserOutlined style={{ marginRight: 8, color: "#1890ff" }} />
          Signatories
        </Title>
        <Tooltip
          title={
            isRequireAllSign
              ? "All listed pathologists must sign before finalizing."
              : "Only the Primary Pathologist's signature is required."
          }
        >
          <Tag
            color={isRequireAllSign ? "orange" : "blue"}
            icon={<InfoCircleOutlined />}
            style={{ borderRadius: 10, fontSize: 10, cursor: "help" }}
          >
            {isRequireAllSign ? "REQUIRE ALL" : "PRIMARY ONLY"}
          </Tag>
        </Tooltip>
      </div>

      {/* Signer rows */}
      <Form.List name={namePath}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }) => {
              const signerData = form.getFieldValue([...namePath, name]);
              const isSigned = !!signerData?.signed_at;
              const isOwner = signerData?.user_id === defaultPathologistId;

              return (
                <React.Fragment key={key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    marginBottom: 2,
                    background: isSigned ? "#f6ffed" : "#fafafa",
                    borderRadius: 8,
                    border: `1px solid ${isSigned ? "#b7eb8f" : "#f0f0f0"}`,
                  }}
                >
                  {/* Name */}
                  <Form.Item
                    {...restField}
                    name={[name, "user_id"]}
                    rules={[{ required: true, message: "Required" }]}
                    style={{ marginBottom: 0, flex: 1 }}
                  >
                    <Select
                      showSearch
                      placeholder="Select pathologist"
                      optionFilterProp="label"
                      disabled={isLocked || isSigned}
                      variant="borderless"
                      style={{ fontWeight: isSigned ? 500 : 400 }}
                      options={pathologists.map((p) => ({ value: p.id, label: p.full_name }))}
                    />
                  </Form.Item>

                  {/* Role */}
                  <Form.Item
                    {...restField}
                    name={[name, "role"]}
                    style={{ marginBottom: 0, width: 110 }}
                  >
                    <Select disabled={isLocked || isSigned} variant="borderless" size="small">
                      <Select.Option value="primary">Primary</Select.Option>
                      <Select.Option value="co-signer">Co-Signer</Select.Option>
                      <Select.Option value="resident">Resident</Select.Option>
                      <Select.Option value="consultant">Consultant</Select.Option>
                    </Select>
                  </Form.Item>

                  {/* Status icon */}
                  {isSigned ? (
                    <Tooltip title={`Signed: ${new Date(signerData.signed_at).toLocaleString()}`}>
                      <CheckCircleFilled style={{ color: "#52c41a", fontSize: 16, flexShrink: 0 }} />
                    </Tooltip>
                  ) : (
                    <ClockCircleOutlined style={{ color: "#d9d9d9", fontSize: 16, flexShrink: 0 }} />
                  )}

                  {/* Delete — not for owner */}
                  <div style={{ width: 28, flexShrink: 0 }}>
                    {!isSigned && !isLocked && !isOwner && (
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                      />
                    )}
                  </div>
                </div>

                {/* Consult note — only for non-primary signers (Fix #2) */}
                {signerData?.role && signerData.role !== "primary" && (
                  <Form.Item
                    {...restField}
                    name={[name, "consult_note"]}
                    style={{ marginBottom: 6, marginTop: 2 }}
                  >
                    <Input.TextArea
                      rows={1}
                      autoSize={{ minRows: 1, maxRows: 3 }}
                      disabled={isLocked}
                      placeholder="Consult note / question for this signer (optional)"
                      style={{ fontSize: 12, color: "#595959" }}
                      variant="borderless"
                    />
                  </Form.Item>
                )}
                </React.Fragment>
              );
            })}

            {!isLocked && (
              <Button
                type="dashed"
                onClick={() => add({ role: "co-signer", signed_at: null })}
                block
                icon={<PlusOutlined />}
                style={{ marginTop: 8, borderRadius: 8 }}
              >
                Add Pathologist
              </Button>
            )}
          </>
        )}
      </Form.List>
    </StyledCard>
  );
};

export default PathologistDiagnosisManager;

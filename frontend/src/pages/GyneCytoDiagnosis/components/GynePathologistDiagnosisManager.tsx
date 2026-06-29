import React, { useEffect } from "react";
import {
  Form,
  Select,
  Button,
  Typography,
  Tag,
  Col,
  Row,
  Tooltip,
  Divider,
  Input,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  CheckCircleFilled,
  InfoCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import StyledCard from "../../../components/Layout/StyledCard";
import type { FormInstance } from "antd";
import type { SystemSetting } from "../../../types/system";

const { Text, Title } = Typography;

interface GynePathologistDiagnosisManagerProps {
  form: FormInstance;
  pathologists: { id: number; full_name?: string }[];
  defaultPathologistId?: number;
  defaultSigners?: {
    user_id: number;
    role: string;
    signed_at: string | null;
  }[];
  isLocked?: boolean;
  namePath: (string | number)[];
  settings?: Partial<SystemSetting>;
  hideCT?: boolean;
}

const GynePathologistDiagnosisManager: React.FC<
  GynePathologistDiagnosisManagerProps
> = ({
  form,
  pathologists,
  defaultPathologistId,
  defaultSigners,
  isLocked,
  namePath,
  settings,
  hideCT,
}) => {
  // Logic from surgical: use setting or default to true
  const isRequireAllSign = settings?.require_all_pathologists_sign ?? true;

  // Use useWatch locally to subscribe to changes without re-renders parent
  const signersValue = Form.useWatch(namePath, form);

  return (
    <StyledCard
      size="small"
      style={{ marginBottom: 16 }}
      styles={{ body: { padding: "16px 20px" } }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Title
          level={5}
          style={{
            margin: 0,
            color: "#262626",
            textTransform: "uppercase",
            letterSpacing: "1.2px",
            fontWeight: 600,
          }}
        >
          <UserOutlined style={{ marginRight: 8 }} />
          Signatories
        </Title>
        <Tooltip
          title={
            isRequireAllSign
              ? "System Policy: All listed Signatories must sign before the report can be finalized."
              : "System Policy: Only the Primary Signer's signature is required."
          }
        >
          <Tag
            color={isRequireAllSign ? "orange" : "blue"}
            icon={<InfoCircleOutlined />}
            style={{ borderRadius: 10, fontSize: 10, cursor: "help" }}
          >
            {isRequireAllSign ? "REQUIRE ALL SIGN" : "PRIMARY ONLY"}
          </Tag>
        </Tooltip>
      </div>

      {/* Table Header Labels */}
      <Row
        gutter={8}
        style={{ marginBottom: 8, marginTop: 8, padding: "0 8px" }}
      >
        <Col flex="auto">
          <Text type="secondary" style={{ fontSize: "12px" }}>
            NAME
          </Text>
        </Col>
        <Col flex="130px">
          <Text type="secondary" style={{ fontSize: "12px" }}>
            ROLE
          </Text>
        </Col>
        <Col flex="100px" style={{ textAlign: "center" }}>
          <Text type="secondary" style={{ fontSize: "12px" }}>
            STATUS
          </Text>
        </Col>
        <Col flex="40px"></Col>
      </Row>

      <Form.List name={namePath}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }) => {
              // Use signersValue prop if available for reactivity
              const signerData = signersValue
                ? signersValue[name]
                : form.getFieldValue([...namePath, name]);
              const isSigned = !!signerData?.signed_at;

              // Hide CT only if not signed. If signed, show it (read-only)
              const isHidden =
                hideCT &&
                !isSigned &&
                (signerData?.role === "cytotechnologist" ||
                  signerData?.role === "co-sign cytotechnologist");

              return (
                <Row
                  key={key}
                  gutter={8}
                  style={{
                    marginBottom: 6,
                    background: isSigned ? "#f6ffed" : "#fff",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    border: isSigned
                      ? "1px solid #b7eb8f"
                      : "1px solid #f0f0f0",
                    display: isHidden ? "none" : "flex",
                  }}
                  align="middle"
                >
                  {/* Select Pathologist */}
                  <Col flex="auto">
                    <Form.Item
                      {...restField}
                      name={[name, "user_id"]}
                      rules={[{ required: true, message: "Required" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        showSearch
                        placeholder="Select Pathologist"
                        optionFilterProp="children"
                        disabled={isLocked || isSigned}
                        variant="borderless"
                        style={{
                          width: "100%",
                          fontWeight: isSigned ? 500 : 400,
                        }}
                      >
                        {pathologists.map((p) => (
                          <Select.Option key={p.id} value={p.id}>
                            {p.full_name}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>

                  {/* Select Role */}
                  <Col flex="130px">
                    <Form.Item
                      {...restField}
                      name={[name, "role"]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        disabled={isLocked || isSigned}
                        variant="borderless"
                      >
                        <Select.Option value="pathologist">
                          Pathologist
                        </Select.Option>
                        <Select.Option value="co-sign pathologist">
                          Co-sign Pathologist
                        </Select.Option>
                        {!hideCT && (
                          <>
                            <Select.Option value="co-sign cytotechnologist">
                              Co-sign Cytotechnologist
                            </Select.Option>
                            <Select.Option value="cytotechnologist">
                              Cytotechnologist
                            </Select.Option>
                          </>
                        )}
                      </Select>
                    </Form.Item>
                    {/* Hidden signed_at to ensure it persists in form values */}
                    <Form.Item
                      {...restField}
                      name={[name, "signed_at"]}
                      style={{ display: "none" }}
                    >
                      <Input />
                    </Form.Item>
                  </Col>

                  {/* Status Tag */}
                  <Col flex="100px" style={{ textAlign: "center" }}>
                    {isSigned ? (
                      <Tooltip
                        title={`Signed: ${new Date(
                          signerData.signed_at,
                        ).toLocaleString()}`}
                      >
                        <Tag
                          color="success"
                          icon={<CheckCircleFilled />}
                          style={{ marginRight: 0 }}
                        >
                          SIGNED
                        </Tag>
                      </Tooltip>
                    ) : (
                      <Tag
                        color="default"
                        icon={<ClockCircleOutlined />}
                        style={{ marginRight: 0 }}
                      >
                        PENDING
                      </Tag>
                    )}
                  </Col>

                  {/* Delete Button */}
                  <Col flex="40px" style={{ textAlign: "right" }}>
                    {!isSigned &&
                      !isLocked &&
                      signerData?.user_id !== defaultPathologistId && (
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                        />
                      )}
                  </Col>

                  {/* Consult note — only for non-primary signers (Fix #2) */}
                  {signerData?.role &&
                    signerData.role !== "pathologist" &&
                    signerData.role !== "cytotechnologist" && (
                      <Col span={24} style={{ paddingTop: 2 }}>
                        <Form.Item
                          {...restField}
                          name={[name, "consult_note"]}
                          style={{ marginBottom: 0 }}
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
                      </Col>
                    )}
                </Row>
              );
            })}

            {!isLocked && (
              <Button
                type="dashed"
                onClick={() => add({ role: "co-signer", signed_at: null })}
                block
                icon={<PlusOutlined />}
                style={{ marginTop: 8, borderRadius: "8px" }}
              >
                Add Pathologist
              </Button>
            )}
          </>
        )}
      </Form.List>

      <Divider style={{ margin: "12px 0" }} />

      {defaultPathologistId && (
        <div
          style={{
            fontSize: "12px",
            color: "#8c8c8c",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <InfoCircleOutlined style={{ color: "#eb2f96" }} />
          <span>
            <b>Assigned Case Owner:</b>{" "}
            {pathologists.find((p) => p.id === defaultPathologistId)
              ?.full_name || "Unknown"}
          </span>
        </div>
      )}
    </StyledCard>
  );
};

export default GynePathologistDiagnosisManager;

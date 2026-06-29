import React, { useEffect, useState } from "react";
import {
  Tag, Button, Typography, Space, Divider, Popconfirm, Select, message, Spin,
} from "antd";
import { CommentOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { InternalConsult, ConsultCaseType } from "../../types/internalConsult";
import InternalConsultService from "../../services/internalConsultService";
import ConsultRespondModal from "./ConsultRespondModal";
import logger from "../../utils/logger";

const { Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  pending: "orange",
  responded: "blue",
  closed: "default",
};

interface Props {
  caseType: ConsultCaseType;
  reportId: number;
  currentUserId?: number;
  refreshKey?: number;
}

const ConsultHistorySection: React.FC<Props> = ({ caseType, reportId, currentUserId, refreshKey }) => {
  const [consults, setConsults] = useState<InternalConsult[]>([]);
  const [loading, setLoading] = useState(false);
  const [respondTarget, setRespondTarget] = useState<InternalConsult | null>(null);
  const [promoteRole, setPromoteRole] = useState<string>("co-signer");

  const load = async () => {
    setLoading(true);
    try {
      const data = await InternalConsultService.getForReport(caseType, reportId);
      setConsults(data);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [caseType, reportId, refreshKey]);

  const handleClose = async (id: number) => {
    try {
      await InternalConsultService.close(id);
      message.success("Consult closed.");
      load();
    } catch (err) {
      logger.error(err);
      message.error("Failed to close consult.");
    }
  };

  const handlePromote = async (consult: InternalConsult) => {
    try {
      await InternalConsultService.promote(consult.id, { role: promoteRole });
      message.success("Consultant added as co-signer.");
      load();
    } catch (err: any) {
      logger.error(err);
      message.error(err?.response?.data?.detail || "Failed to promote.");
    }
  };

  if (consults.length === 0 && !loading) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Divider style={{ fontSize: 13, color: "#8c8c8c", margin: "12px 0" }}>
        <CommentOutlined style={{ marginRight: 6 }} />
        Internal Consults
      </Divider>

      {loading ? <Spin size="small" /> : consults.map((c) => (
        <div
          key={c.id}
          style={{
            border: "1px solid #f0f0f0",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 10,
            background: "#fafafa",
          }}
        >
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Space>
              <Text strong style={{ fontSize: 13 }}>{c.requester?.full_name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>→</Text>
              <Text style={{ fontSize: 13 }}>{c.consultant?.full_name}</Text>
              <Tag color={STATUS_COLOR[c.status]}>{c.status.toUpperCase()}</Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {dayjs(c.created_at).format("DD/MM/YY HH:mm")}
            </Text>
          </Space>

          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Question:</Text>
            <div style={{ fontSize: 13, marginTop: 2 }}>{c.reason}</div>
          </div>

          {c.opinion && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#e6f4ff", borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Opinion:</Text>
              <div style={{ fontSize: 13, marginTop: 2 }}>{c.opinion}</div>
            </div>
          )}

          {c.promoted_to_signer && (
            <Tag color="green" style={{ marginTop: 8 }}>Promoted to co-signer</Tag>
          )}

          <Space style={{ marginTop: 10 }} size={8}>
            {c.status === "pending" && c.consultant_id === currentUserId && (
              <Button size="small" type="primary" ghost onClick={() => setRespondTarget(c)}>
                Respond
              </Button>
            )}
            {c.status === "responded" && !c.promoted_to_signer && c.requester_id === currentUserId && (
              <Popconfirm
                title={
                  <div>
                    <div style={{ marginBottom: 8 }}>Promote to co-signer with role:</div>
                    <Select
                      size="small"
                      value={promoteRole}
                      onChange={setPromoteRole}
                      style={{ width: 160 }}
                      options={[
                        { value: "co-signer", label: "Co-signer" },
                        { value: "consultant", label: "Consultant" },
                        { value: "resident", label: "Resident" },
                      ]}
                    />
                  </div>
                }
                onConfirm={() => handlePromote(c)}
                okText="Promote"
              >
                <Button size="small" type="primary">Promote to Co-signer</Button>
              </Popconfirm>
            )}
            {c.status !== "closed" && c.requester_id === currentUserId && (
              <Popconfirm title="Close this consult?" onConfirm={() => handleClose(c.id)} okText="Close">
                <Button size="small" danger type="text">Close</Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      ))}

      <ConsultRespondModal
        open={respondTarget !== null}
        consult={respondTarget}
        onClose={() => setRespondTarget(null)}
        onSuccess={load}
      />
    </div>
  );
};

export default ConsultHistorySection;

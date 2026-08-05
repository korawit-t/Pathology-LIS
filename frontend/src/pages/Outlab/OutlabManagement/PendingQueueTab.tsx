import React, { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Modal,
  Select,
  Divider,
  Input,
} from "antd";
import {
  SendOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import api from "../../../services/httpClient";
import SurgicalBlockService from "../../../services/surgicalBlockService";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import { useAuth } from "../../../hooks/useAuth";
import { useCaseInfoByAccession } from "../../../hooks/useCaseInfoByAccession";
import BlockHistoryDrawer from "../../SurgicalBlock/components/BlockHistoryDrawer";
import { formatPatientName } from "../../../utils/patientName";
import type { OutlabBlock, CaseInfo, ExternalLab } from "./types";

const { Text } = Typography;

interface PendingQueueTabProps {
  onSent?: () => void;
}

export const PendingQueueTab: React.FC<PendingQueueTabProps> = ({ onSent }) => {
  const { user } = useAuth();
  const { resolveCaseInfo } = useCaseInfoByAccession();
  const [blocks, setBlocks] = useState<OutlabBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [destinationLab, setDestinationLab] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [externalLabs, setExternalLabs] = useState<ExternalLab[]>([]);
  const [historyBlock, setHistoryBlock] = useState<{ id: number; block_code?: string; accession_no?: string } | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [caseMap, setCaseMap] = useState<Record<string, CaseInfo>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      // Filtered server-side (has_pending_outlab) rather than "most recent 200
      // blocks, then filter client-side" — that older approach silently
      // dropped cases where an outlab IHC was ordered on a block created long
      // before the 200 newest blocks in the system (e.g. additional immuno
      // ordered after initial workup).
      const res = await SurgicalBlockService.getBlocks({ has_pending_outlab: true });
      const data: OutlabBlock[] = res.items || (Array.isArray(res) ? res : []);
      const outlabBlocks = data.filter((block) => {
        if (!block.stains || !Array.isArray(block.stains)) return false;
        return block.stains.some(
          (s) => s.test?.is_external === true && s.status === "pending"
        );
      });
      setBlocks(outlabBlocks);

      const accNos = outlabBlocks.map((b) => b.accession_no);
      const caseByAcc = await resolveCaseInfo(accNos);
      const map: Record<string, CaseInfo> = {};
      Object.entries(caseByAcc).forEach(([acc, c]) => {
        const today = dayjs();
        const age = c.patient?.birth_date
          ? today.diff(dayjs(c.patient.birth_date), "year")
          : null;
        map[acc] = {
          hn: c.hn || "-",
          patient_name: formatPatientName(c.patient),
          age,
          scheme: c.medical_scheme?.name || "-",
          hospital: c.hospital?.name || "-",
        };
      });
      setCaseMap(map);
    } catch {
      message.error("Failed to load block data");
    } finally {
      setLoading(false);
    }
  };

  const fetchExternalLabs = async () => {
    try {
      const res = await api.get("/external-labs", { params: { active_only: true } });
      setExternalLabs(res.data);
    } catch {
      // Intentionally silent — the destination-lab dropdown just stays empty;
      // not critical enough to interrupt the dispatch flow with an error toast.
    }
  };

  useEffect(() => {
    fetchData();
    fetchExternalLabs();
  }, []);

  const selectedBlocks = blocks.filter((b) => selectedRowKeys.includes(b.id));
  const selectedStainItems = selectedBlocks.flatMap((b) =>
    (b.stains || [])
      .filter((s) => s.test?.is_external === true && s.status === "pending")
      .map((s) => ({
        blockLabel: `${b.specimen_label || ""}${b.block_no || ""}`,
        accessionNo: b.accession_no,
        stainName: s.test?.name || "Unknown",
        stainId: s.id,
      }))
  );

  const handleCreateRun = async () => {
    if (!destinationLab) {
      message.warning("Please select a destination lab");
      return;
    }
    if (selectedStainItems.length === 0) {
      message.warning("No stain items selected");
      return;
    }
    setSubmitting(true);
    try {
      await SurgicalBlockStainService.createOutlabRun({
        destination_lab: destinationLab,
        stain_ids: selectedStainItems.map((i) => i.stainId),
        tracking_number: trackingNumber || undefined,
      });
      message.success("Outlab run created successfully");
      setIsModalVisible(false);
      setDestinationLab(null);
      setTrackingNumber("");
      setSelectedRowKeys([]);
      fetchData();
      onSent?.();
    } catch {
      message.error("Failed to create outlab run");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<OutlabBlock> = [
    {
      title: "Case / Block",
      key: "block_info",
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 15 }}>
            {record.accession_no || record.specimen?.accession_no}
          </Text>
          <Tag color="cyan">
            {record.specimen_label}
            {record.block_no}
          </Tag>
          {record.is_decal && <Tag color="volcano">Decal</Tag>}
        </Space>
      ),
    },
    {
      title: "Patient",
      key: "patient_info",
      width: 180,
      render: (_, record) => {
        const info = caseMap[record.accession_no || ""] || ({} as Partial<CaseInfo>);
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>{info.patient_name || "-"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>HN: {info.hn || "-"}</Text>
            {info.age != null && <Text type="secondary" style={{ fontSize: 12 }}>Age {info.age} yrs</Text>}
          </Space>
        );
      },
    },
    {
      title: "Scheme / Hospital",
      key: "scheme_hospital",
      width: 150,
      render: (_, record) => {
        const info = caseMap[record.accession_no || ""] || ({} as Partial<CaseInfo>);
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12 }}>{info.scheme || "-"}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{info.hospital || "-"}</Text>
          </Space>
        );
      },
    },
    {
      title: "Order Date",
      key: "order_date",
      width: 120,
      render: (_, record) => {
        const stains = (record.stains || []).filter(
          (s) => s.test?.is_external === true && s.status === "pending"
        );
        const dates = stains.map((s) => s.created_at).filter(Boolean).sort();
        const date = dates[0];
        return date ? (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {dayjs(date).format("DD/MM/YYYY")}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: "Specimen",
      key: "specimen_name",
      render: (_, record) => (
        <Text type="secondary">{record.specimen_name || "-"}</Text>
      ),
    },
    {
      title: "Outlab Stains (pending)",
      key: "outlab_items",
      render: (_, record) => {
        const stains = (record.stains || []).filter(
          (s) => s.test?.is_external === true && s.status === "pending"
        );
        return (
          <Space wrap size={4}>
            {stains.map((s) => (
              <Tag key={s.id} color="purple">
                {s.test?.name || "Unknown"}
                {s.test?.category ? ` (${s.test.category})` : ""}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "",
      key: "history",
      width: 48,
      render: (_, record) => (
        <Button
          type="text"
          icon={<HistoryOutlined style={{ color: "#8c8c8c" }} />}
          size="small"
          title="Block Timeline"
          onClick={(e) => {
            e.stopPropagation();
            setHistoryBlock({
              id: record.id,
              block_code: record.block_code || `${record.specimen_label || ""}${record.block_no || ""}`,
              accession_no: record.accession_no,
            });
          }}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Refresh
          </Button>
          {selectedRowKeys.length > 0 && (
            <Text type="secondary">{selectedRowKeys.length} block(s) selected / {selectedStainItems.length} stain(s)</Text>
          )}
        </Space>
        <Button
          type="primary"
          icon={<SendOutlined />}
          disabled={selectedRowKeys.length === 0}
          onClick={() => setIsModalVisible(true)}
        >
          Send Outlab ({selectedRowKeys.length})
        </Button>
      </div>

      <Table
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        columns={columns}
        dataSource={blocks}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
        locale={{ emptyText: "No items pending outlab dispatch" }}
      />

      <BlockHistoryDrawer
        open={!!historyBlock}
        onClose={() => setHistoryBlock(null)}
        blockId={historyBlock?.id ?? null}
        blockCode={historyBlock?.block_code}
        accessionNo={historyBlock?.accession_no}
      />

      <Modal
        title="Confirm Outlab Dispatch"
        open={isModalVisible}
        onOk={handleCreateRun}
        confirmLoading={submitting}
        onCancel={() => { setIsModalVisible(false); setDestinationLab(null); setTrackingNumber(""); }}
        okText="Confirm Send"
        cancelText="Cancel"
        width={560}
      >
        <Space direction="vertical" style={{ width: "100%", marginBottom: 16, padding: 12, background: "#e6f7ff", borderRadius: 8, border: "1px solid #91d5ff" }}>
          <Text><strong>Operator:</strong> {user?.full_name}</Text>
          <Text><strong>Date / Time:</strong> {dayjs().format("DD/MM/YYYY HH:mm")}</Text>
        </Space>

        <div style={{ marginBottom: 16 }}>
          <Text strong>Destination Lab:</Text>
          <Select
            placeholder="Select destination lab"
            value={destinationLab}
            onChange={setDestinationLab}
            style={{ width: "100%", marginTop: 8 }}
            showSearch
            options={externalLabs.map((lab) => ({ value: lab.name, label: lab.name }))}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong>Tracking No.:</Text>
          <Input
            placeholder="Courier tracking number (optional)"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            style={{ marginTop: 8 }}
            prefix={<ClockCircleOutlined style={{ color: "#8c8c8c" }} />}
          />
        </div>

        <Divider style={{ margin: "12px 0" }} />
        <Text strong>Stains to dispatch ({selectedStainItems.length} item(s)):</Text>
        <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8, padding: "8px 12px", background: "#fafafa", borderRadius: 6, border: "1px solid #f0f0f0" }}>
          {selectedStainItems.map((item, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: idx < selectedStainItems.length - 1 ? "1px dashed #e8e8e8" : "none" }}>
              <Text>{item.accessionNo} — <Text type="secondary">{item.blockLabel}</Text></Text>
              <Tag color="purple" style={{ margin: 0 }}>{item.stainName}</Tag>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
};

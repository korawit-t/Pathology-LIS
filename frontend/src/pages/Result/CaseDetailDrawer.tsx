import React, { useEffect, useState } from "react";
import {
  Drawer, Tabs, Table, Tag, Space, Typography, Spin,
  Descriptions, Alert, Button, Empty,
} from "antd";
import {
  ExperimentOutlined,
  BlockOutlined,
  SendOutlined,
  FilePdfOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalCaseService from "../../services/surgicalCaseService";
import { IHCService, IHCMarkerWithResult } from "../../services/ihcService";
import { SurgicalCase } from "../../types/surgical";

interface IHCResultView {
  option_label?: string;
  numeric_value?: number | null;
  numeric_unit?: string;
  recorded_at?: string;
}

const { Text, Title } = Typography;

const STAIN_STATUS_COLOR: Record<string, string> = {
  pending:   "default",
  stained:   "blue",
  completed: "green",
  cancelled: "red",
};

interface CaseDetailDrawerProps {
  caseId: number | null;
  accessionNo?: string;
  onClose: () => void;
}

const CaseDetailDrawer: React.FC<CaseDetailDrawerProps> = ({ caseId, accessionNo, onClose }) => {
  const [caseData, setCaseData] = useState<SurgicalCase | null>(null);
  const [ihcData, setIhcData] = useState<Record<number, IHCMarkerWithResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [ihcLoading, setIhcLoading] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    setLoading(true);
    setCaseData(null);
    setIhcData({});
    SurgicalCaseService.getCaseById(caseId)
      .then((c) => setCaseData(c))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  const loadIHC = async () => {
    if (!caseData?.specimens?.length) return;
    setIhcLoading(true);
    try {
      const results: Record<number, IHCMarkerWithResult[]> = {};
      await Promise.all(
        caseData.specimens.map(async (sp) => {
          const panel = await IHCService.getPanel(sp.id).catch(() => []);
          if (panel.length) results[sp.id] = panel;
        })
      );
      setIhcData(results);
    } finally {
      setIhcLoading(false);
    }
  };

  const handleTabChange = (key: string) => {
    if (key === "ihc" && !Object.keys(ihcData).length) loadIHC();
  };

  const blockColumns = [
    {
      title: "Block",
      dataIndex: "block_code",
      width: 80,
      render: (v: string) => <b>{v}</b>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 110,
      render: (s: string) => <Tag color={s === "completed" ? "green" : "blue"}>{s}</Tag>,
    },
    {
      title: "Stains",
      dataIndex: "stains",
      render: (stains: { id: number; stain_type: string; status: string }[]) =>
        stains?.length ? (
          <Space wrap size={4}>
            {stains.map((s) => (
              <Tag key={s.id} color={STAIN_STATUS_COLOR[s.status] ?? "default"} style={{ fontSize: 11 }}>
                {s.stain_type}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  const ihcColumns = [
    {
      title: "Marker",
      dataIndex: "test_name",
      width: 160,
      render: (v: string) => <b>{v}</b>,
    },
    {
      title: "Result",
      dataIndex: "result",
      render: (r: IHCResultView | null) =>
        r ? (
          <Space>
            <Tag color="purple">{r.option_label}</Tag>
            {r.numeric_value != null && (
              <Text type="secondary">{r.numeric_value} {r.numeric_unit}</Text>
            )}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Recorded At",
      dataIndex: "result",
      width: 150,
      render: (r: IHCResultView | null) =>
        r?.recorded_at ? dayjs(r.recorded_at).format("DD/MM/YYYY HH:mm") : "—",
    },
  ];

  const blocksTab = (
    <div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : caseData?.specimens?.length ? (
        caseData.specimens.map((sp) => (
          <div key={sp.id} style={{ marginBottom: 24 }}>
            <Title level={5} style={{ marginBottom: 8 }}>
              {sp.specimen_label}. {sp.specimen_name}
            </Title>
            {sp.blocks?.length ? (
              <Table
                dataSource={sp.blocks}
                rowKey="id"
                columns={blockColumns}
                size="small"
                pagination={false}
                bordered
              />
            ) : (
              <Text type="secondary">No blocks</Text>
            )}
          </div>
        ))
      ) : (
        <Empty description="No specimens" />
      )}
    </div>
  );

  const ihcTab = (
    <div>
      {ihcLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : Object.keys(ihcData).length ? (
        caseData?.specimens
          ?.filter((sp) => ihcData[sp.id]?.length)
          .map((sp) => (
            <div key={sp.id} style={{ marginBottom: 24 }}>
              <Title level={5} style={{ marginBottom: 8 }}>
                {sp.specimen_label}. {sp.specimen_name}
              </Title>
              <Table
                dataSource={ihcData[sp.id]}
                rowKey="test_id"
                columns={ihcColumns}
                size="small"
                pagination={false}
                bordered
              />
            </div>
          ))
      ) : (
        <Empty description="No IHC results" />
      )}
    </div>
  );

  const consultTab = (
    <div>
      {caseData ? (
        caseData.is_out_lab_consult ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Consult Status">
                <Tag color={caseData.consult_status === "completed" ? "green" : "orange"}>
                  {caseData.consult_status?.toUpperCase() || "—"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="PDF Report">
                {caseData.consult_pdf_path ? (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<FilePdfOutlined />}
                    onClick={() => SurgicalCaseService.downloadConsultPdf(caseData.id, caseData.consult_pdf_path!).catch(() => {})}
                  >
                    Download Consult PDF
                  </Button>
                ) : (
                  <Text type="secondary">Not uploaded</Text>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Space>
        ) : (
          <Alert
            icon={<CloseCircleOutlined />}
            message="This case was not sent for external consult."
            type="info"
            showIcon
          />
        )
      ) : null}
    </div>
  );

  const tabs = [
    {
      key: "blocks",
      label: <span><BlockOutlined style={{ marginRight: 6 }} />Block History</span>,
      children: blocksTab,
    },
    {
      key: "ihc",
      label: <span><ExperimentOutlined style={{ marginRight: 6 }} />IHC Results</span>,
      children: ihcTab,
    },
    {
      key: "consult",
      label: (
        <span>
          <SendOutlined style={{ marginRight: 6 }} />
          Consult
          {caseData?.is_out_lab_consult && (
            <CheckCircleOutlined style={{ marginLeft: 6, color: "#52c41a" }} />
          )}
        </span>
      ),
      children: consultTab,
    },
  ];

  return (
    <Drawer
      open={!!caseId}
      onClose={onClose}
      width={620}
      title={
        <Space>
          <Text strong style={{ fontSize: 16 }}>Case Detail</Text>
          {accessionNo && <Tag color="blue">{accessionNo}</Tag>}
        </Space>
      }
      destroyOnHidden
    >
      {loading && !caseData ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : (
        <Tabs items={tabs} onChange={handleTabChange} />
      )}
    </Drawer>
  );
};

export default CaseDetailDrawer;

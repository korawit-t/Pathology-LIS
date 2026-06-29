import React, { useEffect, useState, useRef } from "react";
import {
  Table,
  Button,
  Space,
  Typography,
  message,
  Popconfirm,
  Tag,
  Badge,
} from "antd";
import {
  UnorderedListOutlined,
  DeleteOutlined,
  PrinterOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useReactToPrint } from "react-to-print";
import SurgicalBlockStainService, { OutlabRun } from "../../../services/surgicalBlockStainService";
import { OutlabRunPrint } from "./OutlabRunPrint";
import SystemSettingService from "../../../services/systemSettingService";
import PageContainer from "../../../components/Layout/PageContainer";
import logger from "../../../utils/logger";

const { Text, Title } = Typography;

type StainRun = OutlabRun;

const OutlabStainRunList = () => {
  const [runs, setRuns] = useState<StainRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [printRunData, setPrintRunData] = useState<StainRun | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await SystemSettingService.getPublicSettings();
        setHospitalName(res.lab_name_en);
      } catch (err) {
        logger.error("Failed to load hospital name", err);
      }
    };
    loadSettings();
  }, []);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getOutlabRuns({ limit: 100 });
      setRuns(data);
    } catch (error) {
      logger.error("Fetch runs error:", error);
      message.error("Failed to load outlab run history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleDelete = async (runId: number) => {
    try {
      await SurgicalBlockStainService.deleteOutlabRun(runId);
      message.success("Outlab run deleted. Slides reverted to pending.");
      fetchRuns();
    } catch (error) {
      logger.error("Delete error:", error);
      message.error("Failed to delete outlab run");
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Outlab_Dispatch_${dayjs().format("YYYYMMDD")}`,
  });

  const onPrintClick = (record: StainRun) => {
    setPrintRunData(record);
    setTimeout(() => handlePrint(), 150);
  };

  const handleReceive = async (runId: number) => {
    try {
      await SurgicalBlockStainService.receiveOutlabRun(runId);
      message.success("Run marked as received. Slides moved to awaiting pathologist review.");
      fetchRuns();
    } catch (error) {
      logger.error("Receive error:", error);
      message.error("Failed to mark run as received");
    }
  };

  const sentCount = runs.filter((r) => r.status === "sent").length;
  const receivedCount = runs.filter((r) => r.status === "received").length;

  const columns = [
    {
      title: "Run No.",
      dataIndex: "run_no",
      key: "run_no",
      render: (text: string) => <Tag color="geekblue">{text}</Tag>,
    },
    {
      title: "Sent At",
      dataIndex: "sent_at",
      key: "sent_at",
      render: (text: string) => (text ? dayjs(text).format("DD/MM/YYYY HH:mm") : "—"),
    },
    {
      title: "Destination Lab",
      dataIndex: "destination_lab",
      key: "destination_lab",
      render: (text: string) => <Text strong>{text || "—"}</Text>,
    },
    {
      title: "Slides",
      key: "stain_count",
      align: "center" as const,
      render: (_: unknown, record: StainRun) => (
        <Badge count={record.details?.length || 0} showZero color="purple" />
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (text: string) => {
        let color = "default";
        if (text === "sent") color = "processing";
        if (text === "received") color = "success";
        return <Tag color={color}>{text.toUpperCase()}</Tag>;
      },
    },
    {
      title: "Action",
      key: "action",
      width: 220,
      render: (_: unknown, record: StainRun) => (
        <Space>
          <Button
            type="text"
            icon={<PrinterOutlined style={{ color: "#722ed1" }} />}
            onClick={() => onPrintClick(record)}
          >
            Print
          </Button>
          {record.status === "sent" && (
            <Popconfirm
              title="Mark as Received?"
              description="Slides will move to 'Awaiting Pathologist Review' status."
              onConfirm={() => handleReceive(record.id)}
              okText="Confirm"
              cancelText="Cancel"
            >
              <Button
                type="text"
                icon={<InboxOutlined style={{ color: "#52c41a" }} />}
                style={{ color: "#52c41a" }}
              >
                Received
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="Delete this run?"
            description="All slides will revert to pending outlab status."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button danger type="text" icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <UnorderedListOutlined style={{ marginRight: 12, color: "#595959" }} />
          Outlab Staining Runs
        </Title>
      }
      subTitle={
        <Space size={16} style={{ marginTop: 2 }}>
          <Tag color="orange" style={{ fontWeight: 500 }}>Outlab</Tag>
          <Space size={4}>
            <ClockCircleOutlined style={{ color: "#faad14" }} />
            <Typography.Text type="secondary">
              In Transit: <strong>{sentCount}</strong>
            </Typography.Text>
          </Space>
          <Space size={4}>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Typography.Text type="secondary">
              Received: <strong>{receivedCount}</strong>
            </Typography.Text>
          </Space>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={runs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15 }}
      />

      <OutlabRunPrint
        ref={printRef}
        runData={printRunData}
        hospitalName={hospitalName}
      />
    </PageContainer>
  );
};

export default OutlabStainRunList;

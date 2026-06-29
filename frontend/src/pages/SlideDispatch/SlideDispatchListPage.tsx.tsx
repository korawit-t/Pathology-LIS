import { useEffect, useState, useRef } from "react";
import { Table, Button, Tag, Space, Modal, Typography, message } from "antd";
import {
  SendOutlined,
  DeleteOutlined,
  PrinterOutlined,
  DeploymentUnitOutlined,
} from "@ant-design/icons";
import SlideDispatchService from "../../services/slideDispatchService";
import CreateSlideDispatchRun from "./CreateSlideDispatchRun";
import { DispatchNotePrint } from "./DispatchNotePrint";
import SystemSettingService from "../../services/systemSettingService";
import { useReactToPrint } from "react-to-print";
import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import logger from "../../utils/logger";

const { Text, Title } = Typography;

interface SpecimenBlock {
  id: number;
  block_code: string;
}

interface DispatchRunItem {
  id: number;
  case_type: string;
  remark?: string;
  surgical_case?: { accession_no?: string; specimens?: { id?: number; blocks?: SpecimenBlock[] }[] };
}

interface DispatchRun {
  id: number;
  dispatch_no: string;
  sent_at: string;
  total_cases: number;
  remark?: string;
  pathologist?: { full_name?: string; username?: string };
  pathologist_id?: number;
  sender?: { full_name?: string; username?: string };
  items: DispatchRunItem[];
}

type PrintCase = {
  id: number;
  accession_no?: string;
  specimens?: { id?: number; blocks?: SpecimenBlock[] }[];
  case_type?: string;
  item_remark?: string;
};

type DispatchCaseType = "SURGICAL" | "GYNE_CYTO" | "NONGYNE_CYTO";

const VIEW_CASE_TYPE: Record<string, DispatchCaseType> = {
  "slide-dispatch": "SURGICAL",
  "gyne-slide-dispatch": "GYNE_CYTO",
  "nongyne-slide-dispatch": "NONGYNE_CYTO",
};

const CASE_TYPE_LABEL: Record<DispatchCaseType, string> = {
  SURGICAL: "Surgical",
  GYNE_CYTO: "Gyne Cytology",
  NONGYNE_CYTO: "Non-Gyne Cytology",
};

const SlideDispatchListPage = ({ currentView }: { currentView?: string }) => {
  const caseType: DispatchCaseType = VIEW_CASE_TYPE[currentView || "slide-dispatch"] ?? "SURGICAL";

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DispatchRun[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [hospitalName, setLabName] = useState<string>("");
  const [printData, setPrintData] = useState<{
    cases: PrintCase[];
    pathologistName: string;
    senderName: string;
    dispatchNo: string;
    remark?: string;
  } | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const [createMode, setCreateMode] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await SystemSettingService.getPublicSettings();

        setLabName(res.lab_name_en);
      } catch (err) {
        logger.error("Failed to load lab name", err);
      }
    };
    loadSettings();
  }, []);

  const fetchDispatches = async (page: number, size: number) => {
    setLoading(true);
    try {
      const skip = (page - 1) * size;
      // ✅ res is the data (items, total) returned from Service
      const res = await SlideDispatchService.getAllDispatches(skip, size);

      setData(res.items);
      setTotal(res.total);
    } catch (error) {
      logger.error(error); // Helps with debugging
      message.error("Failed to load slide dispatch records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatches(currentPage, pageSize);
  }, [currentPage, pageSize]);

  const handleDelete = (runId: number) => {
    Modal.confirm({
      title: "Confirm dispatch cancellation?",
      content: "All cases in this dispatch will be reset to Stained status",
      okText: "Confirm Cancel",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await SlideDispatchService.deleteDispatch(runId);
          message.success("Slide dispatch cancelled successfully");
          fetchDispatches(currentPage, pageSize);
        } catch (error) {
          message.error("Failed to cancel dispatch");
        }
      },
    });
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Dispatch_RePrint_${dayjs().format("YYYYMMDD")}`,
  });

  const onPrintClick = (record: DispatchRun) => {
    setPrintData({
      cases: record.items.map((it): PrintCase => {
        const targetCase = it.surgical_case;
        return {
          id: it.id,
          ...targetCase, // Send case data (accession_no, specimens etc.)
          case_type: it.case_type,
          item_remark: it.remark,
        };
      }),
      pathologistName:
        record.pathologist?.full_name || record.pathologist?.username || "N/A",
      senderName: record.sender?.full_name || record.sender?.username || "N/A",
      dispatchNo: record.dispatch_no, // 🚩 Send DS number into print
      remark: record.remark,
    });
    setTimeout(() => handlePrint(), 150);
  };

  if (createMode) {
    return (
      <CreateSlideDispatchRun
        caseType={caseType}
        onBack={() => setCreateMode(false)}
        onSuccess={() => {
          setCreateMode(false);
          fetchDispatches(1, pageSize);
        }}
      />
    );
  }

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0 }}>
          <DeploymentUnitOutlined style={{ marginRight: 8, color: "#595959" }} />
          Slide Dispatch Log
        </Title>
      }
      extra={
        <Button
          type="primary"
          size="large"
          icon={<SendOutlined />}
          onClick={() => setCreateMode(true)}
        >
          New {CASE_TYPE_LABEL[caseType]} Dispatch
        </Button>
      }
    >
      <Table
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="middle"
        bordered
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          },
        }}
        expandable={{
          expandedRowRender: (record: DispatchRun) => (
            <Table<DispatchRunItem>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={record.items}
              columns={[
                {
                  title: "Accession No.",
                  render: (item: DispatchRunItem) => {
                    const accNo = item.surgical_case?.accession_no;
                    return (
                      <Text strong color="blue">
                        {accNo || "-"}
                      </Text>
                    );
                  },
                },
                {
                  title: "Blocks",
                  render: (item: DispatchRunItem) => {
                    return (
                      <Space wrap>
                        {item.surgical_case?.specimens?.flatMap((s) =>
                          s.blocks?.map((b) => (
                            <Tag color="magenta" key={b.id}>
                              {b.block_code}
                            </Tag>
                          )),
                        )}
                      </Space>
                    );
                  },
                },
                {
                  title: "Type",
                  dataIndex: "case_type",
                  render: (type) => <Tag>{type}</Tag>,
                },
              ]}
            />
          ),
        }}
        columns={[
          {
            title: "Dispatch No.",
            dataIndex: "dispatch_no",
            key: "dispatch_no",
            render: (no) => (
              <Text strong copyable>
                {no || "N/A"}
              </Text>
            ),
          },
          {
            title: "Sent Date",
            dataIndex: "sent_at",
            render: (date) => dayjs(date).format("DD/MM/YYYY HH:mm"),
          },
          {
            title: "Total Cases",
            dataIndex: "total_cases",
            render: (count) => <Tag color="purple">{count} Cases</Tag>,
          },
          {
            title: "Receiving Pathologist",
            render: (record: DispatchRun) => (
              <Tag color="blue">
                {record.pathologist?.full_name || record.pathologist_id}
              </Tag>
            ),
          },
          {
            title: "Sender",
            render: (record: DispatchRun) => (
              <Text type="secondary">
                {record.sender?.full_name || record.sender?.username}
              </Text>
            ),
          },
          {
            title: "Action",
            key: "action",
            render: (record: DispatchRun) => (
              <Space>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => onPrintClick(record)}
                >
                  Print
                </Button>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record.id)}
                >
                  Cancel
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <div style={{ display: "none" }}>
        <DispatchNotePrint
          ref={printRef}
          scannedCases={printData?.cases || []}
          pathologistName={printData?.pathologistName || ""}
          senderName={printData?.senderName || ""}
          hospitalName={hospitalName}
          dispatchNo={printData?.dispatchNo} // 🚩 Need to send this variable
          remark={printData?.remark}
        />
      </div>
    </PageContainer>
  );
};

export default SlideDispatchListPage;

import React, { useEffect, useRef, useState } from "react";
import { Table, Button, Tag, Space, Typography, message } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useReactToPrint } from "react-to-print";
import dayjs from "dayjs";
import SlideDispatchService from "../../../services/slideDispatchService";
import SystemSettingService from "../../../services/systemSettingService";
import { DispatchNotePrint } from "../../SlideDispatch/DispatchNotePrint";

const { Text } = Typography;

interface SpecimenBlock {
  id: number;
  block_code: string;
}

interface DispatchRunItem {
  id: number;
  case_type: string;
  remark?: string;
  surgical_case?: { accession_no?: string; specimens?: { id?: number; blocks?: SpecimenBlock[] }[] };
  gyne_cyto_case?: { accession_no?: string };
  nongyne_cyto_case?: { accession_no?: string };
}

interface DispatchRun {
  id: number;
  dispatch_no: string;
  sent_at: string;
  total_cases: number;
  remark?: string;
  pathologist?: { full_name?: string; username?: string };
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

interface Props {
  pathologistId: number;
}

const MySlideDispatches: React.FC<Props> = ({ pathologistId }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DispatchRun[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [hospitalName, setHospitalName] = useState("");
  const [printData, setPrintData] = useState<{
    cases: PrintCase[];
    pathologistName: string;
    senderName: string;
    dispatchNo: string;
    remark?: string;
  } | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    SystemSettingService.getPublicSettings()
      .then((res) => setHospitalName(res.lab_name_en))
      .catch(() => {});
  }, []);

  const fetchDispatches = async (page: number) => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const res = await SlideDispatchService.getAllDispatches(
        skip,
        pageSize,
        pathologistId,
      );
      setData(res.items);
      setTotal(res.total);
    } catch {
      message.error("Failed to load dispatches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatches(currentPage);
  }, [currentPage, pathologistId]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Dispatch_${dayjs().format("YYYYMMDD")}`,
  });

  const onPrintClick = (record: DispatchRun) => {
    setPrintData({
      cases: record.items.map((it): PrintCase => {
        const targetCase =
          it.case_type === "GYNE_CYTO" ? it.gyne_cyto_case
          : it.case_type === "NONGYNE_CYTO" ? it.nongyne_cyto_case
          : it.surgical_case;
        return {
          id: it.id,
          ...targetCase,
          case_type: it.case_type,
          item_remark: it.remark,
        };
      }),
      pathologistName:
        record.pathologist?.full_name || record.pathologist?.username || "N/A",
      senderName: record.sender?.full_name || record.sender?.username || "N/A",
      dispatchNo: record.dispatch_no,
      remark: record.remark,
    });
    setTimeout(() => handlePrint(), 150);
  };

  const columns = [
    {
      title: "Dispatch No.",
      dataIndex: "dispatch_no",
    },
    {
      title: "Sent Date",
      dataIndex: "sent_at",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Total Cases",
      dataIndex: "total_cases",
      render: (count: number) => <Tag color="purple">{count} Cases</Tag>,
    },
    {
      title: "Sender",
      render: (record: DispatchRun) => (
        <Text type="secondary">
          {record.sender?.full_name || record.sender?.username || "-"}
        </Text>
      ),
    },
  ];

  return (
    <>
      <Table
        dataSource={data}
        rowKey="id"
        loading={loading}
        columns={columns}
        size="middle"
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: false,
          onChange: (page) => setCurrentPage(page),
          showTotal: (t) => `Total ${t} dispatches`,
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
                    const accNo =
                      item.case_type === "GYNE_CYTO" ? item.gyne_cyto_case?.accession_no
                      : item.case_type === "NONGYNE_CYTO" ? item.nongyne_cyto_case?.accession_no
                      : item.surgical_case?.accession_no;
                    return (
                      <Text strong style={{ color: "#1890ff" }}>
                        {accNo || "-"}
                      </Text>
                    );
                  },
                },
                {
                  title: "Blocks",
                  render: (item: DispatchRunItem) => {
                    if (item.case_type === "GYNE_CYTO" || item.case_type === "NONGYNE_CYTO") {
                      return (
                        <Text type="secondary" italic>
                          Cytology (Slide)
                        </Text>
                      );
                    }
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
                  render: (type: string) => <Tag>{type}</Tag>,
                },
              ]}
            />
          ),
        }}
      />

      <div style={{ display: "none" }}>
        <DispatchNotePrint
          ref={printRef}
          scannedCases={printData?.cases || []}
          pathologistName={printData?.pathologistName || ""}
          senderName={printData?.senderName || ""}
          hospitalName={hospitalName}
          dispatchNo={printData?.dispatchNo}
          remark={printData?.remark}
        />
      </div>
    </>
  );
};

export default MySlideDispatches;

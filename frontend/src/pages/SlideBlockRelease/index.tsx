import React, { useEffect, useRef, useState } from "react";
import {
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Typography,
  message,
  Select,
  Input,
  Card,
  Divider,
  Spin,
} from "antd";
import {
  ExportOutlined,
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  PrinterOutlined,
} from "@ant-design/icons";
import type { InputRef } from "antd";
import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import SlideBlockReleaseService from "../../services/slideBlockReleaseService";
import CreateReleaseForm from "./CreateReleaseForm";

const { Text } = Typography;
const { Option } = Select;

interface ReleaseRecord {
  id: number;
  release_no?: string;
  case_type?: string;
  case_id?: number;
  release_type?: string;
  recipient_name?: string;
  reference_doc_no?: string;
  released_by?: { full_name?: string; username?: string };
  released_at?: string;
}

interface CheckResult {
  case_type?: string;
  accession_no?: string;
  patient_name?: string;
  is_slide_released?: boolean;
  is_block_released?: boolean;
}

const CASE_TYPE_LABEL: Record<string, string> = {
  SURGICAL: "Surgical",
  GYNE_CYTO: "Gyne Cyto",
  NONGYNE_CYTO: "Non-Gyne Cyto",
};

const CASE_TYPE_COLOR: Record<string, string> = {
  SURGICAL: "blue",
  GYNE_CYTO: "pink",
  NONGYNE_CYTO: "purple",
};

const RELEASE_TYPE_LABEL: Record<string, string> = {
  SLIDE: "Slide",
  BLOCK: "Block",
  BOTH: "Slide + Block",
};

const RELEASE_TYPE_COLOR: Record<string, string> = {
  SLIDE: "cyan",
  BLOCK: "orange",
  BOTH: "green",
};

const SlideBlockReleasePage: React.FC = () => {
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReleaseRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [filterCaseType, setFilterCaseType] = useState<string | undefined>();
  const [filterReleaseType, setFilterReleaseType] = useState<string | undefined>();

  // Status checker
  const [checkInput, setCheckInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkRef = useRef<InputRef>(null);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const accNo = checkInput.trim().toUpperCase();
    if (!accNo) return;
    setChecking(true);
    setCheckResult(null);
    setCheckError(null);
    try {
      const res = await SlideBlockReleaseService.verifyAccession(accNo);
      setCheckResult(res);
    } catch (err: any) {
      setCheckError(
        err.response?.data?.detail || "Case not found or not yet reported"
      );
    } finally {
      setChecking(false);
    }
  };

  const fetchData = async (page: number, size: number) => {
    setLoading(true);
    try {
      const skip = (page - 1) * size;
      const res = await SlideBlockReleaseService.getAll({
        skip,
        limit: size,
        case_type: filterCaseType,
        release_type: filterReleaseType,
      });
      setData(res.items);
      setTotal(res.total);
    } catch {
      message.error("Failed to load release records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isCreateMode) fetchData(currentPage, pageSize);
  }, [currentPage, pageSize, filterCaseType, filterReleaseType, isCreateMode]);

  const handleDelete = (id: number, releaseNo: string) => {
    Modal.confirm({
      title: "Cancel this release record?",
      content: `Release ${releaseNo} will be deleted and case flags will be reverted.`,
      okText: "Confirm Cancel",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await SlideBlockReleaseService.delete(id);
          message.success("Release record cancelled");
          fetchData(currentPage, pageSize);
        } catch {
          message.error("Failed to cancel release");
        }
      },
    });
  };

  if (isCreateMode) {
    return (
      <CreateReleaseForm
        onBack={() => setIsCreateMode(false)}
        onSuccess={() => {
          setIsCreateMode(false);
          fetchData(1, pageSize);
          setCurrentPage(1);
        }}
      />
    );
  }

  return (
    <PageContainer
      withCard
      title={
        <Typography.Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ExportOutlined style={{ marginRight: 12, color: "#595959" }} />
          Slide / Block Release
        </Typography.Title>
      }
      extra={
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => setIsCreateMode(true)}
        >
          New Release
        </Button>
      }
    >
      {/* Status checker */}
      <Card
        size="small"
        style={{ marginBottom: 20, background: "#fafafa" }}
        bordered={false}
      >
        <Text strong style={{ fontSize: 13 }}>
          <SearchOutlined /> Check Release Status
        </Text>
        <form onSubmit={handleCheck} style={{ marginTop: 8 }}>
          <Space.Compact style={{ width: "100%", maxWidth: 480 }}>
            <Input
              ref={checkRef}
              placeholder="Enter accession no. (e.g. S26-00001)"
              value={checkInput}
              onChange={(e) => {
                setCheckInput(e.target.value);
                setCheckResult(null);
                setCheckError(null);
              }}
              allowClear
              onClear={() => { setCheckResult(null); setCheckError(null); }}
            />
            <Button
              type="primary"
              htmlType="submit"
              loading={checking}
              icon={<SearchOutlined />}
            >
              Check
            </Button>
          </Space.Compact>
        </form>

        {checking && (
          <div style={{ marginTop: 10 }}>
            <Spin size="small" /> <Text type="secondary"> Checking...</Text>
          </div>
        )}

        {checkError && (
          <div style={{ marginTop: 10 }}>
            <CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 6 }} />
            <Text type="danger">{checkError}</Text>
          </div>
        )}

        {checkResult && (
          <div style={{ marginTop: 10 }}>
            <Space wrap>
              <Tag color={CASE_TYPE_COLOR[checkResult.case_type]}>
                {CASE_TYPE_LABEL[checkResult.case_type]}
              </Tag>
              <Text strong>{checkResult.accession_no}</Text>
              <Text type="secondary">{checkResult.patient_name}</Text>
            </Space>
            <Space style={{ marginTop: 6, display: "flex", flexWrap: "wrap" }}>
              <Space size={4}>
                {checkResult.is_slide_released ? (
                  <CheckCircleFilled style={{ color: "#52c41a" }} />
                ) : (
                  <CloseCircleFilled style={{ color: "#d9d9d9" }} />
                )}
                <Text>
                  Slide:{" "}
                  <Text strong>
                    {checkResult.is_slide_released ? "Released" : "Not released"}
                  </Text>
                </Text>
              </Space>
              {checkResult.case_type === "SURGICAL" && (
                <Space size={4}>
                  {checkResult.is_block_released ? (
                    <CheckCircleFilled style={{ color: "#52c41a" }} />
                  ) : (
                    <CloseCircleFilled style={{ color: "#d9d9d9" }} />
                  )}
                  <Text>
                    Block:{" "}
                    <Text strong>
                      {checkResult.is_block_released
                        ? "Released"
                        : "Not released"}
                    </Text>
                  </Text>
                </Space>
              )}
            </Space>
          </div>
        )}
      </Card>

      <Divider style={{ margin: "0 0 16px" }} />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          placeholder="Filter by Case Type"
          style={{ width: 190 }}
          value={filterCaseType}
          onChange={(v) => { setFilterCaseType(v); setCurrentPage(1); }}
        >
          <Option value="SURGICAL">Surgical</Option>
          <Option value="GYNE_CYTO">Gyne Cytology</Option>
          <Option value="NONGYNE_CYTO">Non-Gyne Cytology</Option>
        </Select>
        <Select
          allowClear
          placeholder="Filter by Release Type"
          style={{ width: 190 }}
          value={filterReleaseType}
          onChange={(v) => { setFilterReleaseType(v); setCurrentPage(1); }}
        >
          <Option value="SLIDE">Slide</Option>
          <Option value="BLOCK">Block</Option>
          <Option value="BOTH">Slide + Block</Option>
        </Select>
      </Space>

      <Table
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} records`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          },
        }}
        columns={[
          {
            title: "Release No.",
            dataIndex: "release_no",
            render: (no) => <Text strong copyable>{no}</Text>,
          },
          {
            title: "Case Type",
            dataIndex: "case_type",
            render: (type) => (
              <Tag color={CASE_TYPE_COLOR[type]}>
                {CASE_TYPE_LABEL[type] ?? type}
              </Tag>
            ),
          },
          {
            title: "Case ID",
            dataIndex: "case_id",
            render: (id) => <Text type="secondary">#{id}</Text>,
          },
          {
            title: "Release Type",
            dataIndex: "release_type",
            render: (type) => (
              <Tag color={RELEASE_TYPE_COLOR[type]}>
                {RELEASE_TYPE_LABEL[type] ?? type}
              </Tag>
            ),
          },
          {
            title: "Recipient",
            dataIndex: "recipient_name",
          },
          {
            title: "Reference Doc No.",
            dataIndex: "reference_doc_no",
            render: (no) =>
              no ? <Text code>{no}</Text> : <Text type="secondary">—</Text>,
          },
          {
            title: "Recorded By",
            dataIndex: "released_by",
            render: (user) => (
              <Text type="secondary">
                {user?.full_name || user?.username || "—"}
              </Text>
            ),
          },
          {
            title: "Released At",
            dataIndex: "released_at",
            render: (date) => dayjs(date).format("DD/MM/YYYY HH:mm"),
          },
          {
            title: "",
            key: "action",
            width: 100,
            render: (record: ReleaseRecord) => (
              <Space size={4}>
                <Button
                  type="text"
                  icon={<PrinterOutlined />}
                  title="Print consent form"
                  onClick={async () => {
                    try {
                      await SlideBlockReleaseService.openFormPdf(record.id, record.release_no);
                    } catch {
                      message.error("Failed to generate form PDF");
                    }
                  }}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record.id, record.release_no)}
                />
              </Space>
            ),
          },
        ]}
      />
    </PageContainer>
  );
};

export default SlideBlockReleasePage;

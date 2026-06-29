import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Button,
  Input,
  Table,
  Space,
  Divider,
  Statistic,
  Row,
  Col,
  message,
  Modal,
  Tag,
  Typography,
  Select,
  Spin,
} from "antd";
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
  SendOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { InputRef } from "antd";
import dayjs from "dayjs";
import SlideDispatchService, {
  SlideDispatchBulkPayload,
} from "../../services/slideDispatchService";
import UserService from "../../services/userService";
import { useReactToPrint } from "react-to-print";
import { DispatchNotePrint } from "./DispatchNotePrint";
import ManualSelectModal from "./ManualSelectModal";
import SurgicalCaseService from "../../services/surgicalCaseService";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import NongyneCytoCaseService from "../../services/nongyneCytoCaseService";
import PageContainer from "../../components/Layout/PageContainer";
import logger from "../../utils/logger";
import type { User } from "../../types/user";
import { useAuth } from "../../hooks/useAuth";

const { Text, Title } = Typography;
const { Option } = Select;

interface SpecimenBlock {
  id: number;
  block_code: string;
}

interface DispatchedCase {
  id: number;
  accession_no: string;
  case_type: string;
  scannedAt: string;
  specimens?: { id?: number; blocks?: SpecimenBlock[] }[];
}

interface PendingCase {
  id: number;
  accession_no: string;
  case_type: string;
  status?: string;
  specimens?: { id?: number; blocks?: SpecimenBlock[] }[];
}

type DispatchCaseType = "SURGICAL" | "GYNE_CYTO" | "NONGYNE_CYTO";

interface CreateSlideDispatchRunProps {
  onBack: () => void;
  onSuccess: () => void;
  caseType: DispatchCaseType;
}

const CreateSlideDispatchRun: React.FC<CreateSlideDispatchRunProps> = ({
  onBack,
  onSuccess,
  caseType,
}) => {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [scannedCases, setScannedCases] = useState<DispatchedCase[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [selectedPathologist, setSelectedPathologist] = useState<number | null>(
    null,
  );
  const [pathologists, setPathologists] = useState<User[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [remark, setRemark] = useState<string>("");
  const [printData, setPrintData] = useState<{
    dispatchNo: string;
    cases: DispatchedCase[];
    pathologistName: string;
    hospitalNameEn: string;
    remark: string;
  } | null>(null);

  // --- States for Manual Select ---
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [pendingCases, setPendingCases] = useState<PendingCase[]>([]); // Cases ready for dispatch
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const uRes = await UserService.getUsers({ role: "pathologist" });
        setPathologists(uRes);
      } catch (err) {
        message.error("Failed to load pathologist data");
      }
    };
    loadMasterData();
    setTimeout(() => inputRef.current?.focus(), 500);
  }, []);

  const loadStainedCases = async () => {
    setManualLoading(true);
    try {
      let items: PendingCase[] = [];
      if (caseType === "SURGICAL") {
        const res = await SurgicalCaseService.getCases({ limit: 1000, status: "stained" });
        items = (res.items || []).map((c) => ({ ...c, case_type: "SURGICAL" } as PendingCase));
      } else if (caseType === "GYNE_CYTO") {
        const res = await GyneCytologyCaseService.getAll({ limit: 1000, status: "stained" });
        items = (res.items || []).map((c) => ({ ...c, case_type: "GYNE_CYTO" } as PendingCase));
      } else {
        const res = await NongyneCytoCaseService.getAll({ limit: 1000, status: "stained" });
        items = (res.items || []).map((c) => ({ ...c, case_type: "NONGYNE_CYTO" } as PendingCase));
      }
      setPendingCases(items);
    } catch (err) {
      logger.error(err);
      message.error("Failed to load case list");
    } finally {
      setManualLoading(false);
    }
  };
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;

    if (scannedCases.find((c) => c.accession_no === barcodeInput)) {
      message.warning("This case is already in the list");
      setBarcodeInput("");
      return;
    }

    try {
      setLoading(true);
      const res = await SlideDispatchService.verifyAccession(barcodeInput);
      const newEntry: DispatchedCase = {
        id: res.id,
        accession_no: res.accession_no,
        case_type: res.case_type,
        scannedAt: dayjs().format("HH:mm:ss"),
        specimens: res.specimens,
      };
      setScannedCases([newEntry, ...scannedCases]);
      message.success(`Scanned case ${barcodeInput} successfully`);
    } catch (err: any) {
      message.error(err.response?.data?.detail || "No case ready for slide dispatch found");
    } finally {
      setLoading(false);
      setBarcodeInput("");
      inputRef.current?.focus();
    }
  };

  // Handle confirm in Manual Select Modal
  const handleManualOk = () => {
    const newlySelected = pendingCases
      .filter((c) => selectedRowKeys.includes(`${c.case_type}_${c.id}`))
      .map((c) => ({
        id: c.id,
        accession_no: c.accession_no,
        case_type: c.case_type || "SURGICAL", // Use the type attached during load
        scannedAt: dayjs().format("HH:mm:ss (M)"),
        specimens: c.specimens,
      }));

    setScannedCases((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const filtered = newlySelected.filter(
        (item) => !existingIds.has(item.id),
      );
      return [...filtered, ...prev];
    });

    setIsManualModalOpen(false);
    setSelectedRowKeys([]);
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Dispatch_${dayjs().format("YYYYMMDD_HHmm")}`,
  });

  // Find pathologist name from selected ID to send to Print component
  const selectedPathologistName =
    pathologists.find((p) => p.id === selectedPathologist)?.full_name ||
    pathologists.find((p) => p.id === selectedPathologist)?.username ||
    "Not specified";

  const handleFinish = async () => {
    if (!selectedPathologist)
      return message.warning("Please select a receiving pathologist");
    if (scannedCases.length === 0)
      return message.warning("Please select at least 1 case");

    try {
      setLoading(true);
      const payload: SlideDispatchBulkPayload = {
        pathologist_id: selectedPathologist,
        items: scannedCases.map((c) => ({
          case_id: c.id,
          case_type: c.case_type,
        })),
        remark: remark, // 🚩 Send remark state value
      };

      // 🚩 Call API to create SlideDispatchRun
      const res = await SlideDispatchService.bulkDispatch(payload);
      setPrintData({
        dispatchNo: res.dispatch_no,
        cases: [...scannedCases].sort((a, b) =>
          a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true, sensitivity: "base" }),
        ),
        pathologistName: selectedPathologistName,
        hospitalNameEn: res.lab_name_en || "Pathology Department",
        remark: remark,
      });
      const newDispatchNo = res.dispatch_no; // Backend generated dispatch number

      Modal.confirm({
        title: "Slide Dispatch Saved Successfully",
        icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
        content: (
          <Space direction="vertical">
            <Text>
              Generated Dispatch No: <Text strong>{newDispatchNo}</Text>
            </Text>
            <Text>Do you want to print the Dispatch Note?</Text>
          </Space>
        ),
        okText: "Print Document",
        cancelText: "Close",
        onOk: async () => {
          await handlePrint(); // Print
          setScannedCases([]); // Clear list
          setRemark(""); // 🚩 Clear remark after completion
          onSuccess(); // Return to List (which will auto fetch page 1)
        },
        onCancel: () => {
          setScannedCases([]);
          setRemark(""); // 🚩 Clear remark
          onSuccess();
        },
      });
    } catch (err: any) {
      logger.error("Dispatch Error:", err);
      message.error(
        "Save failed: " + (err.response?.data?.detail || err.message),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer withCard>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          Back
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          Slide Dispatcher (Bulk)
        </Title>
      </Space>

      <Row gutter={[16, 16]}>
        <Col span={24} lg={8}>
          <Card title="Dispatch Information" bordered={false} className="shadow-sm">
            <FormLayout label="Receiving Pathologist">
              <Select
                placeholder="Select Pathologist"
                style={{ width: "100%" }}
                size="large"
                showSearch
                optionFilterProp="children"
                onChange={setSelectedPathologist}
                value={selectedPathologist}
              >
                {pathologists.map((p) => (
                  <Option key={p.id} value={p.id}>
                    {p.full_name || p.username}
                  </Option>
                ))}
              </Select>
            </FormLayout>
            <FormLayout label="Remark (Optional)">
              <Input.TextArea
                placeholder="Add notes for the pathologist..."
                rows={3}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                maxLength={200}
                showCount
              />
            </FormLayout>
            <Divider />
            <Statistic
              title="Selected Cases"
              value={scannedCases.length}
              prefix={<SendOutlined />}
              valueStyle={{ color: "#3f51b5" }}
            />
            <Button
              type="primary"
              block
              size="large"
              icon={<CheckCircleOutlined />}
              onClick={handleFinish}
              disabled={scannedCases.length === 0 || !selectedPathologist}
              loading={loading}
              style={{ marginTop: 24, height: 50, fontSize: 18 }}
            >
              Confirm Dispatch
            </Button>
          </Card>
        </Col>

        <Col span={24} lg={16}>
          <Card bordered={false}>
            <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
              <Input
                size="large"
                placeholder="Scan Accession No. (e.g. S26-00001)"
                prefix={<BarcodeOutlined />}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                onPressEnter={handleScan}
                ref={inputRef}
                allowClear
                style={{
                  height: 50,
                  fontSize: 18,
                  border: "2px solid #1890ff",
                }}
              />
              <Button
                size="large"
                style={{ height: 50 }}
                icon={<UnorderedListOutlined />}
                onClick={() => {
                  setIsManualModalOpen(true);
                  loadStainedCases();
                }}
              >
                Manual Select
              </Button>
            </Space.Compact>

            <Table
              dataSource={scannedCases}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              columns={[
                {
                  title: "Accession No.",
                  dataIndex: "accession_no",
                  render: (text) => <Text strong>{text}</Text>,
                },
                {
                  title: "Blocks",
                  key: "blocks",
                  render: (record: DispatchedCase) => {
                    const allBlocks =
                      record.specimens
                        ?.flatMap((spec) =>
                          spec.blocks?.map((b) => b.block_code),
                        )
                        .filter(Boolean) || [];

                    return (
                      <Space wrap size={[0, 4]}>
                        {allBlocks.length > 0 ? (
                          allBlocks.map((code: string, idx: number) => (
                            <Tag
                              color="magenta"
                              key={idx}
                              style={{ fontSize: "12px" }}
                            >
                              {code}
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary" italic>
                            -
                          </Text>
                        )}
                      </Space>
                    );
                  },
                },
                {
                  title: "Type",
                  dataIndex: "case_type",
                  render: (type) => {
                    const label = ({ SURGICAL: "Surgical", GYNE_CYTO: "Gyne Cyto", NONGYNE_CYTO: "Nongyne Cyto" } as Record<string, string>)[type] || type;
                    const color = type === "GYNE_CYTO" ? "pink" : type === "NONGYNE_CYTO" ? "purple" : "blue";
                    return <Tag color={color}>{label}</Tag>;
                  },
                },
                { title: "Time Added", dataIndex: "scannedAt" },
                {
                  title: "Action",
                  render: (_, r) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setScannedCases(
                          scannedCases.filter((c) => c.id !== r.id),
                        )
                      }
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <ManualSelectModal
        open={isManualModalOpen}
        loading={manualLoading}
        data={pendingCases}
        selectedRowKeys={selectedRowKeys}
        onSelectionChange={(keys) => setSelectedRowKeys(keys)}
        onOk={handleManualOk}
        onCancel={() => setIsManualModalOpen(false)}
      />
      {/* 2. Component for printing (will be automatically hidden) */}
      <DispatchNotePrint
        ref={printRef}
        scannedCases={printData?.cases || []}
        pathologistName={printData?.pathologistName || ""}
        senderName={currentUser?.full_name || currentUser?.username || ""}
        hospitalName={printData?.hospitalNameEn || ""} // 🚩 Use from printData
        dispatchNo={printData?.dispatchNo || ""} // 🚩 Use from printData
        remark={printData?.remark || ""}
      />
    </PageContainer>
  );
};

const FormLayout = ({ label, children }: { label: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ marginBottom: 8 }}>
      <Text type="secondary">{label}</Text>
    </div>
    {children}
  </div>
);

export default CreateSlideDispatchRun;

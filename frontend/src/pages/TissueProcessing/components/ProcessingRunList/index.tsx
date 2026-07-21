import React, { useEffect, useState, useMemo } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Modal,
  Divider,
  Tooltip,
} from "antd";
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PlusOutlined,
  LoginOutlined,
  LogoutOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import TissueProcessingService from "../../../../services/tissueProcessingService";
import { getProcessingColumns } from "./ProcessingColumns";
import ProcessOutModal from "../TissueProcessingOutModal/TissueProcessingOutModal";
import EditProcessingRunModal from "./EditProcessingRunModal";

// นำเข้า Interface จาก types file
import {
  TissueProcessingRun,
  GroupedAccession,
  TissueProcessingRunView,
} from "../../../../types/tissueProcessing";
import "../../../../styles/table-common.css";

const { Title, Text } = Typography;

interface ProcessingRunListProps {
  refreshKey?: number;
}

const ProcessingRunList: React.FC<ProcessingRunListProps> = ({ refreshKey }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [runs, setRuns] = useState<TissueProcessingRunView[]>([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [selectedRunDetails, setSelectedRunDetails] =
    useState<TissueProcessingRunView | null>(null);

  // State สำหรับจัดการการนำเนื้อออก
  const [isOutModalOpen, setIsOutModalOpen] = useState<boolean>(false);
  const [targetRunId, setTargetRunId] = useState<number | null>(null);

  // Edit state
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingRun, setEditingRun] = useState<TissueProcessingRunView | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await TissueProcessingService.getRuns();
      setRuns(data); // ✅ ใช้ข้อมูลที่ fetch มา
    } catch (error) {
      message.error("Failed to load processing runs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [refreshKey]);

  const handleComplete = (id: number) => {
    setTargetRunId(id);
    setIsOutModalOpen(true);
  };

  const handleOutSuccess = () => {
    fetchRuns();
  };

  const handleEdit = (record: TissueProcessingRunView) => {
    setEditingRun(record);
    setIsEditModalOpen(true);
  };

  const handleShowDetails = (record: TissueProcessingRun) => {
    setSelectedRunDetails(record);
    setIsDetailModalOpen(true);
  };

  // Logic การจัดกลุ่มข้อมูลใน Modal รายละเอียด
  const groupedItems = useMemo<GroupedAccession[]>(() => {
    if (!selectedRunDetails?.items) return [];

    const grouped = selectedRunDetails.items.reduce(
      (acc: { [key: string]: GroupedAccession }, item) => {
        // ✅ ถูกต้อง: ดึงจาก item.block.accession_no ตาม JSON
        const accessionNo = item.block?.accession_no || "Unknown";

        if (!acc[accessionNo]) {
          acc[accessionNo] = {
            accession_no: accessionNo,
            patient_name: "N/A",
            blocks: [],
            status_counts: { completed: 0, missing: 0, processing: 0 },
          };
        }
        acc[accessionNo].blocks.push(item);

        const status = item.status || "processing";
        if (status === "completed") acc[accessionNo].status_counts.completed++;
        else if (status === "missing") acc[accessionNo].status_counts.missing++;
        else acc[accessionNo].status_counts.processing++;

        return acc;
      },
      {},
    );

    // 🌟 แก้จาก groups เป็น grouped ให้ชื่อตรงกับด้านบน
    // เรียง Accession No. จากน้อยไปมาก
    return Object.values(grouped).sort((a, b) =>
      a.accession_no.localeCompare(b.accession_no, undefined, { numeric: true }),
    );
  }, [selectedRunDetails]);

  // เรียกใช้ Columns จากไฟล์แยก
  const columns = getProcessingColumns({
    onShowDetails: handleShowDetails,
    onComplete: handleComplete,
    onEdit: handleEdit,
  });

  return (
    <>
      <div>
        <Table
          className="standard-table"
          size="middle"
          columns={columns}
          dataSource={runs}
          rowKey="id"
          loading={loading}
          bordered
          onRow={(record) => ({
            onClick: () => handleShowDetails(record),
            style: { cursor: "pointer" },
          })}
          rowClassName={() => "editable-row"}
          pagination={{ pageSize: 10 }}
        />
      </div>

      <ProcessOutModal
        runId={targetRunId}
        open={isOutModalOpen}
        onClose={() => setIsOutModalOpen(false)}
        onSuccess={handleOutSuccess}
      />

      <EditProcessingRunModal
        open={isEditModalOpen}
        run={editingRun}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={fetchRuns}
      />

      <Modal
        title={`Details for Run: ${selectedRunDetails?.run_number}`}
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={800}
      >
        {selectedRunDetails && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  padding: "12px",
                  background: "#e6f7ff",
                  borderRadius: "8px",
                }}
              >
                <Title level={5}>
                  <LoginOutlined /> Processing IN
                </Title>
                <Divider style={{ margin: "8px 0" }} />
                <p>
                  <b>By:</b>{" "}
                  {selectedRunDetails.creator?.full_name || "N/A"}
                </p>
                <p>
                  <b>Time:</b>{" "}
                  {dayjs(selectedRunDetails.start_at).format(
                    "DD/MM/YYYY HH:mm",
                  )}
                </p>
                <p>
                  <b>Total:</b>{" "}
                  <Tag color="blue">
                    {selectedRunDetails.block_in_total} blocks
                  </Tag>
                </p>
                {/* ส่วน Note ภายในกล่อง IN */}
                {selectedRunDetails.remark && (
                  <div
                    style={{
                      marginTop: "10px",
                      borderTop: "1px dashed #91d5ff",
                      paddingTop: "8px",
                    }}
                  >
                    <Text strong style={{ color: "#874d00", fontSize: "12px" }}>
                      <FileTextOutlined /> Notes:
                    </Text>
                    <br />
                    <Text
                      type="secondary"
                      style={{ fontSize: "12px", whiteSpace: "pre-wrap" }}
                    >
                      {selectedRunDetails.remark}
                    </Text>
                  </div>
                )}
              </div>{" "}
              {/* <-- ปิดกล่อง IN ตรงนี้ */}
              <div
                style={{
                  padding: "12px",
                  background:
                    selectedRunDetails.status === "completed"
                      ? "#f6ffed"
                      : "#f5f5f5",
                  borderRadius: "8px",
                }}
              >
                <Title level={5}>
                  <LogoutOutlined /> Processing OUT
                </Title>
                <Divider style={{ margin: "8px 0" }} />
                {selectedRunDetails.status === "completed" ? (
                  <>
                    <p>
                      <b>By:</b>{" "}
                      {selectedRunDetails.completer?.full_name || "N/A"}
                    </p>
                    <p>
                      <b>Time:</b>{" "}
                      {dayjs(selectedRunDetails.completed_at).format(
                        "DD/MM/YYYY HH:mm",
                      )}
                    </p>
                    <p>
                      <b>Total:</b>{" "}
                      <Tag color="green">
                        {selectedRunDetails.block_out_total} blocks
                      </Tag>
                    </p>
                  </>
                ) : (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#999",
                      paddingTop: "20px",
                    }}
                  >
                    In progress...
                  </div>
                )}
              </div>
            </div>

            <Table
              dataSource={groupedItems}
              rowKey="accession_no"
              size="small"
              pagination={false}
              columns={[
                {
                  title: "No.",
                  render: (_, __, index) => index + 1,
                  width: 50,
                },
                {
                  title: "Accession No.",
                  dataIndex: "accession_no", // 🌟 มั่นใจว่าตรงกับ key ใน Object ที่เราสร้างใน reduce
                  render: (text: string) => <Text strong>{text}</Text>,
                  width: 150,
                },
                {
                  title: "Blocks in this Case",
                  render: (_, record: GroupedAccession) => (
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}
                    >
                      {record.blocks.map((item) => (
                        <Tooltip
                          key={item.id}
                          title={`Status: ${item.status || "in_machine"}`}
                        >
                          <Tag
                            color={
                              item.status === "completed"
                                ? "green"
                                : item.status === "missing"
                                  ? "red"
                                  : "blue"
                            }
                          >
                            {item.block?.specimen_label}
                            {item.block?.block_no}
                          </Tag>
                        </Tooltip>
                      ))}
                    </div>
                  ),
                },
                {
                  title: "Summary",
                  width: 120,
                  render: (_, record: GroupedAccession) => (
                    <Text type="secondary" style={{ fontSize: "12px" }}>
                      Total: {record.blocks.length}
                    </Text>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </>
  );
};

export default ProcessingRunList;

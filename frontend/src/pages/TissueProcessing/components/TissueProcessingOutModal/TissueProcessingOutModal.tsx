import React, { useState, useEffect } from "react";
import {
  Modal,
  Input,
  List,
  Badge,
  message,
  Typography,
  Space,
  Tag,
  Button,
  Checkbox,
} from "antd";
import {
  ScanOutlined,
  CheckSquareOutlined,
  BorderOutlined,
} from "@ant-design/icons";
import TissueProcessingService from "../../../../services/tissueProcessingService";
import "../../../../styles/table-common.css";
import {
  TissueProcessingRunView,
  UpdateTissueProcessingRunStatusPayload,
} from "../../../../types/tissueProcessing";

const { Text } = Typography;

// ✅ กำหนด Props Interface
interface ProcessOutModalProps {
  runId: number | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ✅ กำหนด Payload Interface สำหรับ API
interface UpdateStatusPayload {
  status: string;
  completed_by_id: number;
  block_out_total: number;
  confirmed_block_ids: number[];
  remark: string;
}

const ProcessOutModal: React.FC<ProcessOutModalProps> = ({
  runId,
  open,
  onClose,
  onSuccess,
}) => {
  const [runData, setRunData] = useState<TissueProcessingRunView | null>(null);
  const [scannedIds, setScannedIds] = useState<number[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (open && runId) {
      setLoading(true);
      TissueProcessingService.getRunById(runId)
        .then((data) => {
          setRunData(data);
          setScannedIds([]);
        })
        .catch(() => message.error("Failed to load run data"))
        .finally(() => setLoading(false));
    }
  }, [open, runId]);

  // --- เลือก/ยกเลิก ทีละรายการ ---
  const toggleBlock = (blockId: number) => {
    setScannedIds((prev) =>
      prev.includes(blockId)
        ? prev.filter((id) => id !== blockId)
        : [...prev, blockId],
    );
  };

  // --- เลือกทั้งหมด ---
  const selectAll = () => {
    const allIds = runData?.items?.map((item) => item.block_id) || [];
    setScannedIds(allIds);
    message.info("All blocks selected");
  };

  const handleScan = (code: string) => {
    if (!runData || !runData.items) return;
    const trimmedCode = code.trim();

    const foundBlock = runData.items.find(
      (item) =>
        item.block?.block_code === trimmedCode ||
        item.block?.id.toString() === trimmedCode,
    );

    if (foundBlock) {
      if (!scannedIds.includes(foundBlock.block_id)) {
        setScannedIds((prev) => [...prev, foundBlock.block_id]);
        message.success(`Block ${trimmedCode} scanned successfully`);
      } else {
        message.warning("Block already scanned");
      }
    } else {
      message.error("Block not found in this run");
    }
    setInputValue("");
  };

  const handleConfirmOut = async () => {
    if (!runId) return;

    // ดึง User จาก localStorage (ควรมี Type ของ User ด้วยจะดีมาก)
    const userString = localStorage.getItem("user");
    const user = userString ? JSON.parse(userString) : null;

    const totalIn = runData?.block_in_total || 0;

    const payload: UpdateTissueProcessingRunStatusPayload = {
      status: "completed",
      completed_by_id: user?.id || 1,
      block_out_total: scannedIds.length,
      remark:
        scannedIds.length < totalIn
          ? `Manual Confirm: incomplete (missing ${totalIn - scannedIds.length})`
          : "Complete",
    };

    try {
      await TissueProcessingService.updateRunStatus(runId, payload);
      message.success("Process out confirmed successfully");
      onSuccess();
      onClose();
    } catch (error) {
      message.error("Failed to save");
    }
  };

  return (
    <Modal
      title={
        <Space>
          <ScanOutlined />
          <span>Confirm Process Out</span>
          {runData && <Tag color="blue">{runData.run_number}</Tag>}
        </Space>
      }
      open={open}
      onOk={handleConfirmOut}
      onCancel={onClose}
      okText="Confirm Process Out"
      width={650}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          Scan barcodes or check the boxes next to verified blocks
        </Text>
        <Input
          placeholder="Scan block barcode..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={() => handleScan(inputValue)}
          autoFocus
          style={{ marginTop: 8, height: 40 }}
          prefix={<ScanOutlined style={{ color: "#bfbfbf" }} />}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Space>
          <Button
            size="small"
            icon={<CheckSquareOutlined />}
            onClick={selectAll}
            disabled={scannedIds.length === (runData?.items?.length || 0)}
          >
            Select All
          </Button>
          <Button
            size="small"
            icon={<BorderOutlined />}
            onClick={() => setScannedIds([])}
            danger={scannedIds.length > 0}
          >
            Clear All
          </Button>
        </Space>
        <Text strong>
          Verified:{" "}
          <span
            style={{
              color:
                scannedIds.length === (runData?.block_in_total || 0)
                  ? "#52c41a"
                  : "#fa8c16",
            }}
          >
            {scannedIds.length} / {runData?.block_in_total || 0}
          </span>
        </Text>
      </div>

      <List
        bordered
        loading={loading}
        dataSource={runData?.items || []}
        className="always-scroll"
        style={{ maxHeight: "450px" }}
        renderItem={(item) => {
          const isChecked = scannedIds.includes(item.block_id);
          const block = item.block;
          const specimen = block?.specimen;

          return (
            <List.Item
              style={{
                backgroundColor: isChecked ? "#f6ffed" : "inherit",
                cursor: "pointer",
                transition: "all 0.2s",
                padding: "12px 16px",
                borderLeft: isChecked
                  ? "4px solid #52c41a"
                  : "4px solid transparent",
              }}
              onClick={() => toggleBlock(item.block_id)}
            >
              <div
                style={{ display: "flex", width: "100%", alignItems: "start" }}
              >
                <Checkbox checked={isChecked} style={{ marginTop: 4 }} />

                <div style={{ marginLeft: 16, flex: 1 }}>
                  <div style={{ marginBottom: 4 }}>
                    <Tag
                      color="volcano"
                      style={{ fontWeight: "bold", fontSize: "13px" }}
                    >
                      {block?.accession_no || "No Accession No."}
                    </Tag>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Text strong style={{ fontSize: "16px", color: "#1890ff" }}>
                      Block: {block?.specimen_label}
                      {block?.block_no}
                    </Text>
                    {specimen?.lab_number && (
                      <Tag color="default">Lab: {specimen.lab_number}</Tag>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  {isChecked ? (
                    <Badge
                      status="success"
                      text={<Text type="success">Verified</Text>}
                    />
                  ) : (
                    <Badge
                      status="default"
                      text={<Text type="secondary">Waiting</Text>}
                    />
                  )}
                </div>
              </div>
            </List.Item>
          );
        }}
      />
    </Modal>
  );
};

export default ProcessOutModal;

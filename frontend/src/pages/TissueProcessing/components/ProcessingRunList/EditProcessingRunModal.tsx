import React, { useEffect, useState } from "react";
import {
  Modal, Form, Select, DatePicker, Input, message,
  Table, Button, Space, Tag,
} from "antd";
import { DeleteOutlined, UnorderedListOutlined, BarcodeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import TissueProcessingService from "../../../../services/tissueProcessingService";
import { TissueProcessingRunView, ScannedBlock, PendingDataNode } from "../../../../types/tissueProcessing";
import PendingBlocksModal from "../CreateProcessingRun/PendingBlocksModal";
import logger from "../../../../utils/logger";

interface Props {
  open: boolean;
  run: TissueProcessingRunView | null;
  onClose: () => void;
  onSuccess: () => void;
}

const EditProcessingRunModal: React.FC<Props> = ({ open, run, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<{ value: string; label: string }[]>([]);
  const [programs, setPrograms] = useState<{ value: string; label: string }[]>([]);
  const [blocks, setBlocks] = useState<ScannedBlock[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [pendingData, setPendingData] = useState<PendingDataNode[]>([]);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);

  useEffect(() => {
    TissueProcessingService.getMachines()
      .then((ms) => setMachines(ms.map((m) => ({ value: m.name, label: m.name }))))
      .catch(logger.error);
    TissueProcessingService.getPrograms()
      .then((ps) => setPrograms(ps.map((p) => ({ value: p.name, label: p.name }))))
      .catch(logger.error);
  }, []);

  useEffect(() => {
    if (open && run) {
      form.setFieldsValue({
        processor_name: run.processor_name,
        program_name: run.program_name,
        start_at: dayjs(run.start_at),
        remark: run.remark ?? "",
      });
      const current: ScannedBlock[] = (run.items ?? []).map((item) => ({
        id: item.block_id,
        code: item.block?.block_code ?? String(item.block_id),
        is_decal: item.block ? !!item.block.specimen : false,
        scannedAt: dayjs(item.created_at).format("HH:mm:ss"),
      }));
      setBlocks(current);
      setBarcodeInput("");
    }
  }, [open, run, form]);

  const fetchPending = async () => {
    try {
      const data = await TissueProcessingService.getPendingBlocks();
      setPendingData(data);
      setIsPendingModalOpen(true);
    } catch (err) {
      logger.error(err);
      message.error("Failed to load pending blocks.");
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const allBlocks = pendingData.flatMap((s) => s.children ?? []);
    const found = allBlocks.find((b) => b.code === barcodeInput);
    if (!found) {
      message.error("Block not found in pending list.");
      setBarcodeInput("");
      return;
    }
    if (blocks.find((b) => b.id === found.id)) {
      message.warning("Block already added.");
      setBarcodeInput("");
      return;
    }
    setBlocks((prev) => [
      { id: found.id, code: found.code, is_decal: !!found.is_decal, scannedAt: dayjs().format("HH:mm:ss") },
      ...prev,
    ]);
    setBarcodeInput("");
  };

  const handleAddFromModal = (selected: ScannedBlock[]) => {
    setBlocks((prev) => {
      const existingIds = new Set(prev.map((b) => b.id));
      return [...prev, ...selected.filter((b) => !existingIds.has(b.id))];
    });
    setIsPendingModalOpen(false);
  };

  const removeBlock = (id: number) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const onFinish = async (values: any) => {
    if (!run) return;
    if (blocks.length === 0) {
      message.error("At least one block is required.");
      return;
    }
    setLoading(true);
    try {
      await TissueProcessingService.updateRun(run.id, {
        processor_name: values.processor_name,
        program_name: values.program_name,
        start_at: values.start_at.toISOString(),
        remark: values.remark || null,
        block_ids: blocks.map((b) => b.id),
      });
      message.success("Run updated successfully.");
      onSuccess();
      onClose();
    } catch (err) {
      logger.error(err);
      message.error("Failed to update run.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        title={`Edit Run: ${run?.run_number}`}
        open={open}
        onCancel={onClose}
        onOk={() => form.submit()}
        okText="Save"
        confirmLoading={loading}
        destroyOnClose
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="processor_name" label="Machine" rules={[{ required: true }]}>
            <Select options={machines} placeholder="Select Machine" />
          </Form.Item>
          <Form.Item name="program_name" label="Program" rules={[{ required: true }]}>
            <Select options={programs} placeholder="Select Program" />
          </Form.Item>
          <Form.Item name="start_at" label="Start Time" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remark" label="Remark">
            <Input.TextArea rows={2} placeholder="Notes (optional)" />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Blocks ({blocks.length})
          </div>
          <Space style={{ marginBottom: 8 }}>
            <form onSubmit={handleScan} style={{ display: "flex", gap: 8 }}>
              <Input
                prefix={<BarcodeOutlined />}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode"
                style={{ width: 200 }}
              />
              <Button htmlType="submit">Add</Button>
            </form>
            <Button icon={<UnorderedListOutlined />} onClick={fetchPending}>
              Browse
            </Button>
          </Space>

          <Table
            dataSource={blocks}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 200 }}
            columns={[
              {
                title: "Block",
                dataIndex: "code",
                render: (code: string) => <Tag color="blue">{code}</Tag>,
              },
              {
                title: "Added At",
                dataIndex: "scannedAt",
              },
              {
                title: "",
                width: 40,
                render: (_, record: ScannedBlock) => (
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeBlock(record.id)}
                  />
                ),
              },
            ]}
          />
        </div>
      </Modal>

      <PendingBlocksModal
        open={isPendingModalOpen}
        dataSource={pendingData}
        onCancel={() => setIsPendingModalOpen(false)}
        onConfirm={handleAddFromModal}
      />
    </>
  );
};

export default EditProcessingRunModal;

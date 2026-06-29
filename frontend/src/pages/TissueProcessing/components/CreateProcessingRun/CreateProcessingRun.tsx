import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Table,
  Space,
  message,
  Divider,
} from "antd";
import type { InputRef } from "antd";
import {
  BarcodeOutlined,
  SaveOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import PendingBlocksModal from "./PendingBlocksModal";
import TissueProcessingService from "../../../../services/tissueProcessingService";
import { PendingDataNode } from "../../../../types/tissueProcessing";
import logger from "../../../../utils/logger";
import { useAuth } from "../../../../hooks/useAuth";

// --- Interfaces ---
interface ScannedBlock {
  id: number;
  code: string;
  is_decal: boolean;
  scannedAt: string;
}

interface CreateProcessingRunProps {
  onBack: () => void;
}


const CreateProcessingRun: React.FC<CreateProcessingRunProps> = ({
  onBack,
}) => {
  const { user: currentUser } = useAuth();
  const [form] = Form.useForm();
  const [scannedBlocks, setScannedBlocks] = useState<ScannedBlock[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [pendingData, setPendingData] = useState<PendingDataNode[]>([]);
  const [machines, setMachines] = useState<{value: string, label: string}[]>([]);
  const [programs, setPrograms] = useState<{value: string, label: string}[]>([]);

  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const ms = await TissueProcessingService.getMachines();
      const ps = await TissueProcessingService.getPrograms();
      setMachines(ms.map((m) => ({ value: m.name, label: m.name })));
      setPrograms(ps.map((p) => ({ value: p.name, label: p.name })));
    } catch (err) {
      logger.error(err);
      message.error("ไม่สามารถโหลดข้อมูลเครื่อง/โปรแกรมได้");
    }
  };

  const fetchPendingBlocks = async () => {
    try {
      const response = await TissueProcessingService.getPendingBlocks();
      setPendingData(response);
    } catch (error) {
      logger.error(error);
      message.error("ไม่สามารถดึงข้อมูลตลับเนื้อที่ค้างอยู่ได้");
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;

    // 1. ยุบ Tree (Case > Blocks) ให้กลายเป็น Array ชั้นเดียวเฉพาะตัวที่เป็น Block
    // วิธีนี้ TypeScript จะรู้ทันทีว่า items ข้างในคือ PendingDataNode
    const allAvailableBlocks = pendingData.flatMap(
      (specimen) => specimen.children || [],
    );

    // 2. ค้นหา Block ที่รหัสตรงกับที่สแกนมา
    const foundBlock = allAvailableBlocks.find((b) => b.code === barcodeInput);

    // 3. ถ้าไม่เจอ ให้เตือนและหยุด
    if (!foundBlock) {
      message.error("ไม่พบรหัสตลับเนื้อนี้ในรายการที่รอเข้าเครื่อง");
      setBarcodeInput("");
      return;
    }

    // 4. ถ้าเจอแล้ว แต่สแกนซ้ำ ให้เตือน
    if (scannedBlocks.find((b) => b.id === foundBlock.id)) {
      message.warning("ตลับนี้ถูกสแกนไปแล้ว");
      setBarcodeInput("");
      return;
    }

    // 5. สร้าง Object ใหม่ (ตอนนี้ Error Property 'id' does not exist on type 'never' จะหายไปแล้ว)
    const newBlock: ScannedBlock = {
      id: foundBlock.id,
      code: foundBlock.code,
      is_decal: foundBlock.is_decal,
      scannedAt: dayjs().format("HH:mm:ss"),
    };

    setScannedBlocks((prev) => [newBlock, ...prev]);
    setBarcodeInput("");
  };

  const handleAddFromModal = (newlySelected: ScannedBlock[]) => {
    setScannedBlocks((prev) => {
      const existingIds = new Set(prev.map((b) => b.id));
      const filtered = newlySelected.filter((nb) => !existingIds.has(nb.id));
      return [...filtered, ...prev];
    });
    setIsModalOpen(false);
  };

  const onFinish = async (values: any) => {
    if (scannedBlocks.length === 0) {
      return message.error("กรุณาเลือกตลับเนื้ออย่างน้อย 1 ตลับ");
    }

    const payload = {
      processor_name: values.processor_name,
      program_name: values.program_name,
      start_at: values.start_at.toISOString(),
      block_ids: scannedBlocks.map((b) => b.id),
      created_by_id: currentUser!.id,
      remark: values.remark,
      status: "processing",
    };

    try {
      await TissueProcessingService.createRun(payload);
      message.success("เริ่มการทำงานสำเร็จ");
      onBack();
    } catch (error) {
      message.error("บันทึกไม่สำเร็จ");
    }
  };

  return (
    <>
      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ start_at: dayjs() }}
        >
          <Space size="large">
            <Form.Item
              name="processor_name"
              label="Machine"
              rules={[{ required: true }]}
              style={{ width: 200 }}
            >
              <Select options={machines} placeholder="Select Machine" />
            </Form.Item>
            <Form.Item
              name="program_name"
              label="Program"
              rules={[{ required: true }]}
              style={{ width: 200 }}
            >
              <Select options={programs} placeholder="Select Program" />
            </Form.Item>
            <Form.Item name="start_at" label="Start Time">
              <DatePicker showTime />
            </Form.Item>
          </Space>

          <Divider>Add Blocks</Divider>

          <Space.Compact style={{ width: "100%", marginBottom: 20 }}>
            <Input
              size="large"
              placeholder="สแกนบาร์โค้ดตลับเนื้อ..."
              prefix={<BarcodeOutlined />}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onPressEnter={handleScan}
              ref={inputRef}
              allowClear
            />
            <Button
              size="large"
              icon={<UnorderedListOutlined />}
              onClick={() => {
                setIsModalOpen(true);
                fetchPendingBlocks();
              }}
            >
              Select from Pending
            </Button>
          </Space.Compact>

          <Table
            dataSource={scannedBlocks}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
            columns={[
              { title: "Block Code", dataIndex: "code", key: "code" },
              { title: "Added At", dataIndex: "scannedAt", key: "scannedAt" },
              {
                title: "Action",
                key: "action",
                render: (_, record: ScannedBlock) => (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      setScannedBlocks(
                        scannedBlocks.filter((b) => b.id !== record.id),
                      )
                    }
                  />
                ),
              },
            ]}
          />

          <Form.Item name="remark" label="Notes" style={{ marginTop: 20 }}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button
            type="primary"
            size="large"
            icon={<SaveOutlined />}
            htmlType="submit"
            block
          >
            Confirm & Start Run
          </Button>
        </Form>
      </Card>

      <PendingBlocksModal
        open={isModalOpen}
        dataSource={pendingData}
        onCancel={() => setIsModalOpen(false)}
        onConfirm={handleAddFromModal}
      />
    </>
  );
};

export default CreateProcessingRun;

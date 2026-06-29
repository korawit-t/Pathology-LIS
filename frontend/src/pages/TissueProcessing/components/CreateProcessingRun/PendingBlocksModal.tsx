import React, { useState } from "react";
import { Modal, Table, Tag, Space, Alert, Typography, Tooltip } from "antd";
import { ExperimentOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { ScannedBlock } from "../../../../types/tissueProcessing";
import { PendingDataNode } from "../../../../types/tissueProcessing";
import dayjs from "dayjs";

const { Text } = Typography;

interface PendingBlocksModalProps {
  open: boolean;
  dataSource: PendingDataNode[];
  onCancel: () => void;
  onConfirm: (selectedBlocks: ScannedBlock[]) => void; // ระบุ Type ให้ชัดเจน
}

const PendingBlocksModal: React.FC<PendingBlocksModalProps> = ({
  open,
  dataSource,
  onCancel,
  onConfirm,
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // คำนวณจำนวน Block ทั้งหมดในเครื่อง (Flatten children)
  const totalPendingBlocks = dataSource.reduce(
    (acc, curr) => acc + (curr.children?.length || 0),
    0,
  );

  // นับจำนวนที่เลือก (กรองเฉพาะ ID ที่ไม่ใช่ Key ของ Case)
  const selectedBlocksCount = selectedRowKeys.filter(
    (key) => typeof key === "number" || !key.toString().startsWith("case-"),
  ).length;

  const handleOk = () => {
    const newlySelected: ScannedBlock[] = [];

    dataSource.forEach((caseGroup) => {
      caseGroup.children?.forEach((block) => {
        if (selectedRowKeys.includes(block.key)) {
          newlySelected.push({
            id: block.id,
            // 🌟 ใช้ full_code ที่เราเตรียมไว้จาก Backend เพื่อให้แสดง S26-xxx A1
            code: block.full_code || block.code,
            is_decal: block.is_decal,
            scannedAt: dayjs().format("HH:mm:ss"),
          });
        }
      });
    });

    onConfirm(newlySelected);
    setSelectedRowKeys([]);
  };

  const columns = [
    {
      title: "Case / Block Code",
      dataIndex: "code",
      key: "code",
      render: (text: string, record: PendingDataNode) => {
        // เช็คว่าใน Case นี้มีลูกตัวไหนต้องทำ Decal ไหม (สำหรับโชว์ไอคอนที่แถว Case)
        const hasDecalChild =
          record.isCase && record.children?.some((child) => child.is_decal);
        // เช็คเฉพาะตัวมันเองถ้าเป็น Block
        const isDecalBlock = !record.isCase && record.is_decal;
        const isDecalFinished = !!record.decal_end_at;

        return (
          <Space>
            {(hasDecalChild || isDecalBlock) && (
              <Tooltip
                title={
                  isDecalFinished ? "Decal เสร็จสิ้น" : "ต้องผ่านการ Decal"
                }
              >
                <ExperimentOutlined
                  style={{
                    // ถ้าเสร็จแล้วให้เป็นสีเขียว ถ้ายังไม่เสร็จเป็นสีส้ม
                    color: isDecalFinished ? "#52c41a" : "#fa541c",
                    fontSize: record.isCase ? "18px" : "14px",
                  }}
                />
              </Tooltip>
            )}
            <span
              style={{
                fontWeight: record.isCase ? "bold" : "normal",
                color:
                  !record.isCase && record.is_decal && !isDecalFinished
                    ? "#bfbfbf"
                    : "inherit",
              }}
            >
              {text}
            </span>
          </Space>
        );
      },
    },
    {
      title: "Type / Status",
      dataIndex: "isCase",
      width: 180,
      render: (isCase: boolean, record: PendingDataNode) => {
        if (isCase)
          return (
            <Tag color="purple">CASE ({record.children?.length || 0})</Tag>
          );

        // Logic สำหรับ Block
        if (record.is_decal) {
          const isFinished = !!record.decal_end_at;
          return (
            <Space>
              <Tag color="blue">BLOCK</Tag>
              <Tag
                icon={
                  isFinished ? (
                    <CheckCircleOutlined />
                  ) : (
                    <ExperimentOutlined spin={!isFinished} />
                  )
                }
                color={isFinished ? "green" : "volcano"}
              >
                {isFinished ? "DECAL DONE" : "DECAL PENDING"}
              </Tag>
            </Space>
          );
        }

        return <Tag color="blue">BLOCK</Tag>;
      },
    },
  ];

  return (
    <Modal
      title="เลือกตลับเนื้อที่รอเข้าเครื่อง"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      width={750}
      destroyOnClose
    >
      <Alert
        message={
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>เลือกที่รหัส Case เพื่อเลือก Blocks ทั้งหมดในเคสนั้น</span>
            <Tag color="blue">
              เลือกแล้ว <b>{selectedBlocksCount}</b> /{" "}
              <b>{totalPendingBlocks}</b> ตลับ
            </Tag>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
          checkStrictly: false,
          getCheckboxProps: (record: PendingDataNode) => {
            // 1. ถ้าเป็นแถวแม่ (Case) ให้ Enable ไว้เสมอ
            if (record.isCase) {
              return { disabled: false, name: record.code };
            }

            // 2. ถ้าเป็นแถวลูก (Block)
            // เงื่อนไข Disable คือ: ต้องเป็น Decal "และ" ยังไม่มีวันสิ้นสุด (decal_end_at)
            // ดังนั้น ถ้ามี decal_end_at (เหมือนใน JSON) เงื่อนไขนี้จะเป็น false และจะ Enable ทันที
            const isDecalNotReady = record.is_decal && !record.decal_end_at;

            return {
              disabled: isDecalNotReady,
              name: record.code,
            };
          },
        }}
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        scroll={{ y: 400 }}
        expandable={{ defaultExpandAllRows: true }}
        size="small"
        footer={() => (
          <div style={{ textAlign: "right" }}>
            <Text strong>ยอดรวมที่กำลังจะเพิ่ม: </Text>
            <Text style={{ fontSize: "18px" }}>{selectedBlocksCount} ตลับ</Text>
          </div>
        )}
      />
    </Modal>
  );
};

export default PendingBlocksModal;

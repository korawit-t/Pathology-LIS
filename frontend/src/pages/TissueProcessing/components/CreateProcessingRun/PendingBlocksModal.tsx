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
  onConfirm: (selectedBlocks: ScannedBlock[]) => void;
}

const PendingBlocksModal: React.FC<PendingBlocksModalProps> = ({
  open,
  dataSource,
  onCancel,
  onConfirm,
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Total number of blocks pending in the machine (flatten children)
  const totalPendingBlocks = dataSource.reduce(
    (acc, curr) => acc + (curr.children?.length || 0),
    0,
  );

  // Count selected (filter out keys that aren't Case keys)
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
            // Use full_code prepared by the backend so it displays as S26-xxx A1
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
        // Check whether any child block in this case requires decal (to show the icon on the case row)
        const hasDecalChild =
          record.isCase && record.children?.some((child) => child.is_decal);
        // Check the block itself if it's a block row
        const isDecalBlock = !record.isCase && record.is_decal;
        const isDecalFinished = !!record.decal_end_at;

        return (
          <Space>
            {(hasDecalChild || isDecalBlock) && (
              <Tooltip
                title={isDecalFinished ? "Decal finished" : "Requires decal"}
              >
                <ExperimentOutlined
                  style={{
                    // Green if finished, orange if not
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

        // Logic for block rows
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
      title="Select tissue blocks pending processing"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      width={750}
      destroyOnClose
    >
      <Alert
        message={
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Select a Case code to select all blocks in that case</span>
            <Tag color="blue">
              Selected <b>{selectedBlocksCount}</b> /{" "}
              <b>{totalPendingBlocks}</b> blocks
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
            // 1. Case rows are always enabled
            if (record.isCase) {
              return { disabled: false, name: record.code };
            }

            // 2. Block rows: disabled when it requires decal AND has no end date (decal_end_at)
            // so once decal_end_at is set, the condition is false and it's enabled
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
            <Text strong>Total to add: </Text>
            <Text style={{ fontSize: "18px" }}>
              {selectedBlocksCount} blocks
            </Text>
          </div>
        )}
      />
    </Modal>
  );
};

export default PendingBlocksModal;

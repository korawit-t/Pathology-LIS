import React from "react";
import { Modal, Table, Tag, Typography, Space } from "antd";
import { SearchOutlined, DeploymentUnitOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface DispatchBlock { block_code?: string; }
interface DispatchSpecimen { blocks?: DispatchBlock[]; }
interface DispatchCase {
  id: number;
  case_type?: string;
  accession_no?: string;
  status?: string;
  specimen_type?: string;
  specimens?: DispatchSpecimen[];
}

interface ManualSelectModalProps {
  open: boolean;
  loading: boolean;
  data: DispatchCase[];
  selectedRowKeys: React.Key[];
  onSelectionChange: (keys: React.Key[]) => void;
  onOk: () => void;
  onCancel: () => void;
  alreadySelectedIds?: number[];
}

const ManualSelectModal: React.FC<ManualSelectModalProps> = ({
  open,
  loading,
  data,
  selectedRowKeys,
  onSelectionChange,
  onOk,
  alreadySelectedIds,
  onCancel,
}) => {
  const expandedRowRender = (record: DispatchCase) => {
    if (record.case_type === "GYNE_CYTO" || record.case_type === "NONGYNE_CYTO") {
      return (
        <div style={{ padding: "12px 60px", background: "#f9f9f9" }}>
          <Text type="secondary" italic>
            Cytology (No Blocks) — {record.specimen_type || "N/A"}
          </Text>
        </div>
      );
    }

    const allBlockCodes =
      record.specimens
        ?.flatMap((spec) => spec.blocks?.map((b) => b.block_code))
        .filter(Boolean) || [];

    return (
      <div style={{ padding: "12px 60px", background: "#f9f9f9" }}>
        <Space size={[0, 8]} wrap>
          <Text type="secondary" style={{ marginRight: 8 }}>Blocks:</Text>
          {allBlockCodes.length > 0 ? (
            allBlockCodes.map((code: string) => (
              <Tag color="blue" key={code} style={{ borderRadius: 4 }}>{code}</Tag>
            ))
          ) : (
            <Text type="secondary" italic>No block data found</Text>
          )}
        </Space>
      </div>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <DeploymentUnitOutlined />
          <span>Select Cases to Dispatch</span>
          <Tag color="blue">{selectedRowKeys.length} selected</Tag>
        </Space>
      }
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      width={720}
      okText="Add Selected"
      cancelText="Cancel"
      destroyOnHidden
    >
      <Table
        loading={loading}
        dataSource={data}
        rowKey={(record) => `${record.case_type}_${record.id}`}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectionChange,
          preserveSelectedRowKeys: true,
          getCheckboxProps: (record) => ({
            disabled: alreadySelectedIds?.includes(record.id),
            name: record.accession_no,
          }),
        }}
        expandable={{
          expandedRowRender,
          defaultExpandAllRows: false,
          rowExpandable: () => true,
        }}
        columns={[
          {
            title: "Accession No.",
            dataIndex: "accession_no",
            render: (text) => (
              <Text strong style={{ color: "#1890ff", fontSize: 16 }}>{text}</Text>
            ),
            filterDropdown: true,
            filterIcon: <SearchOutlined />,
            onFilter: (value, record) =>
              record.accession_no?.toLowerCase().includes((value as string).toLowerCase()) ?? false,
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 140,
            render: (status: string) => (
              <Tag color="orange" style={{ fontWeight: 500 }}>{status?.toUpperCase()}</Tag>
            ),
          },
        ]}
        pagination={{ pageSize: 10 }}
        scroll={{ y: 400 }}
        size="small"
      />
    </Modal>
  );
};

export default ManualSelectModal;

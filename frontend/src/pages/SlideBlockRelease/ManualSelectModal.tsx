import React, { useState } from "react";
import { Modal, Table, Tag, Typography, Space, Input } from "antd";
import { ExportOutlined, SearchOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface ReleaseCase {
  id: number;
  case_type?: string;
  accession_no?: string;
  status?: string;
  patient?: { name?: string };
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

interface ManualSelectModalProps {
  open: boolean;
  loading: boolean;
  data: ReleaseCase[];
  onOk: (selected: ReleaseCase) => void;
  onCancel: () => void;
}

const ManualSelectModal: React.FC<ManualSelectModalProps> = ({
  open,
  loading,
  data,
  onOk,
  onCancel,
}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredData = search
    ? data.filter((r) =>
        r.accession_no?.toLowerCase().includes(search.toLowerCase()) ||
        r.patient?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const handleOk = () => {
    const selected = data.find(
      (r) => `${r.case_type}_${r.id}` === selectedKey
    );
    if (!selected) return;
    onOk(selected);
    setSelectedKey(null);
    setSearch("");
  };

  const handleCancel = () => {
    setSelectedKey(null);
    setSearch("");
    onCancel();
  };

  return (
    <Modal
      title={
        <Space>
          <ExportOutlined />
          <span>Select Case to Release</span>
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Select"
      okButtonProps={{ disabled: !selectedKey }}
      cancelText="Cancel"
      width={720}
      destroyOnClose
    >
      <Input
        placeholder="Search by accession no. or patient name"
        prefix={<SearchOutlined />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 12 }}
      />
      <Table
        loading={loading}
        dataSource={filteredData}
        rowKey={(record) => `${record.case_type}_${record.id}`}
        rowSelection={{
          type: "radio",
          selectedRowKeys: selectedKey ? [selectedKey] : [],
          onChange: (keys) => setSelectedKey(keys[0] as string ?? null),
        }}
        onRow={(record) => ({
          onClick: () => setSelectedKey(`${record.case_type}_${record.id}`),
          style: { cursor: "pointer" },
        })}
        columns={[
          {
            title: "Type",
            dataIndex: "case_type",
            width: 120,
            render: (type: string) => (
              <Tag color={CASE_TYPE_COLOR[type]}>
                {CASE_TYPE_LABEL[type] ?? type}
              </Tag>
            ),
          },
          {
            title: "Accession No.",
            dataIndex: "accession_no",
            render: (text) => (
              <Text strong style={{ color: "#1890ff", fontSize: 15 }}>
                {text}
              </Text>
            ),
          },
          {
            title: "Patient",
            render: (_: unknown, record: ReleaseCase) => (
              <Text>{record.patient?.name ?? "—"}</Text>
            ),
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 120,
            render: (status: string) => (
              <Tag color="green">{status?.toUpperCase()}</Tag>
            ),
          },
        ]}
        pagination={{ pageSize: 10 }}
        scroll={{ y: 420 }}
      />
    </Modal>
  );
};

export default ManualSelectModal;

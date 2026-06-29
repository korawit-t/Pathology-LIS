import React, { useEffect, useState, useCallback } from "react";
import { Table, Button, Modal, Form, Input, Select, message, Space, Popconfirm, Tag, Typography } from "antd";
import { EditOutlined, DeleteOutlined, SyncOutlined, CheckCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import SurgicalBlockService from "../../../services/surgicalBlockService";
import { BlockTimelineService } from "../../../services/blockTimelineService";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import BlockHistoryDrawer from "./BlockHistoryDrawer";

const { Text } = Typography;

const SurgicalBlockManager = ({ searchText, refreshKey = 0 }) => {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [historyBlock, setHistoryBlock] = useState(null);
  const [latestEventMap, setLatestEventMap] = useState({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  const fetchLatestEvents = async (blockList) => {
    const blockIds = new Set(blockList.map((b) => b.id));

    // Fetch timelines + all outlab runs in parallel (single outlab call for all blocks)
    const [timelineResults, allRuns] = await Promise.all([
      Promise.allSettled(
        blockList.map((b) =>
          BlockTimelineService.getTimeline(b.id).then((entries) => ({ id: b.id, entries }))
        )
      ),
      SurgicalBlockStainService.getOutlabRuns({ limit: 500 }).catch(() => []),
    ]);

    // Pre-build outlab events per block_id from runs
    const outlabByBlock = {};
    for (const run of allRuns) {
      for (const d of run.details ?? []) {
        const bid = d.block_id ?? d.stain_order?.block_id;
        if (!bid || !blockIds.has(bid)) continue;
        if (!outlabByBlock[bid]) outlabByBlock[bid] = [];
        outlabByBlock[bid].push({
          event_type: "SENT_TO_OUTLAB",
          source: "auto",
          label: `Sent to Outlab${d.stain_order?.test?.name ? ` — ${d.stain_order.test.name}` : ""}`,
          location: run.destination_lab,
          event_at: run.sent_at,
        });
        if (run.status === "received" && run.received_at) {
          outlabByBlock[bid].push({
            event_type: "RETURNED_FROM_OUTLAB",
            source: "auto",
            label: `Returned from Outlab`,
            location: run.destination_lab,
            event_at: run.received_at,
          });
        }
      }
    }

    const map = {};
    for (const r of timelineResults) {
      if (r.status !== "fulfilled") continue;
      const { id, entries } = r.value;
      const merged = [...entries, ...(outlabByBlock[id] ?? [])].sort(
        (a, b) => new Date(a.event_at) - new Date(b.event_at)
      );
      if (merged.length === 0) continue;

      const latest = merged[merged.length - 1];
      const lastSent = [...merged].reverse().find((e) => e.event_type === "SENT_TO_OUTLAB");
      const lastReturned = [...merged].reverse().find((e) => e.event_type === "RETURNED_FROM_OUTLAB");
      const isAtOutlab =
        !!lastSent &&
        (!lastReturned || new Date(lastSent.event_at) > new Date(lastReturned.event_at));

      map[id] = { latest, isAtOutlab, lastSent };
    }
    setLatestEventMap((prev) => ({ ...prev, ...map }));
  };

  // 1. fetchData แบบรองรับ Pagination และ Search
  const fetchData = useCallback(async (page = currentPage, search = searchText) => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      
      // 🌟 ส่ง skip, limit และ search ไปยัง Backend
      // Backend จะเป็นคน Join ตารางและ Search ให้เราเอง
      const res = await SurgicalBlockService.getBlocks({
        skip: skip,
        limit: pageSize,
        search: search // 🌟 ถ้า Backend ทำ Multi-field search ไว้แล้ว
      });

      const items = res.items || [];
      setBlocks(items);
      setTotal(res.total || 0);

      // Fetch latest timeline event per block in background (no await)
      fetchLatestEvents(items);
    } catch (err) {
      console.error("API Error:", err);
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [pageSize, searchText, currentPage]);

  // 2. Re-fetch when searchText or refreshKey changes
  useEffect(() => {
    setCurrentPage(1);
    fetchData(1, searchText);
  }, [searchText, refreshKey]);

  // 3. เมื่อเปลี่ยนหน้า (Pagination)
  const handleTableChange = (pagination) => {
    setCurrentPage(pagination.current);
    setPageSize(pagination.pageSize);
    fetchData(pagination.current);
  };

  const EVENT_COLOR = {
    GROSSED: "green",
    PROCESSING_IN: "blue",
    PROCESSING_OUT: "blue",
    EMBEDDED: "purple",
    SECTIONED: "cyan",
    STAINED: "magenta",
    STORED: "orange",
    SENT_TO_OUTLAB: "red",
    RETURNED_FROM_OUTLAB: "green",
    NOTE: "default",
  };

  const renderStatus = (status) => {
    const statusMap = {
      grossed: { color: "default", label: "Grossed", icon: null },
      processing: { color: "processing", label: "Processing", icon: <SyncOutlined spin /> },
      processed: { color: "cyan", label: "Processed", icon: <CheckCircleOutlined /> },
      embedded: { color: "success", label: "Embedded", icon: null },
      stored: { color: "orange", label: "Stored", icon: null },
    };
    const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const config = statusMap[status] || { color: "default", label: capitalize(status), icon: null };
    return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
  };

  const columns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no", // 🌟 ใช้ค่าจาก @property ที่เราทำไว้ใน Backend
      key: "accession_no",
      width: 150,
      render: (text) => <b style={{ color: '#1890ff' }}>{text || "-"}</b>
    },
    { 
      title: "Block", 
      key: "block_code",
      render: (_, record) => (
        <Tag color="blue">
          {record.block_code || `${record.specimen_label}${record.block_no}`}
        </Tag>
      )
    },
    {
      title: "Specimen",
      dataIndex: "specimen_name", // 🌟 ใช้ค่าจาก @property ใน Backend
      key: "specimen_name",
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) => {
        const info = latestEventMap[record.id];
        if (!info) return renderStatus(record.status);
        const { latest, isAtOutlab, lastSent } = info;
        return (
          <Space direction="vertical" size={2}>
            {isAtOutlab && (
              <Tag color="red" style={{ margin: 0 }}>
                🚀 Sent to Outlab{lastSent?.location ? ` · ${lastSent.location}` : ""}
              </Tag>
            )}
            {!isAtOutlab && (
              <Tag color={EVENT_COLOR[latest.event_type] ?? "default"} style={{ margin: 0 }}>
                {latest.label}
              </Tag>
            )}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {dayjs(isAtOutlab ? lastSent.event_at : latest.event_at).format("DD/MM/YY HH:mm")}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      width: 100,
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={(e) => {
             e.stopPropagation();
             setEditingId(record.id);
             form.setFieldsValue(record);
             setIsModalOpen(true);
          }} size="small" />
          <Popconfirm title="ลบข้อมูล?" onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small" onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  const handleDelete = async (id) => {
    try {
      await SurgicalBlockService.deleteBlock(id);
      message.success("ลบสำเร็จ");
      fetchData();
    } catch (err) { message.error("ลบไม่สำเร็จ"); }
  };

  return (
    <div>
      <Table
        dataSource={blocks}
        columns={columns}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => setHistoryBlock(record),
          style: { cursor: "pointer" },
        })}
        onChange={handleTableChange} // 🌟 จัดการการเปลี่ยนหน้า
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total, // 🌟 บอกตารางว่าข้อมูลทั้งหมดใน DB มีเท่าไหร่
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} items`
        }}
      />

      <Modal
        title={editingId ? "Edit Block" : "Add Block"}
        open={isModalOpen}
        onCancel={() => {
            setIsModalOpen(false);
            setEditingId(null);
            form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={async (values) => {
            try {
                editingId ? await SurgicalBlockService.updateBlock(editingId, values) : await SurgicalBlockService.createBlock(values);
                message.success("สำเร็จ");
                setIsModalOpen(false);
                fetchData();
            } catch (err) { message.error("ผิดพลาด"); }
        }}>
           <Form.Item name="specimen_id" label="Specimen ID (Reference)">
              <Input type="number" placeholder="กรอก Specimen ID" />
           </Form.Item>
           <Space>
              <Form.Item name="block_no" label="Block No"><Input type="number" /></Form.Item>
              <Form.Item name="status" label="Status" initialValue="grossed">
                <Select style={{ width: 150 }}>
                  <Option value="grossed">Grossed</Option>
                  <Option value="processing">Processing</Option>
                  <Option value="processed">Processed</Option>
                  <Option value="embedded">Embedded</Option>
                </Select>
              </Form.Item>
           </Space>
           <Button type="primary" htmlType="submit" block loading={loading}>Submit</Button>
        </Form>
      </Modal>

      <BlockHistoryDrawer
        open={!!historyBlock}
        onClose={() => {
          const block = historyBlock;
          setHistoryBlock(null);
          if (block) fetchLatestEvents([block]);
        }}
        blockId={historyBlock?.id ?? null}
        blockCode={historyBlock?.block_code || `${historyBlock?.specimen_label || ""}${historyBlock?.block_no || ""}`}
        accessionNo={historyBlock?.accession_no}
      />
    </div>
  );
};

export default SurgicalBlockManager;
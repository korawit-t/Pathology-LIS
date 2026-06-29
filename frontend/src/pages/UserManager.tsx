import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  message,
  Space,
  Popconfirm,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EditOutlined,
  DeleteOutlined,
  UserAddOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import api from "../services/httpClient";
import PageContainer from "../components/Layout/PageContainer";
import logger from "../utils/logger";

const { Title } = Typography;

interface UserRecord {
  id: number;
  username: string;
  full_name: string;
  roles: string[];
  hospital_id: number;
  position_id: number;
  email?: string;
  password?: string;
}

interface HospitalRecord {
  id: number;
  name: string;
}

interface PositionRecord {
  id: number;
  name: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "System Admin" },
  { value: "pathologist", label: "Pathologist" },
  { value: "cytotechnologist", label: "Cytotech" },
  { value: "histo", label: "Histo" },
  { value: "gross", label: "Gross" },
  { value: "immuno", label: "Immuno" },
  { value: "financial", label: "Financial" },
  { value: "hospital", label: "Hospital" },
];

const UserManager: React.FC = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [hospitals, setHospitals] = useState<HospitalRecord[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<UserRecord>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, hospitalsRes, positionsRes] = await Promise.all([
        api.get("/users"),
        api.get("/org/hospitals"),
        api.get("/org/positions"),
      ]);
      setUsers(usersRes.data);
      setHospitals(hospitalsRes.data);
      setPositions(positionsRes.data);
    } catch (err) {
      logger.error(err);
      message.error("โหลดข้อมูลไม่สำเร็จ (คุณอาจไม่มีสิทธิ์ Admin)");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (values: UserRecord) => {
    try {
      if (editingId) {
        if (!values.password) {
          delete values.password;
        }
        await api.put(`/users/${editingId}`, values);
        message.success("แก้ไขผู้ใช้งานสำเร็จ");
      } else {
        await api.post("/users", values);
        message.success("สร้างผู้ใช้งานสำเร็จ");
      }
      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchData();
    } catch (err) {
      logger.error(err);
      message.error("บันทึกข้อมูลไม่สำเร็จ (Username/Email อาจซ้ำ)");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      message.success("ลบผู้ใช้งานสำเร็จ");
      fetchData();
    } catch (err) {
      message.error("ลบไม่สำเร็จ");
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (record: UserRecord) => {
    setEditingId(record.id);
    form.setFieldsValue({ ...record, password: "" });
    setIsModalOpen(true);
  };

  const columns: ColumnsType<UserRecord> = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "Username", dataIndex: "username", width: 120 },
    { title: "Full Name", dataIndex: "full_name" },
    {
      title: "Role",
      dataIndex: "roles",
      render: (roles: string[]) => (
        <>
          {roles?.map((role) => {
            let color = "default";
            if (role === "admin") color = "red";
            else if (role === "pathologist") color = "purple";
            else if (role === "cytotechnologist") color = "magenta";
            else if (["lab_tech", "histo", "gross", "immuno"].includes(role)) color = "blue";
            else if (role === "financial") color = "gold";
            else if (role === "hospital") color = "cyan";
            return (
              <Tag color={color} key={role}>
                {role.toUpperCase()}
              </Tag>
            );
          })}
        </>
      ),
    },
    {
      title: "Hospital",
      dataIndex: "hospital_id",
      render: (id: number) => hospitals.find((h) => h.id === id)?.name || "-",
    },
    {
      title: "Position",
      dataIndex: "position_id",
      render: (id: number) => positions.find((p) => p.id === id)?.name || "-",
    },
    {
      title: "Action",
      key: "action",
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Popconfirm title="Delete this user?" onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <TeamOutlined style={{ marginRight: 12, color: "#595959" }} />
          User Management
        </Title>
      }
      extra={
        <Button type="primary" icon={<UserAddOutlined />} onClick={openAddModal}>
          Add New User
        </Button>
      }
    >
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 800, y: "calc(100vh - 260px)" }}
        sticky
      />

      <Modal
        title={editingId ? "Edit User" : "Create New User"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Form.Item name="username" label="Username" rules={[{ required: true }]}>
              <Input disabled={!!editingId} />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: "email" }]}
            >
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Form.Item name="hospital_id" label="Hospital" rules={[{ required: true }]}>
              <Select placeholder="Select Hospital">
                {hospitals.map((h) => (
                  <Select.Option key={h.id} value={h.id}>
                    {h.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="position_id" label="Position" rules={[{ required: true }]}>
              <Select placeholder="Select Position">
                {positions.map((p) => (
                  <Select.Option key={p.id} value={p.id}>
                    {p.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="roles" label="Permission" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="Select permissions" options={ROLE_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="password"
            label={editingId ? "New Password (Leave blank to keep current)" : "Password"}
            rules={[{ required: !editingId, message: "Please input password" }]}
          >
            <Input.Password />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large">
            {editingId ? "Update User" : "Create User"}
          </Button>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default UserManager;

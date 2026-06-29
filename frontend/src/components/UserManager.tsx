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
  Row,
  Col,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  UserAddOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { ROLE_OPTIONS } from "../constants/roles.constants";
import UserService from "../services/userService";
import PositionService from "../services/positionService";
import HospitalService from "../services/hospitalService";
import { User } from "../types/user";
import { Hospital } from "../types/hospital";
import PageContainer from "./Layout/PageContainer";
import logger from "../utils/logger";


interface Position {
  id: number;
  name: string;
}

const UserManager: React.FC = () => {
  // --- 2. Typed States ---
  const [users, setUsers] = useState<User[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [searchText, setSearchText] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<User>();

  const filteredUsers = users.filter((u) => {
    const q = searchText.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.report_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  // --- 3. Fetch Data ---
  const fetchData = async () => {
    setLoading(true);
    try {
      // 🚀 ตอนนี้ getUsers, getHospitals, getPositions คืนค่า data มาให้เลย
      const [users, hospitals, positions] = await Promise.all([
        UserService.getUsers(),
        HospitalService.getHospitals(),
        PositionService.getPositions(),
      ]);

      // ✅ แก้ไข: ตัด .data ออก เพราะค่าที่ได้คือ Array ข้อมูลโดยตรงแล้ว
      setUsers(users);
      setHospitals(hospitals);
      setPositions(positions);
    } catch (err) {
      logger.error("Fetch Data Error:", err);
      message.error("โหลดข้อมูลพื้นฐานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- 4. Handle Submit ---
  const handleSubmit = async (values: any) => {
    // เปลี่ยนเป็น any หรือ UserFormValues
    try {
      // ใช้เครื่องมือของ JS เพื่อแยก password ออกมาจัดการต่างหาก
      const { password, ...otherValues } = values;

      // สร้าง payload พื้นฐาน
      let payload: Partial<User> & { password?: string } = {
        ...otherValues,
        email: otherValues.email || null,
      };

      if (editingId) {
        // ✅ กรณีแก้ไข: ถ้ามีการกรอก password มาใหม่ (ไม่เป็นค่าว่าง) ให้ใส่ลงใน payload
        if (password && password.trim() !== "") {
          payload.password = password;
        }
        // ถ้าไม่มี password ก็ไม่ต้องใส่ลงไปใน payload (Backend จะไม่โดนเขียนทับด้วยค่าว่าง)

        await UserService.updateUser(editingId, payload);
        message.success("แก้ไขผู้ใช้งานสำเร็จ");
      } else {
        // ✅ กรณีสร้างใหม่: ต้องส่ง password ไปด้วย
        payload.password = password;
        await UserService.createUser(payload);
        message.success("สร้างผู้ใช้งานสำเร็จ");
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchData();
    } catch (err: any) {
      logger.error(err);
      // แสดง Error message จาก Backend ถ้ามี
      const errorMsg = err.response?.data?.detail || "บันทึกข้อมูลไม่สำเร็จ";
      message.error(errorMsg);
    }
  };

  // --- 5. Handle Delete ---
  const handleDelete = async (id: number) => {
    try {
      await UserService.deleteUser(id);
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

  const openEditModal = (record: User) => {
    setEditingId(record.id);

    // ✅ ใช้ 'as any' หรือระบุ Interface ของฟอร์ม (UserFormValues)
    // เพื่อให้ใส่ password: "" เข้าไปใน Object ได้โดยไม่เกิด Type Error
    form.setFieldsValue({
      ...(record as unknown as Record<string, unknown>),
      password: "",
    } as Record<string, unknown>);

    setIsModalOpen(true);
  };

  // --- 6. Typed Columns ---
  const columns: ColumnsType<User> = [
    {
      title: "ID",
      dataIndex: "id",
      width: 70,
      align: "center",
      sorter: (a: User, b: User) => a.id - b.id,
      defaultSortOrder: "ascend" as const,
    },
    {
      title: "Username",
      dataIndex: "username",
      width: 120,
    },
    {
      title: "Display & Report Name",
      key: "names",
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: "bold" }}>{record.full_name}</div>
          {record.report_name && (
            <small style={{ color: "#8c8c8c" }}>
              Report Title:{" "}
              <span style={{ color: "#52c41a" }}>{record.report_name}</span>
            </small>
          )}
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "roles",
      width: 200,
      render: (roles: string[]) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {roles?.map((roleValue) => {
            const roleOption = ROLE_OPTIONS.find(
              (opt) => opt.value === roleValue,
            );
            const tagColor = roleOption?.color || "default";
            const tagLabel = roleOption?.label || roleValue.toUpperCase();

            return (
              <Tag color={tagColor} key={roleValue}>
                {tagLabel}
              </Tag>
            );
          })}
        </div>
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
      width: 100,
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              size="small"
            />
          </Tooltip>
          <Popconfirm
            title="Delete this user?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Typography.Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <TeamOutlined style={{ marginRight: 12, color: "#595959" }} />
          User Management
        </Typography.Title>
      }
      extra={
        <Button type="primary" icon={<UserAddOutlined />} onClick={openAddModal}>
          Add New User
        </Button>
      }
    >
      <Input
        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
        placeholder="ค้นหา username, ชื่อ, report name, email..."
        allowClear
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }}
      />
      <Table
        dataSource={filteredUsers}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingId ? "Edit User" : "Create New User"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="Username"
                rules={[{ required: true }]}
              >
                <Input disabled={!!editingId} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email" rules={[{ type: "email" }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="full_name"
            label="ชื่อ-นามสกุล (ภาษาไทย)"
            rules={[{ required: true }]}
          >
            <Input placeholder="เช่น นายสมชาย ใจดี" />
          </Form.Item>

          <Form.Item
            name="report_name"
            label={
              <span>
                Report Name (English / ลงนามรายงาน)
                <Tooltip title="ชื่อที่จะปรากฏในรายงานผลภาษาอังกฤษ เช่น Somchai Jaidee, M.D.">
                  <small style={{ marginLeft: 4, color: "#999" }}>(?)</small>
                </Tooltip>
              </span>
            }
          >
            <Input
              placeholder="เช่น Somchai Jaidee, M.D."
              style={{ borderColor: "#52c41a" }}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="hospital_id"
                label="Hospital"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select Hospital">
                  {hospitals.map((h) => (
                    <Select.Option key={h.id} value={h.id}>
                      {h.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="position_id"
                label="Position"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select Position">
                  {positions.map((p) => (
                    <Select.Option key={p.id} value={p.id}>
                      {p.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="roles"
            label="Permission / Roles"
            rules={[{ required: true }]}
          >
            <Select
              mode="multiple"
              options={ROLE_OPTIONS}
              allowClear
              placeholder="Select Roles"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={
              editingId
                ? "New Password (Leave blank to keep current)"
                : "Password"
            }
            rules={[{ required: !editingId }]}
          >
            <Input.Password />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            style={{ marginTop: 10 }}
          >
            {editingId ? "Update User" : "Create User"}
          </Button>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default UserManager;

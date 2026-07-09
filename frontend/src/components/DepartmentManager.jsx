import React, { useEffect, useState } from "react";
import { 
    Table, Button, Modal, Form, Input, Switch, 
    Space, Popconfirm, message, Typography, Card, Tag
} from "antd";
import { 
    PlusOutlined, EditOutlined, DeleteOutlined, 
    AppstoreOutlined, SearchOutlined 
} from "@ant-design/icons";
import DepartmentService from "../services/departmentService";

const { Title } = Typography;

const DepartmentManager = () => {
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [searchText, setSearchText] = useState("");
    const [form] = Form.useForm();

    // 1. Fetch Data
    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await DepartmentService.getDepartments(false); // เอาทั้งหมดรวมที่ inactive
            setDepartments(response);
        } catch {
            message.error("ไม่สามารถโหลดข้อมูลแผนกได้");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // 2. Handle Create/Update
    const handleSubmit = async (values) => {
        try {
            if (editingId) {
                await DepartmentService.updateDepartment(editingId, values);
                message.success("อัปเดตแผนกสำเร็จ");
            } else {
                await DepartmentService.createDepartment(values);
                message.success("เพิ่มแผนกใหม่สำเร็จ");
            }
            setIsModalOpen(false);
            form.resetFields();
            fetchData();
        } catch (err) {
            message.error(err.response?.data?.detail || "เกิดข้อผิดพลาด");
        }
    };

    // 3. Handle Delete (Soft Delete แนะนำให้ใช้ Switch Active แทน)
    const handleDelete = async (id) => {
        try {
            await DepartmentService.deleteDepartment(id);
            message.success("ลบแผนกสำเร็จ");
            fetchData();
        } catch {
            message.error("ไม่สามารถลบได้ เนื่องจากมีการใช้งานอยู่ในระบบ");
        }
    };

    const openModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue(record);
        } else {
            setEditingId(null);
            form.resetFields();
            form.setFieldsValue({ is_active: true });
        }
        setIsModalOpen(true);
    };

    // 4. Columns Definition
    const columns = [
        {
            title: "Department Name",
            dataIndex: "name",
            key: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
            filteredValue: [searchText],
            onFilter: (value, record) => record.name.toLowerCase().includes(value.toLowerCase()),
        },
        {
            title: "Status",
            dataIndex: "is_active",
            key: "is_active",
            width: 120,
            align: 'center',
            render: (isActive) => (
                isActive ? <Tag color="green">Active</Tag> : <Tag color="red">Inactive</Tag>
            ),
        },
        {
            title: "Action",
            key: "action",
            width: 150,
            align: 'center',
            render: (_, record) => (
                <Space>
                    <Button 
                        icon={<EditOutlined />} 
                        onClick={() => openModal(record)} 
                        size="small" 
                    />
                    <Popconfirm 
                        title="ยืนยันการลบ?" 
                        onConfirm={() => handleDelete(record.id)}
                        disabled={record.is_active} // ป้องกันการลบแผนกที่ยังใช้งานอยู่
                    >
                        <Button 
                            icon={<DeleteOutlined />} 
                            danger 
                            size="small" 
                            disabled={record.is_active}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Card>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <Title level={3}><AppstoreOutlined /> Department Management</Title>
                <Space>
                    <Input
                        placeholder="Search department..."
                        prefix={<SearchOutlined />}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
                        Add Department
                    </Button>
                </Space>
            </div>

            <Table 
                dataSource={departments} 
                columns={columns} 
                rowKey="id" 
                loading={loading}
                pagination={{ pageSize: 10 }}
            />

            <Modal
                title={editingId ? "Edit Department" : "Add New Department"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                okText="Save"
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item 
                        name="name" 
                        label="Department Name" 
                        rules={[{ required: true, message: "กรุณากรอกชื่อแผนก" }]}
                    >
                        <Input placeholder="เช่น Surgery, Internal Medicine" />
                    </Form.Item>

                    <Form.Item 
                        name="is_active" 
                        label="Active Status" 
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default DepartmentManager;
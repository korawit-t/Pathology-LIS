import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Space,
  Popconfirm,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ManOutlined,
  WomanOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs"; // ใช้สำหรับจัดการ Date
import TitleService from "../services/titleService";
import PatientService from "../services/patientService";
import PageContainer from "./Layout/PageContainer";

const { Option } = Select;
const { Title, Text } = Typography;

const PatientManager = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  // State สำหรับ Master Data Lookups
  const [titles, setTitles] = useState([]);

  const [searchText, setSearchText] = useState("");
  const filteredPatients = patients.filter(
    (p) =>
      (p.name && p.name.toLowerCase().includes(searchText.toLowerCase())) ||
      (p.cid && p.cid.includes(searchText)),
  );

  // --- 1. Fetch Data (รวม Lookups) ---
  const fetchData = async () => {
    setLoading(true);
    try {
      // 🚩 ดึงข้อมูลมา (ลบ schemeRes ที่ไม่ได้ใช้ออกเพื่อให้ TypeScript/ESLint ไม่บ่น)
      const [patientList, titleList] = await Promise.all([
        PatientService.getPatients(),
        TitleService.getTitles(),
      ]);

      // ✅ patientList คือ Array ของคนไข้แล้ว (เพราะ Service แกะ res.data มาให้แล้ว)
      // ใช้ spread operator [...] เพื่อ clone array ก่อนทำการ sort
      if (Array.isArray(patientList)) {
        setPatients([...patientList].sort((a, b) => a.id - b.id));
      }

      // ✅ ทำแบบเดียวกันกับ titles
      const rawTitles = titleList?.data || titleList; // เผื่อ TitleService ยังไม่ได้แกะ res.data
      setTitles(Array.isArray(rawTitles) ? rawTitles : []);
    } catch (err) {
      console.error("Error fetching data:", err);
      message.error("โหลดข้อมูลคนไข้/Master Data ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- 2. Handle Submit (Create/Update) ---
  const handleSubmit = async (values) => {
    try {
      // แปลง DatePicker (dayjs object) ให้เป็น string "YYYY-MM-DD" ก่อนส่ง API
      const formattedValues = {
        ...values,
        birth_date: values.birth_date
          ? values.birth_date.format("YYYY-MM-DD")
          : null,
      };

      if (editingId) {
        // Update
        await PatientService.updatePatient(editingId, formattedValues);
        message.success("แก้ไขข้อมูลคนไข้สำเร็จ");
      } else {
        // Create
        await PatientService.createPatient(formattedValues);
        message.success("เพิ่มข้อมูลคนไข้สำเร็จ");
      }

      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchData(); // โหลดข้อมูลใหม่
    } catch (err) {
      console.error(err.response?.data);
      message.error(
        err.response?.data?.detail ||
          "เกิดข้อผิดพลาดในการบันทึกข้อมูล (HN/CID อาจซ้ำ)",
      );
    }
  };

  // --- 3. Handle Delete ---
  const handleDelete = async (id) => {
    try {
      await PatientService.deletePatient(id);
      message.success("ลบข้อมูลคนไข้สำเร็จ");
      fetchData();
    } catch (err) {
      message.error("ลบข้อมูลไม่สำเร็จ");
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      birth_date: record.birth_date ? dayjs(record.birth_date) : null,
    });
    setIsModalOpen(true);
  };

  // --- 4. Column Definition ---
  const columns = [
    { title: "CID", dataIndex: "cid", width: 120, align: "center" },
    {
      title: "Patient Name",
      dataIndex: "name",
      render: (text, record) => (
        <span>
          {record.title?.title ? <Text style={{ marginRight: 2 }}>{record.title.title}</Text> : null}
          <Text>{[text, record.ln].filter(Boolean).join(" ")}</Text>
        </span>
      ),
    },
    {
      title: "Gender",
      dataIndex: "gender",
      width: 90,
      align: "center",
      render: (gender) => {
        if (gender === "Male")
          return (
            <Tooltip title="ชาย">
              <ManOutlined style={{ color: "blue" }} />
            </Tooltip>
          );
        if (gender === "Female")
          return (
            <Tooltip title="หญิง">
              <WomanOutlined style={{ color: "red" }} />
            </Tooltip>
          );
        return <Tag>{gender || "-"}</Tag>;
      },
    },
    {
      title: "Birthdate",
      dataIndex: "birth_date",
      width: 120,
      render: (date) => (date ? dayjs(date).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Action",
      width: 100,
      align: "center",
      render: (_, record) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
            size="small"
          />
          <Popconfirm
            title="ยืนยันการลบ?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // --- 5. Render UI ---
  return (
    <PageContainer withCard>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Patient Management
        </Title>

        <Space>
          <Input.Search
            placeholder="Search by Name or CID"
            style={{ width: 250 }}
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            Add Patient
          </Button>
        </Space>
      </div>

      <Table
        dataSource={filteredPatients}
        columns={columns}
        rowKey="id"
        loading={loading}
        variant
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingId ? "Edit Patient Data" : "Add Patient Data"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "16px",
            }}
          >
            {/* Row 1: Basic Info */}
            <Form.Item name="title_id" label="Title">
              <Select placeholder="Select Title">
                {titles.map((t) => (
                  <Option key={t.id} value={t.id}>
                    {t.title}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="name"
              label="First Name"
              rules={[{ required: true, message: "Please enter first name" }]}
            >
              <Input placeholder="First Name" />
            </Form.Item>

            <Form.Item name="ln" label="Last Name">
              <Input placeholder="Last Name" />
            </Form.Item>

            <Form.Item
              name="gender"
              label="Gender"
              rules={[{ required: true }]}
            >
              <Select placeholder="Select Gender">
                <Option value="Male">ชาย (Male)</Option>
                <Option value="Female">หญิง (Female)</Option>
                <Option value="Other">อื่นๆ (Other)</Option>
              </Select>
            </Form.Item>

            {/* Row 2: Identifiers */}
            <Form.Item name="cid" label="CID (Citizen ID)">
              <Input placeholder="เลขบัตรประชาชน" maxLength={13} />
            </Form.Item>

            <Form.Item name="birth_date" label="Birthdate">
              <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <Button
            type="primary"
            htmlType="submit"
            style={{ marginTop: 20 }}
            block
          >
            {editingId ? "Update Patient" : "Create Patient"}
          </Button>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default PatientManager;

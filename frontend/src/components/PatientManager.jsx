import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import debounce from "lodash/debounce";
import TitleService from "../services/titleService";
import PatientService from "../services/patientService";
import PageContainer from "./Layout/PageContainer";

const { Option } = Select;
const { Title, Text } = Typography;

const DEFAULT_PAGE_SIZE = 20;

const PatientManager = () => {
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  // State สำหรับ Master Data Lookups
  const [titles, setTitles] = useState([]);

  // คำค้นที่ส่งไป server จริง — ค้นที่ server (ชื่อ/นามสกุล/CID/HN ของเคสทุกประเภท)
  // ไม่ใช่กรองเฉพาะแถวที่โหลดมาแล้ว ไม่งั้นจะหาคนไข้นอกหน้าที่โหลดไม่เจอ
  const [query, setQuery] = useState("");
  // กันผลของ request เก่าที่ตอบกลับช้ามาทับผลล่าสุด
  const requestSeq = useRef(0);

  // --- 1. Fetch Data ---
  const fetchPatients = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const res = await PatientService.getPatientPage({
        q: query || undefined,
        skip: (page - 1) * pageSize,
        limit: pageSize,
      });
      if (seq !== requestSeq.current) return;
      setPatients(Array.isArray(res?.items) ? res.items : []);
      setTotal(res?.total ?? 0);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error("Error fetching patients:", err);
      message.error("โหลดข้อมูลคนไข้ไม่สำเร็จ");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [query, page, pageSize]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  useEffect(() => {
    TitleService.getTitles()
      .then((titleList) => {
        const rawTitles = titleList?.data || titleList; // เผื่อ TitleService ยังไม่ได้แกะ res.data
        setTitles(Array.isArray(rawTitles) ? rawTitles : []);
      })
      .catch((err) => {
        console.error("Error fetching titles:", err);
        message.error("โหลด Master Data คำนำหน้าไม่สำเร็จ");
      });
  }, []);

  const applySearch = useCallback((value) => {
    setQuery((value || "").trim());
    setPage(1);
  }, []);
  const debouncedApplySearch = useMemo(() => debounce(applySearch, 400), [applySearch]);
  useEffect(() => () => debouncedApplySearch.cancel(), [debouncedApplySearch]);

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

      const wasEditing = editingId;
      setIsModalOpen(false);
      form.resetFields();
      setEditingId(null);
      // คนไข้ใหม่อยู่บนสุดของหน้า 1 (เรียงใหม่สุดก่อน)
      if (!wasEditing && page !== 1) setPage(1);
      else fetchPatients();
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
      // ลบแถวสุดท้ายของหน้าสุดท้าย → ถอยไปหน้าก่อน แทนที่จะค้างหน้าว่าง
      if (patients.length === 1 && page > 1) setPage(page - 1);
      else fetchPatients();
    } catch (err) {
      // 409 จาก backend บอกว่าคนไข้ยังมีเคสประเภทไหนอยู่กี่เคส
      message.error(err.response?.data?.detail || "ลบข้อมูลไม่สำเร็จ");
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
      // "รพ.: HN" จากเคสทุกประเภท (surgical / gyne / non-gyne / molecular)
      title: "HN",
      dataIndex: "hn",
      width: 220,
      render: (hn) =>
        hn
          ? hn.split(", ").map((label) => (
              <div key={label}>
                <Text>{label}</Text>
              </div>
            ))
          : "-",
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
            placeholder="Search by Name, CID or HN"
            style={{ width: 280 }}
            allowClear
            onChange={(e) => debouncedApplySearch(e.target.value)}
            onSearch={(value) => {
              debouncedApplySearch.cancel();
              applySearch(value);
            }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            Add Patient
          </Button>
        </Space>
      </div>

      <Table
        dataSource={patients}
        columns={columns}
        rowKey="id"
        loading={loading}
        variant
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (count) => `ทั้งหมด ${count} คน`,
          onChange: (nextPage, nextSize) => {
            if (nextSize !== pageSize) {
              setPageSize(nextSize);
              setPage(1);
            } else {
              setPage(nextPage);
            }
          },
        }}
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

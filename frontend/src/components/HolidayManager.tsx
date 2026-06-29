import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  Space,
  message,
  Popconfirm,
  Card,
  Collapse,
  Select,
  Typography,
  Divider,
  Alert,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  GoogleOutlined,
  DownloadOutlined,
  SettingOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import HolidayService, { GoogleCalendarConfig, Holiday } from "../services/holidayService";

const { Text } = Typography;

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = dayjs().year() - 1 + i;
  return { label: String(y), value: y };
});

const DEFAULT_CALENDAR_ID = "th.th#holiday@group.v.calendar.google.com";

const HolidayManager = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  // Google Calendar config state
  const [configForm] = Form.useForm();
  const [configLoading, setConfigLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importYear, setImportYear] = useState(dayjs().year());

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const holidays = await HolidayService.getHolidays();
      setData(holidays);
    } catch {
      message.error("Failed to load holidays");
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    setConfigLoading(true);
    try {
      const config = await HolidayService.getGoogleCalendarConfig();
      configForm.setFieldsValue({
        api_key: config.api_key,
        calendar_id: config.calendar_id,
      });
    } catch {
      // silently ignore — config may not exist yet
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
    fetchConfig();
  }, []);

  const handleAdd = async (values: any) => {
    try {
      await HolidayService.createHoliday({
        holiday_date: values.holiday_date.format("YYYY-MM-DD"),
        name: values.name,
      });
      message.success("Holiday added");
      setIsModalVisible(false);
      form.resetFields();
      fetchHolidays();
    } catch {
      message.error("Failed to add holiday");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await HolidayService.deleteHoliday(id);
      message.success("Holiday deleted");
      fetchHolidays();
    } catch {
      message.error("Delete failed");
    }
  };

  const handleSaveConfig = async (values: GoogleCalendarConfig) => {
    try {
      await HolidayService.saveGoogleCalendarConfig(values);
      message.success("Google Calendar config saved");
    } catch {
      message.error("Failed to save config");
    }
  };

  const handleImport = async () => {
    const calendarId = configForm.getFieldValue("calendar_id") || DEFAULT_CALENDAR_ID;
    setImportLoading(true);
    try {
      const result = await HolidayService.importFromGoogleCalendar(importYear, calendarId);
      message.success(
        `Imported ${result.created} holidays for ${importYear} (${result.skipped} already existed)`,
      );
      fetchHolidays();
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Import failed";
      message.error(detail);
    } finally {
      setImportLoading(false);
    }
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "holiday_date",
      key: "holiday_date",
      render: (text: string) => dayjs(text).format("DD/MM/YYYY"),
      sorter: (a: Holiday, b: Holiday) =>
        dayjs(a.holiday_date).unix() - dayjs(b.holiday_date).unix(),
    },
    { title: "Holiday Name", dataIndex: "name", key: "name" },
    {
      title: "Action",
      key: "action",
      render: (_: unknown, record: Holiday) => (
        <Popconfirm
          title="Delete this holiday?"
          onConfirm={() => handleDelete(record.id)}
        >
          <Button type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      {/* Google Calendar config panel */}
      <Collapse
        style={{ marginBottom: 16 }}
        items={[
          {
            key: "gcal",
            label: (
              <Space>
                <GoogleOutlined style={{ color: "#4285F4" }} />
                <Text strong>Google Calendar Integration</Text>
              </Space>
            ),
            children: (
              <div>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Set up a Google Calendar API key to automatically import public holidays."
                  description={
                    <span>
                      Get an API key from{" "}
                      <Text code>Google Cloud Console → APIs & Services → Credentials</Text>
                      {" "}and enable the <Text code>Google Calendar API</Text>.
                    </span>
                  }
                />

                <Form
                  form={configForm}
                  layout="vertical"
                  onFinish={handleSaveConfig}
                  initialValues={{ calendar_id: DEFAULT_CALENDAR_ID }}
                >
                  <Form.Item
                    name="api_key"
                    label="API Key"
                    rules={[{ required: true, message: "API key is required" }]}
                  >
                    <Input.Password
                      placeholder="AIza..."
                      autoComplete="new-password"
                    />
                  </Form.Item>
                  <Form.Item
                    name="calendar_id"
                    label="Calendar ID"
                    tooltip="Default: Thai public holidays. Change to any public Google Calendar ID."
                  >
                    <Input placeholder={DEFAULT_CALENDAR_ID} />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button
                      type="default"
                      icon={<SaveOutlined />}
                      htmlType="submit"
                      loading={configLoading}
                    >
                      Save Config
                    </Button>
                  </Form.Item>
                </Form>

                <Divider />

                <Space align="center" wrap>
                  <Text strong>Import holidays for year:</Text>
                  <Select
                    value={importYear}
                    onChange={setImportYear}
                    options={YEAR_OPTIONS}
                    style={{ width: 100 }}
                  />
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    loading={importLoading}
                    onClick={handleImport}
                  >
                    Import from Google Calendar
                  </Button>
                </Space>
              </div>
            ),
          },
        ]}
      />

      {/* Holiday table toolbar */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsModalVisible(true)}
        >
          Add Holiday
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title="Add New Holiday"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item
            name="holiday_date"
            label="Date"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Holiday Name"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g. Songkran Festival" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default HolidayManager;

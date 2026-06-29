import React, { useState } from "react";
import {
  Row,
  Col,
  Card,
  Button,
  DatePicker,
  Space,
  Typography,
  Divider,
  List,
  Tag,
} from "antd";
import { DownloadOutlined, BarChartOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const ExportPanel: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);

  const presets: { label: string; value: [Dayjs, Dayjs] }[] = [
    { label: "This Month", value: [dayjs().startOf("month"), dayjs().endOf("month")] },
    { label: "Last Month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
    { label: "This Year", value: [dayjs().startOf("year"), dayjs().endOf("year")] },
    { label: "Last 3 Months", value: [dayjs().subtract(3, "month").startOf("month"), dayjs().endOf("month")] },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Space align="center">
          <DownloadOutlined style={{ fontSize: 24, color: "#1890ff" }} />
          <Title level={3} style={{ margin: 0 }}>
            Export Reports
          </Title>
        </Space>
        <Space wrap>
          <Text type="secondary">Period:</Text>
          <RangePicker
            value={dateRange}
            onChange={(vals) => {
              if (vals?.[0] && vals?.[1]) setDateRange([vals[0], vals[1]]);
            }}
            format="DD/MM/YYYY"
            allowClear={false}
            presets={presets}
          />
        </Space>
      </div>

      <Divider style={{ margin: "0 0 20px 0" }} />

      <Row gutter={[16, 16]}>
        {/* Quick preset buttons */}
        <Col span={24}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", background: "#fafafa" }}
          >
            <Text type="secondary" style={{ marginRight: 12 }}>Quick select:</Text>
            <Space wrap>
              {presets.map((p) => (
                <Button
                  key={p.label}
                  size="small"
                  onClick={() => setDateRange(p.value)}
                  type={
                    dateRange[0].isSame(p.value[0], "day") && dateRange[1].isSame(p.value[1], "day")
                      ? "primary"
                      : "default"
                  }
                >
                  {p.label}
                </Button>
              ))}
            </Space>
            <Divider style={{ margin: "12px 0 8px" }} />
            <Text type="secondary" style={{ fontSize: 13 }}>
              Selected:{" "}
              <Text strong>
                {dateRange[0].format("DD/MM/YYYY")} – {dateRange[1].format("DD/MM/YYYY")}
              </Text>
            </Text>
          </Card>
        </Col>

        {/* Coming soon placeholder */}
        <Col span={24}>
          <Card
            bordered={false}
            style={{
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              background: "#f9f9f9",
            }}
          >
            <Title level={5} style={{ marginTop: 0 }}>
              <BarChartOutlined style={{ marginRight: 8 }} />
              Additional Export Types
            </Title>
            <List
              size="small"
              dataSource={[
                { label: "Workload Summary Report", format: "Excel", soon: true },
                { label: "TAT Analysis Report", format: "Excel", soon: true },
                { label: "Cancer Registry Export", format: "Excel", soon: true },
                { label: "Cytology Statistics Report", format: "PDF", soon: true },
              ]}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Tag key="format" color={item.format === "PDF" ? "red" : "green"}>{item.format}</Tag>,
                    item.soon ? <Tag key="soon" color="default">Coming soon</Tag> : null,
                  ]}
                >
                  <List.Item.Meta title={<Text style={{ color: "#999" }}>{item.label}</Text>} />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ExportPanel;

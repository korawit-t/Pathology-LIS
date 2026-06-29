import React, { useState } from "react";
import {
  Card,
  Input,
  Button,
  Typography,
  Space,
  Table,
  Tag,
  Empty,
  Divider,
  message,
  Row,
  Col,
} from "antd";
import {
  PrinterOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import SurgicalBlockStainService from "../../../../services/surgicalBlockStainService";
import type { StainRequest } from "../../../../types/stains";
import logger from "../../../../utils/logger";

const { Text, Title } = Typography;

interface QuickPrintTabProps {
  loading: boolean;
  onPrint: (orders: StainRequest[]) => void;
}

const QuickPrintTab: React.FC<QuickPrintTabProps> = ({ loading, onPrint }) => {
  const [specimen, setSpecimen] = useState("");
  const [stainOrders, setStainOrders] = useState<StainRequest[]>([]);
  const [fetching, setFetching] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const fetchStainOrders = async () => {
    if (!specimen) {
      message.warning("Please enter an Accession Number");
      return;
    }
    setFetching(true);
    setSelectedRowKeys([]);
    try {
      const data = await SurgicalBlockStainService.getStainOrdersByAccession(specimen);
      setStainOrders(data || []);
      if (!data?.length) message.info("No stain orders found for this accession");
    } catch (error) {
      logger.error(error);
      message.error("Failed to fetch stain orders");
      setStainOrders([]);
    } finally {
      setFetching(false);
    }
  };

  const handlePrint = () => {
    if (selectedRowKeys.length === 0) return;
    const selected = stainOrders.filter((o) => selectedRowKeys.includes(o.id));
    onPrint(selected);
    setSelectedRowKeys([]);
    fetchStainOrders();
  };

  const columns = [
    {
      title: "Block Code",
      dataIndex: "block_code",
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: "Stain Type",
      dataIndex: "stain_type",
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "Status",
      dataIndex: "is_printed",
      width: 120,
      render: (printed: boolean) =>
        printed ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>Printed</Tag>
        ) : (
          <Tag color="default">Not Printed</Tag>
        ),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card bordered={false} className="shadow-sm">
          <Row justify="space-between" align="middle">
            <Space>
              <TagsOutlined style={{ fontSize: 24, color: "#1890ff" }} />
              <Title level={4} style={{ margin: 0 }}>
                Quick Print — Stickers
              </Title>
            </Space>
            <Space size="middle">
              {selectedRowKeys.length > 0 && (
                <Text type="secondary">{selectedRowKeys.length} selected</Text>
              )}
              <Button
                type="primary"
                size="large"
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                loading={loading}
                disabled={selectedRowKeys.length === 0}
              >
                Print Selected ({selectedRowKeys.length})
              </Button>
            </Space>
          </Row>

          <Divider />

          <Space.Compact style={{ width: "100%" }}>
            <Input
              size="large"
              placeholder="Enter Accession No. (e.g. S26-00001)..."
              prefix={<SearchOutlined />}
              value={specimen}
              onChange={(e) => setSpecimen(e.target.value.toUpperCase())}
              onPressEnter={fetchStainOrders}
            />
            <Button size="large" type="primary" onClick={fetchStainOrders} loading={fetching}>
              Search
            </Button>
          </Space.Compact>
        </Card>
      </Col>

      <Col span={24}>
        <Card title={`Results (${stainOrders.length} stain order${stainOrders.length !== 1 ? "s" : ""})`}>
          {stainOrders.length === 0 ? (
            <Empty
              description="Search by Accession No. to load stain orders"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Table
              dataSource={stainOrders}
              rowKey="id"
              size="middle"
              pagination={false}
              loading={fetching}
              columns={columns}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
};

export default QuickPrintTab;

import React from "react";
import {
  Table,
  Tag,
  Typography,
  Space,
  Divider,
  Statistic,
  Row,
  Col,
} from "antd";
import {
  ScissorOutlined,
  FileTextOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import {
  SectioningRunResponse,
  SectioningRunDetailResponse,
} from "../../../../types/sectioning";

const { Text } = Typography;

interface SectioningDetailsProps {
  run: SectioningRunResponse | null;
}

const SectioningDetails: React.FC<SectioningDetailsProps> = ({ run }) => {
  if (!run) return null;

  const totalBlocks = run.details.length;
  const totalSlides = run.details.reduce(
    (sum, item) => sum + item.slide_count,
    0,
  );

  const columns: ColumnsType<SectioningRunDetailResponse> = [
    {
      title: "Accession No.",
      key: "accession_no",
      render: (_, record) => <b>{record.block?.accession_no ?? "N/A"}</b>,
    },
    {
      title: "Block Code",
      key: "block_code",
      render: (_, record) => (
        <Space size={4}>
          <Tag color="blue" style={{ fontWeight: "bold" }}>
            {/* ✅ เปลี่ยนจาก .code เป็น .block_code ให้ตรงกับ JSON */}
            {record.block?.block_code ?? "N/A"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Slide Count",
      dataIndex: "slide_count",
      key: "slide_count",
      render: (count: number) => <Text strong>{count}</Text>,
    },
    {
      title: "Status",
      dataIndex: "is_recut",
      key: "is_recut",
      render: (isRecut: boolean) =>
        isRecut ? (
          <Tag color="volcano">Recut</Tag>
        ) : (
          <Tag color="green">Initial Cut</Tag>
        ),
    },
    {
      title: "Time",
      dataIndex: "created_at",
      key: "created_at",
      render: (time: string) => dayjs(time).format("HH:mm:ss"),
    },
    {
      title: "Remark",
      dataIndex: "remark",
      key: "remark",
      render: (text?: string) => <Text type="secondary">{text || "-"}</Text>,
    },
  ];

  return (
    <div className="sectioning-details">
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Statistic
            title="Total Blocks"
            value={totalBlocks}
            prefix={<FileTextOutlined />}
            suffix="Blocks"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Total Slides Cut"
            value={totalSlides}
            prefix={<ScissorOutlined />}
            suffix="Slides"
            valueStyle={{ color: "#3f8600" }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Microtome"
            value={run.microtome_id}
            prefix={<CalendarOutlined />}
          />
        </Col>
      </Row>

      <Divider>Slides in This Run</Divider>

      <Table<SectioningRunDetailResponse>
        dataSource={run.details}
        columns={columns}
        rowKey="id"
        pagination={false}
        bordered
        size="middle"
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2} align="right">
                <b>Total Slides:</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                <b>{totalSlides}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} colSpan={3} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
};

export default SectioningDetails;

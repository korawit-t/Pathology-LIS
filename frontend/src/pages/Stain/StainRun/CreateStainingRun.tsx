import React, { useState, useEffect } from "react";
import {
  Card,
  Button,
  Table,
  Row,
  Col,
  message,
  Modal,
  Tag,
  Typography,
  Divider,
} from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import SurgicalStainRunService from "../../../services/surgicalStainRunService";
import { StainRequest } from "../../../types/stains";
import logger from "../../../utils/logger";

const { Text, Title } = Typography;

const CAT_COLOR: Record<string, string> = {
  IHC: "purple",
  Histochem: "cyan",
  Surgical: "geekblue",
};

interface Props {
  onBack: () => void;
}

const CreateStainingRun: React.FC<Props> = ({ onBack }) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [pendingStains, setPendingStains] = useState<StainRequest[]>([]);
  const [selectedStains, setSelectedStains] = useState<StainRequest[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Read pre-selected IDs from StainManagement "Process in Staining Run" button
  const [preselectedIds] = useState<number[]>(() => {
    const raw = localStorage.getItem("stainrun_preselect");
    localStorage.removeItem("stainrun_preselect");
    return raw ? JSON.parse(raw) : [];
  });

  useEffect(() => {
    fetchPendingStains();
  }, []);

  // Auto-populate selectedStains when pre-selection is present
  useEffect(() => {
    if (pendingStains.length > 0 && preselectedIds.length > 0) {
      const preselected = pendingStains.filter((s) => preselectedIds.includes(s.id));
      if (preselected.length > 0) setSelectedStains(preselected);
    }
  }, [pendingStains]);

  const fetchPendingStains = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getAllStains({
        status: "pending",
        is_external: false,
        limit: 500,
      });
      setPendingStains(data);
    } catch (error) {
      logger.error(error);
      message.error("Failed to load pending stains");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSelected = () => {
    const selectedItems = pendingStains.filter((item) =>
      selectedRowKeys.includes(item.id),
    );
    setSelectedStains((prev) => {
      const existingIds = new Set(prev.map((s) => s.id));
      return [...prev, ...selectedItems.filter((item) => !existingIds.has(item.id))];
    });
    setIsModalOpen(false);
    setSelectedRowKeys([]);
  };

  const handleFinish = async () => {
    if (selectedStains.length === 0) {
      message.warning("Please select at least one slide");
      return;
    }
    setSubmitting(true);
    try {
      await SurgicalStainRunService.createRun({
        stain_ids: selectedStains.map((s) => s.id),
      });
      message.success("Staining run created successfully");
      onBack();
    } catch (err) {
      message.error("Failed to save run");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-view">
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={onBack}
        style={{ marginBottom: 16 }}
      >
        Back
      </Button>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card variant="borderless" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Row justify="space-between" align="middle">
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  <ExperimentOutlined style={{ marginRight: 8, color: "#595959" }} />
                  Create Staining Run
                </Title>
                <Text type="secondary">Prepared by: {user?.full_name}</Text>
              </div>
              <Button
                type="primary"
                size="large"
                icon={<CheckCircleOutlined />}
                onClick={handleFinish}
                loading={submitting}
                disabled={selectedStains.length === 0}
              >
                Confirm Run ({selectedStains.length} slide{selectedStains.length !== 1 ? "s" : ""})
              </Button>
            </Row>

            <Divider dashed />

            <Button
              block
              type="dashed"
              size="large"
              icon={<UnorderedListOutlined />}
              onClick={() => setIsModalOpen(true)}
            >
              Click to select slides from pending queue
            </Button>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={`Slides in this run (${selectedStains.length})`}>
            <Table
              dataSource={selectedStains}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: "No slides added yet" }}
              columns={[
                { title: "Accession No.", dataIndex: "accession_no" },
                { title: "Block", dataIndex: "block_code" },
                {
                  title: "Stain",
                  render: (_, r) => (
                    <Tag color="blue">{r.test_name || r.stain_name || "—"}</Tag>
                  ),
                },
                {
                  title: "Category",
                  render: (_, r) => {
                    const cat = r.test_category || r.category;
                    return cat ? (
                      <Tag color={CAT_COLOR[cat] || "default"}>{cat}</Tag>
                    ) : "—";
                  },
                },
                {
                  title: "",
                  render: (_, r) => (
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setSelectedStains(selectedStains.filter((s) => s.id !== r.id))
                      }
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="Select Pending Slides"
        open={isModalOpen}
        onOk={handleAddSelected}
        onCancel={() => setIsModalOpen(false)}
        okText={`Add ${selectedRowKeys.length} selected`}
        width={900}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          {pendingStains.length} slides pending — select slides to add to this run
        </Text>
        <Table
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          columns={[
            {
              title: "Accession",
              dataIndex: "accession_no",
              sorter: (a, b) =>
                (a.accession_no || "").localeCompare(b.accession_no || ""),
            },
            { title: "Block", dataIndex: "block_code" },
            {
              title: "Stain",
              render: (_, r) => (
                <Tag color="cyan">{r.test_name || r.stain_name || "—"}</Tag>
              ),
            },
            {
              title: "Category",
              render: (_, r) => {
                const cat = r.test_category || r.category;
                return cat ? (
                  <Tag color={CAT_COLOR[cat] || "default"}>{cat}</Tag>
                ) : "—";
              },
            },
          ]}
          dataSource={pendingStains}
          rowKey="id"
          scroll={{ y: 400 }}
        />
      </Modal>
    </div>
  );
};

export default CreateStainingRun;

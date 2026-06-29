import React, { useState, useEffect } from "react";
import { Card, Space, Select, Button, Table, Typography, App } from "antd";
import SpecimenAPTestService from "../../../../services/specimenAPTestService";
import AnatomicalPathologyTestService, { AnatomicalPathologyTest } from "../../../../services/anatomicalTestService";
import logger from "../../../../utils/logger";

interface SpecimenAPTestItem {
  id: number;
  ap_test?: AnatomicalPathologyTest;
}

const { Title } = Typography;

interface APTestSectionProps {
  specimenId: number;
}

const APTestSection: React.FC<APTestSectionProps> = ({ specimenId }) => {
  const { message } = App.useApp();
  const [apTests, setAPTests] = useState<AnatomicalPathologyTest[]>([]);
  const [apItems, setAPItems] = useState<SpecimenAPTestItem[]>([]);
  const [selectedAPTest, setSelectedAPTest] = useState<number | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(false);

  // โหลดข้อมูลทั้ง Master Data และรายการที่เลือกไว้แล้ว
  const loadData = async () => {
    if (!specimenId) return;
    setLoading(true);
    try {
      const [resTests, resItems] = await Promise.all([
        AnatomicalPathologyTestService.getAllTests(),
        SpecimenAPTestService.getTestsBySpecimenId(specimenId),
      ]);
      setAPTests(resTests.data);
      setAPItems(resItems.data);
    } catch (err) {
      logger.error(err);
      message.error("โหลดข้อมูล AP Test ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [specimenId]);

  const handleAdd = async () => {
    if (!selectedAPTest) return;
    try {
      await SpecimenAPTestService.addTestToSpecimen({
        surgical_specimen_id: specimenId,
        ap_test_id: selectedAPTest,
      });
      message.success("เพิ่มรายการสำเร็จ");
      setSelectedAPTest(undefined);
      loadData();
    } catch (err) {
      message.error("เพิ่มไม่สำเร็จ");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ที่จะลบรายการนี้?")) return;
    try {
      await SpecimenAPTestService.deleteSpecimenTest(id);
      message.success("ลบสำเร็จ");
      loadData();
    } catch (err) {
      message.error("ลบไม่สำเร็จ");
    }
  };

  const columns = [
    {
      title: "ชื่อรายการตรวจ",
      dataIndex: "ap_test",
      render: (t: AnatomicalPathologyTest | undefined) => t?.name,
    },
    {
      title: "Category",
      dataIndex: "ap_test",
      render: (t: AnatomicalPathologyTest | undefined) => t?.category,
    },
    { title: "Code", dataIndex: "ap_test", render: (t: AnatomicalPathologyTest | undefined) => t?.code },
    {
      title: "ราคา",
      dataIndex: "ap_test",
      render: (t: AnatomicalPathologyTest | undefined) => t?.price_tier_3?.toLocaleString(),
    },
    {
      title: "Action",
      width: 80,
      render: (_: unknown, record: SpecimenAPTestItem) => (
        <Button danger size="small" onClick={() => handleDelete(record.id)}>
          ลบ
        </Button>
      ),
    },
  ];

  const totalPrice = apItems.reduce(
    (sum, i) => sum + (i.ap_test?.price_tier_3 || 0),
    0,
  );

  return (
    <Card
      title="Anatomical Pathology Tests"
      size="small"
      style={{ marginTop: 20 }}
    >
      <Space>
        <Select
          showSearch
          style={{ width: 400 }}
          placeholder="เลือกการตรวจ (IHC, Special stain ฯลฯ)"
          value={selectedAPTest}
          optionFilterProp="label"
          onChange={(value) => setSelectedAPTest(Number(value))}
          options={apTests.map((test) => ({
            label: `${test.name} (${test.category})`,
            value: Number(test.id),
          }))}
        />
        <Button type="primary" disabled={!selectedAPTest} onClick={handleAdd}>
          Add
        </Button>
      </Space>

      <Table
        dataSource={apItems}
        columns={columns}
        rowKey="id"
        size="small"
        loading={loading}
        style={{ marginTop: 15 }}
        pagination={false}
      />

      <div style={{ marginTop: 10, textAlign: "right" }}>
        <Title level={5}>Total Price: {totalPrice.toLocaleString()} THB</Title>
      </div>
    </Card>
  );
};

export default APTestSection;

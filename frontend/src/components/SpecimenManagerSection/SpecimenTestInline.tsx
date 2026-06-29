import React, { useState, useEffect } from "react";
import { Space, Select, Tag, App, Typography } from "antd";
import SpecimenAPTestService from "../../services/specimenAPTestService";
import AnatomicalPathologyTestService from "../../services/anatomicalTestService";
import type { AnatomicalPathologyTest } from "../../services/anatomicalTestService";
import logger from "../../utils/logger";

interface SpecimenAPTestItem {
  id: number;
  ap_test?: { name?: string; price_tier_3?: number };
}

const { Text } = Typography;

interface Props {
  specimenId: number;
  disabled?: boolean; // 🚩 เพิ่มเพื่อให้รับค่าจากหน้าหลักได้
}

const SpecimenTestInline: React.FC<Props> = ({
  specimenId,
  disabled = false,
}) => {
  const { message } = App.useApp();
  const [apTests, setAPTests] = useState<AnatomicalPathologyTest[]>([]);
  const [orderedItems, setOrderedItems] = useState<SpecimenAPTestItem[]>([]);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!specimenId) return;
    setLoading(true);
    try {
      const [resTests, resItems] = await Promise.all([
        AnatomicalPathologyTestService.getAllTests(),
        SpecimenAPTestService.getTestsBySpecimenId(specimenId),
      ]);
      setAPTests(resTests.data);
      setOrderedItems(resItems as SpecimenAPTestItem[]);
    } catch (err) {
      logger.error("Load AP Test Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [specimenId]);

  const handleAddById = async (testId: number) => {
    if (!testId) return;
    try {
      await SpecimenAPTestService.addTestToSpecimen({
        surgical_specimen_id: specimenId,
        ap_test_id: testId,
      });
      message.success("เพิ่มรายการสำเร็จ");
      setSelected(undefined);
      loadData();
    } catch (err) {
      message.error("เพิ่มไม่สำเร็จ");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await SpecimenAPTestService.deleteSpecimenTest(id);
      message.success("ลบสำเร็จ");
      loadData();
    } catch (err) {
      message.error("ลบไม่สำเร็จ");
    }
  };

  const totalPrice = orderedItems.reduce(
    (sum, i) => sum + (i.ap_test?.price_tier_3 || 0),
    0,
  );

  return (
    <div style={{ padding: "4px 0" }}>
      <Space direction="vertical" style={{ width: "100%" }} size={4}>
        {/* 🚩 ซ่อนส่วน Dropdown หากโดนสั่ง disabled (isLocked) */}
        {!disabled && (
          <Select
            showSearch
            size="small"
            style={{ width: "100%" }}
            placeholder="เลือกค่าตรวจ Surgical"
            getPopupContainer={() => document.body}
            value={selected}
            optionFilterProp="label"
            onChange={(value) => {
              setSelected(Number(value));
              handleAddById(Number(value));
            }}
            loading={loading && apTests.length === 0}
            options={apTests
              .filter((test) => test.category === "Surgical Pathology")
              .map((test) => ({
                label: `${test.name} - ${test.price_tier_3?.toLocaleString()}฿`,
                value: Number(test.id),
              }))}
          />
        )}

        {/* ส่วนแสดง Tag รายการ */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            marginTop: 4,
          }}
        >
          {orderedItems.length > 0 ? (
            orderedItems.map((item) => (
              <Tag
                key={item.id}
                color={disabled ? "default" : "blue"}
                // 🚩 ถ้า disabled จะกดปิด (ลบ) ไม่ได้
                closable={!disabled}
                onClose={(e) => {
                  e.preventDefault();
                  handleDelete(item.id);
                }}
                style={{ borderRadius: "4px", margin: 0, fontSize: "12px" }}
              >
                {item.ap_test?.name}
              </Tag>
            ))
          ) : (
            <Text type="secondary" style={{ fontSize: "11px" }}>
              ยังไม่ได้ระบุค่าตรวจ
            </Text>
          )}
        </div>

        {/* ราคารวม */}
        {totalPrice > 0 && (
          <div style={{ textAlign: "right", marginTop: 2 }}>
            <Text style={{ fontSize: "11px", color: "#8c8c8c" }}>
              Total:{" "}
              <Text
                strong
                style={{
                  color: disabled ? "#8c8c8c" : "#f5222d",
                  fontSize: "11px",
                }}
              >
                {totalPrice.toLocaleString()} ฿
              </Text>
            </Text>
          </div>
        )}
      </Space>
    </div>
  );
};

export default SpecimenTestInline;

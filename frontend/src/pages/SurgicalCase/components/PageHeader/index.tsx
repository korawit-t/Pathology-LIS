import React from "react";
import { Button, Input, Space, Typography } from "antd";
import { PlusOutlined, FileTextOutlined } from "@ant-design/icons";

const { Title } = Typography;

interface PageHeaderProps {
  title?: string;
  onAdd: () => void;
  onSearch: (value: string) => void;
  searchText: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  onAdd,
  onSearch,
  searchText,
}) => {
  return (
    <div
      style={{
        marginBottom: 24, // เพิ่มระยะห่างด้านล่างอีกนิดให้ดูไม่เบียดกับตาราง
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center", // 🚩 สำคัญ: จัดให้แนว Title กับปุ่มตรงกันในแนวแกน Y
      }}
    >
      {/* 🚩 ฝั่งซ้าย: เน้น Title และ Icon */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <Title
          level={3}
          style={{ margin: 0, display: "flex", alignItems: "center" }}
        >
          {/* ใช้สีเทาเข้มเพื่อให้ดูพรีเมียมและไม่แย่งสายตาจากหัวข้อ */}
          <FileTextOutlined style={{ marginRight: 12, color: "#595959" }} />
          Surgical Pathology Accessioning
        </Title>
      </div>

      {/* 🚩 ฝั่งขวา: Actions (Search + Add) ชิดขวาโดยอัตโนมัติด้วย flex-between */}
      <Space size="middle">
        <Input.Search
          placeholder="Search Accession, Name, CID..."
          style={{ width: 300 }} // ปรับให้กว้างขึ้นเล็กน้อยเพื่อรองรับข้อความ CID
          allowClear
          value={searchText}
          onChange={(e) => onSearch(e.target.value)}
          enterButton={false} // 🚩 เลือกไม่ใช้ปุ่ม Search สีน้ำเงินเพื่อให้ UI ดูเบาและสะอาด (Clean)
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onAdd}
          style={{
            borderRadius: "6px", // มนกำลังดีเข้ากับ Card
            boxShadow: "0 2px 0 rgba(0,0,0,0.02)",
          }}
        >
          Add Specimen Case
        </Button>
      </Space>
    </div>
  );
};

export default PageHeader;

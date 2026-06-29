import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Badge,
  Typography,
  Modal,
  message,
} from "antd";
import {
  EyeOutlined,
  HistoryOutlined,
  DeleteOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table"; // เพิ่ม Type สำหรับ Table
import dayjs from "dayjs";
import SectioningService from "../../services/sectioningService";
import { getSectioningColumns } from "./components/sectioningColumns/Columns";
import type { SectioningRunResponse } from "../../types/sectioning";
import logger from "../../utils/logger";

const { Text } = Typography;

// --- 2. นิยาม Props ของ Component ---

interface SectioningRunListProps {
  onCreateClick?: () => void; // ตามโค้ดต้นฉบับมีรับมาแต่ไม่ได้ใช้ใน JSX
  onSelectRun: (run: SectioningRunResponse) => void;
}

const SectioningRunList: React.FC<SectioningRunListProps> = ({
  onSelectRun,
}) => {
  // --- 3. ระบุ Type ให้กับ State ---
  const [runs, setRuns] = useState<SectioningRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const runs = await SectioningService.getAllRuns();
      setRuns(runs);
    } catch (err) {
      logger.error(err);
      message.error("โหลดประวัติการตัดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (record: SectioningRunResponse) => {
    Modal.confirm({
      title: "ยืนยันการลบรอบการตัด?",
      content: `คุณต้องการลบรอบ ${record.run_no} ใช่หรือไม่? (ลบได้เฉพาะรอบที่ยังไม่มีการสแกนตลับเนื้อเท่านั้น)`,
      okText: "ลบ",
      okType: "danger",
      cancelText: "ยกเลิก",
      onOk: async () => {
        try {
          await SectioningService.deleteRun(record.id);
          message.success("ลบรอบการตัดสำเร็จ");
          loadHistory();
        } catch (err: any) {
          const errorMsg =
            err.response?.data?.detail ||
            "ไม่สามารถลบได้ เนื่องจากรอบนี้มีข้อมูลสไลด์แล้ว";
          message.error(errorMsg);
        }
      },
    });
  };

  // --- 4. ระบุ Type ให้ Columns ของ Ant Design ---
  const columns = getSectioningColumns({
    onSelectRun,
    onDelete: handleDeleteClick,
  });

  return (
    <Table
      dataSource={runs}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{ pageSize: 10 }}
      size="middle"
      bordered
    />
  );
};

export default SectioningRunList;

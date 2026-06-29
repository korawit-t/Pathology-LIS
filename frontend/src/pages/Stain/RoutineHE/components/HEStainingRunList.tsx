import React, { useEffect, useState } from "react";
import { Table, message, Modal, Typography } from "antd";
import SurgicalBlockStainService from "../../../../services/surgicalBlockStainService";
import { getStainingRunColumns } from "./StainingRunColumns";
import { StainingRunResponse } from "../../../../types/stains";
import logger from "../../../../utils/logger";

const { Text } = Typography;

interface StainingRunListProps {
  onSelectRun: (run: StainingRunResponse) => void;
  onPrint: (id: number) => void;
  refreshKey?: number;
}

const StainingRunList: React.FC<StainingRunListProps> = ({
  onSelectRun,
  onPrint,
  refreshKey,
}) => {
  const [runs, setRuns] = useState<StainingRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadHistory();
  }, [refreshKey]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await SurgicalBlockStainService.getStainingRuns();
      setRuns(data);
    } catch (err) {
      logger.error(err);
      message.error("โหลดประวัติการย้อมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (record: StainingRunResponse) => {
    Modal.confirm({
      title: "ยืนยันการลบรอบการย้อม?",
      content: (
        <div>
          <Text>
            คุณต้องการลบรอบ{" "}
            <Text strong copyable>
              {record.run_no}
            </Text>{" "}
            ใช่หรือไม่?
          </Text>
          <br />
          <Text type="danger">
            สถานะการย้อมของบล็อกทั้งหมดในรอบนี้จะถูกยกเลิก
          </Text>
        </div>
      ),
      okText: "ยืนยันการลบ",
      okType: "danger",
      cancelText: "ยกเลิก",
      onOk: async () => {
        try {
          await SurgicalBlockStainService.deleteStainingRun(record.id);
          message.success("ลบรอบการย้อมสำเร็จ");
          loadHistory();
        } catch (err: any) {
          message.error(err.response?.data?.detail || "ไม่สามารถลบได้");
        }
      },
    });
  };

  const columns = getStainingRunColumns({
    onSelectRun,
    onDelete: handleDeleteClick,
    onPrint,
  });

  return (
    <Table
      dataSource={runs}
      columns={columns}
      rowKey="id"
      loading={loading}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total) => `ทั้งหมด ${total} รายการ`,
      }}
      size="middle"
      onRow={(record) => ({
        onDoubleClick: () => onSelectRun(record),
      })}
    />
  );
};

export default StainingRunList;

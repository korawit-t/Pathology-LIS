import React from "react";
import {
  Modal,
  Tag,
  Typography,
  Space,
  Button,
  Divider,
} from "antd";
import {
  QuestionCircleOutlined,
  ScissorOutlined,
  MedicineBoxOutlined,
  UserOutlined,
  FireFilled,
  CheckCircleOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";

const { Text } = Typography;

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

const GuideModal: React.FC<GuideModalProps> = ({ open, onClose }) => (
  <Modal
    open={open}
    title={
      <Space>
        <QuestionCircleOutlined style={{ color: "#1677ff" }} />
        <span>คู่มือการใช้งาน — Accession</span>
      </Space>
    }
    onCancel={onClose}
    footer={<Button type="primary" onClick={onClose}>เข้าใจแล้ว</Button>}
    width={640}
    destroyOnHidden
  >
    <div style={{ lineHeight: 2 }}>
      <Text strong style={{ fontSize: 14 }}>การลงทะเบียนเคส</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><Tag color="blue"><ScissorOutlined /> New Surgical</Tag> — เคสชิ้นเนื้อ (Surgical Pathology)</li>
        <li><Tag color="green"><MedicineBoxOutlined /> New Gyne</Tag> — เคส Gyne Cytology (Pap smear ฯลฯ)</li>
        <li><Tag color="orange"><UserOutlined /> New Non-Gyne</Tag> — เคส Non-Gyne Cytology</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <Text strong style={{ fontSize: 14 }}>Workflow Badges</Text>
      <div style={{ marginTop: 6, marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Surgical</Text>
      </div>
      <Space wrap size={6} style={{ marginBottom: 8 }}>
        {[
          { label: "GR", desc: "Grossing", color: "cyan" },
          { label: "PR", desc: "Processing", color: "purple" },
          { label: "SL", desc: "Slide Prep", color: "geekblue" },
          { label: "RP", desc: "Reported", color: "green" },
        ].map(({ label, desc, color }) => (
          <Space key={label} size={4}>
            <Tag color={color} style={{ width: 36, textAlign: "center", fontWeight: 600, fontSize: 11 }}>{label}</Tag>
            <Text style={{ fontSize: 12 }}>{desc}</Text>
          </Space>
        ))}
      </Space>
      <div style={{ marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Cytology (Gyne / Non-Gyne)</Text>
      </div>
      <Space wrap size={6} style={{ marginBottom: 8 }}>
        {[
          { label: "SC", desc: "Screened", color: "blue" },
          { label: "RP", desc: "Reported", color: "green" },
        ].map(({ label, desc, color }) => (
          <Space key={label} size={4}>
            <Tag color={color} style={{ width: 36, textAlign: "center", fontWeight: 600, fontSize: 11 }}>{label}</Tag>
            <Text style={{ fontSize: 12 }}>{desc}</Text>
          </Space>
        ))}
      </Space>
      <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 4 }}>
        Badge ที่มี <CheckCircleFilled style={{ color: "#52c41a", fontSize: 11 }} /> มุมขวาบน = ขั้นตอนนั้นเสร็จแล้ว
      </div>

      <Divider style={{ margin: "12px 0" }} />

      <Text strong style={{ fontSize: 14 }}>Tag พิเศษบน Accession No.</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><FireFilled style={{ color: "#ff4d4f" }} /> — <b>Express/Urgent</b> ต้องรีบดำเนินการ</li>
        <li><Tag color="purple" style={{ fontSize: 10 }}>Consult</Tag> — ส่ง Outlab Consult แล้ว ยังรอผล</li>
        <li><Tag color="geekblue" style={{ fontSize: 10 }}>IHC</Tag> — มีการสั่ง IHC ที่ยังไม่ครบการแปลผล</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <Text strong style={{ fontSize: 14 }}>Due Date (TAT)</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><Text style={{ color: "#ff4d4f", fontWeight: 600 }}>สีแดง</Text> — เลยกำหนดแล้ว (Overdue)</li>
        <li><Text style={{ color: "#fa8c16", fontWeight: 600 }}>สีส้ม</Text> — เหลือเวลาน้อยกว่า 24 ชั่วโมง</li>
        <li><CheckCircleOutlined style={{ color: "#52c41a" }} /> — เคสปิดแล้ว (Signed out / Published)</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <Text strong style={{ fontSize: 14 }}>อื่นๆ</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li>คลิกที่แถวในตาราง → เปิด <b>Case Detail</b> ดู Report, Block, IHC Outlab, Consult history</li>
        <li>ช่องค้นหา (Tab All) รองรับ Accession No., HN, ชื่อผู้ป่วย — เมื่อพิมพ์จะค้นข้อมูลทั้งหมด ไม่จำกัดช่วงวันที่</li>
        <li>Tab แยกแต่ละประเภท (Surgical / Gyne / Non-Gyne) มี filter Hospital, Status, Date เพิ่มเติม</li>
      </ul>
    </div>
  </Modal>
);

export default GuideModal;

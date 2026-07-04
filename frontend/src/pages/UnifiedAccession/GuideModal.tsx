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
        <span>User Guide — Accession</span>
      </Space>
    }
    onCancel={onClose}
    footer={<Button type="primary" onClick={onClose}>Got it</Button>}
    width={640}
    destroyOnHidden
  >
    <div style={{ lineHeight: 2 }}>
      <Text strong style={{ fontSize: 14 }}>Case Registration</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><Tag color="blue"><ScissorOutlined /> New Surgical</Tag> — Tissue case (Surgical Pathology)</li>
        <li><Tag color="green"><MedicineBoxOutlined /> New Gyne</Tag> — Gyne Cytology case (Pap smear, etc.)</li>
        <li><Tag color="orange"><UserOutlined /> New Non-Gyne</Tag> — Non-Gyne Cytology case</li>
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
        Badge with <CheckCircleFilled style={{ color: "#52c41a", fontSize: 11 }} /> in the top-right corner = that step is complete
      </div>

      <Divider style={{ margin: "12px 0" }} />

      <Text strong style={{ fontSize: 14 }}>Special Tags on Accession No.</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><FireFilled style={{ color: "#ff4d4f" }} /> — <b>Express/Urgent</b>, needs to be handled quickly</li>
        <li><Tag color="purple" style={{ fontSize: 10 }}>Consult</Tag> — sent for Outlab Consult, awaiting result</li>
        <li><Tag color="geekblue" style={{ fontSize: 10 }}>IHC</Tag> — has IHC ordered that is not yet fully interpreted</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <Text strong style={{ fontSize: 14 }}>Due Date (TAT)</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><Text style={{ color: "#ff4d4f", fontWeight: 600 }}>Red</Text> — past due (Overdue)</li>
        <li><Text style={{ color: "#fa8c16", fontWeight: 600 }}>Orange</Text> — less than 24 hours remaining</li>
        <li><CheckCircleOutlined style={{ color: "#52c41a" }} /> — case closed (Signed out / Published)</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <Text strong style={{ fontSize: 14 }}>Other</Text>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li>Click a row in the table → opens <b>Case Detail</b> to view Report, Block, IHC Outlab, Consult history</li>
        <li>The search box (All tab) supports Accession No., HN, patient name — typing searches all data, not limited to a date range</li>
        <li>Type-specific tabs (Surgical / Gyne / Non-Gyne) have additional Hospital, Status, Date filters</li>
      </ul>
    </div>
  </Modal>
);

export default GuideModal;

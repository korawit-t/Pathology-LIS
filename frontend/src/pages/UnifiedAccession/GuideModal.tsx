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
  ExperimentOutlined,
  GlobalOutlined,
  FireFilled,
  CheckCircleOutlined,
  CheckCircleFilled,
  PrinterOutlined,
  EyeOutlined,
  EditOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text strong style={{ fontSize: 14 }}>{children}</Text>
);

// Legend rows reuse the same tag geometry as WorkflowBadge/SurgicalWorkflowProgress
// so the colours here stay recognisable against the actual table column.
const BadgeLegend: React.FC<{ items: { label: string; desc: string; color: string }[] }> = ({ items }) => (
  <Space wrap size={6} style={{ marginBottom: 8 }}>
    {items.map(({ label, desc, color }) => (
      <Space key={label} size={4}>
        <Tag color={color} style={{ width: 36, textAlign: "center", fontWeight: 600, fontSize: 11 }}>{label}</Tag>
        <Text style={{ fontSize: 12 }}>{desc}</Text>
      </Space>
    ))}
  </Space>
);

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
    width={680}
    styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
    destroyOnHidden
  >
    <div style={{ lineHeight: 2 }}>
      <SectionTitle>Case Registration</SectionTitle>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><Tag color="blue"><ScissorOutlined /> New Surgical</Tag> — Tissue case (Surgical Pathology)</li>
        <li><Tag color="green"><MedicineBoxOutlined /> New Gyne</Tag> — Gyne Cytology case (Pap smear, etc.)</li>
        <li><Tag color="orange"><UserOutlined /> New Non-Gyne</Tag> — Non-Gyne Cytology case</li>
        <li><Tag color="purple"><ExperimentOutlined /> New Molecular</Tag> — Molecular test, standalone or linked to a parent case</li>
      </ul>
      <Text type="secondary" style={{ fontSize: 12 }}>
        After saving, the sticker preview opens automatically so the specimen can be labelled right away.
      </Text>

      <Divider style={{ margin: "12px 0" }} />

      <SectionTitle>Tabs</SectionTitle>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><b>All</b> — every case type in one list, newest accession first</li>
        <li><b>Surgical / Gyne Cytology / Non-Gyne Cytology</b> — one type at a time, with extra Hospital, Coverage, Status and Date filters</li>
        <li><GlobalOutlined /> <b>Out Lab</b> — consult runs sent to an outside lab; the badge counts runs not yet completed</li>
        <li><ExperimentOutlined /> <b>Molecular</b> — molecular test cases; the badge counts cases still awaiting a result</li>
      </ul>
      <Text type="secondary" style={{ fontSize: 12 }}>
        Case tabs load the last 1 month by default — use the search box to look further back.
      </Text>

      <Divider style={{ margin: "12px 0" }} />

      <SectionTitle>Workflow Badges</SectionTitle>
      <div style={{ marginTop: 6, marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Surgical</Text>
      </div>
      <BadgeLegend
        items={[
          { label: "GR", desc: "Grossing", color: "green" },
          { label: "PR", desc: "Processing", color: "blue" },
          { label: "SL", desc: "Slide Prep", color: "purple" },
          { label: "RP", desc: "Reported", color: "cyan" },
        ]}
      />
      <div style={{ marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Cytology (Gyne / Non-Gyne)</Text>
      </div>
      <BadgeLegend
        items={[
          { label: "SC", desc: "Screened", color: "blue" },
          { label: "RP", desc: "Reported", color: "green" },
        ]}
      />
      <div style={{ marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Molecular</Text>
      </div>
      <BadgeLegend items={[{ label: "RP", desc: "Reported (no grossing/screening steps)", color: "green" }]} />
      <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 4 }}>
        Badge with <CheckCircleFilled style={{ color: "#52c41a", fontSize: 11 }} /> in the top-right corner = that step is complete; a grey badge = still pending. Hover a badge for its exact meaning.
      </div>

      <Divider style={{ margin: "12px 0" }} />

      <SectionTitle>Special Tags on Accession No.</SectionTitle>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><FireFilled style={{ color: "#ff4d4f" }} /> — <b>Express/Urgent</b>, needs to be handled quickly (also shortens the due date)</li>
        <li><Tag color="purple" style={{ fontSize: 10 }}>Consult</Tag> — sent for Outlab Consult, awaiting result (shown as <Tag color="purple" style={{ fontSize: 10 }}>Outlab</Tag> on Molecular rows)</li>
        <li><Tag color="geekblue" style={{ fontSize: 10 }}>IHC</Tag> — has IHC ordered that is not yet fully interpreted</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <SectionTitle>Due Date (TAT)</SectionTitle>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><Text style={{ color: "#ff4d4f", fontWeight: 600 }}>Red</Text> — past due (Overdue)</li>
        <li><Text style={{ color: "#fa8c16", fontWeight: 600 }}>Orange</Text> — less than 24 hours remaining</li>
        <li><CheckCircleOutlined style={{ color: "#52c41a" }} /> — case closed (Signed out / Published / Cancelled)</li>
        <li><Text type="secondary">—</Text> — no TAT configured for this case type (Molecular has none yet)</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <SectionTitle>Row Actions (All tab)</SectionTitle>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li><Button size="small" icon={<PrinterOutlined />} /> — reprint the specimen sticker</li>
        <li><Button size="small" icon={<EyeOutlined />} /> — <b>Case Detail</b>: Reports, Block History, IHC Outlab Tracking (surgical) and Consult History</li>
        <li><Button size="small" type="primary" icon={<EditOutlined />} /> — reopen the registration form to edit; <b>clicking anywhere on the row does the same</b></li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <SectionTitle>Search</SectionTitle>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li>One search box sits at the right of the tab bar and always searches the tab you are on</li>
        <li>On case tabs it matches Accession No., HN or patient name, and while a search is active the 1-month date limit is dropped so all data is searched</li>
        <li>Out Lab searches Run No., destination lab, Accession No. and patient name</li>
        <li>Molecular searches Accession No., parent case Accession No., HN and patient name</li>
      </ul>

      <Divider style={{ margin: "12px 0" }} />

      <SectionTitle>Out Lab Tab</SectionTitle>
      <ul style={{ marginTop: 4, paddingLeft: 20 }}>
        <li>Pending / Completed counts sit above the table; <b>Refresh</b> reloads the list</li>
        <li>Click a run row to expand the cases inside that run</li>
        <li><Button size="small" type="primary" icon={<CheckCircleOutlined />}>Receive</Button> — confirm the report has come back from the outside lab; the run then turns Completed</li>
      </ul>
    </div>
  </Modal>
);

export default GuideModal;

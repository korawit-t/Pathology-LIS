import React from "react";
import { Collapse, Table, Typography, Tag } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

/**
 * Long-form help for System Settings → Workflow → "Specimen / Block Label" and
 * "When a Block Is Deleted". The rules live in backend app/utils/surgical_labels.py;
 * keep this text in step with them.
 */

const { Paragraph, Text, Title } = Typography;

type Row = { key: string; specimen: string; a1: string; numberLetter: string };

const schemeRows: Row[] = [
  { key: "1", specimen: "ชิ้นที่ 1", a1: "A → A1, A2", numberLetter: "1 → A, B" },
  { key: "2", specimen: "ชิ้นที่ 2", a1: "B → B1, B2", numberLetter: "2 → C, D" },
  { key: "3", specimen: "ชิ้นที่ 3", a1: "C → C1, C2", numberLetter: "3 → E, F" },
];

type PhaseRow = { key: string; action: string; inGross: string; afterGross: string };

const phaseRows: PhaseRow[] = [
  {
    key: "add",
    action: "เพิ่ม block ให้ชิ้น 1 (เดิม 1: A B C, 2: D)",
    inGross: "1: A B C D, 2: E",
    afterGross: "1: A B C E, 2: D",
  },
  {
    key: "delete",
    action: "ลบ block กลางเคส",
    inGross: "เรียงใหม่ให้ต่อกันเสมอ",
    afterGross: "ตาม setting “When a Block Is Deleted”",
  },
];

// Labels in a monospace face; Thai explanations stay in the body font, which
// a monospace face spaces out badly.
type Example = { labels: string; note?: string };

type DeleteRow = { key: string; mode: string; a1: Example; numberLetter: Example };

const deleteRows: DeleteRow[] = [
  {
    key: "renumber",
    mode: "Renumber (ค่าเริ่มต้น)",
    a1: { labels: "A1 A2", note: "A3 เลื่อนมาเป็น A2" },
    numberLetter: { labels: "A B C D E", note: "D E F เลื่อนมาเป็น C D E รวมชิ้นอื่นด้วย" },
  },
  {
    key: "keep",
    mode: "Keep the gap",
    a1: { labels: "A1 A3" },
    numberLetter: { labels: "A B D E F" },
  },
];

const mono = (value: string) => <Text style={{ fontFamily: "monospace" }}>{value}</Text>;

const example = ({ labels, note }: Example) => (
  <>
    {mono(labels)}
    {note && (
      <Text type="secondary" style={{ marginLeft: 8 }}>
        ({note})
      </Text>
    )}
  </>
);

// Only the "add" row holds labels; the "delete" row is a Thai sentence.
const phaseCell = (value: string, row: PhaseRow) => (row.key === "add" ? mono(value) : value);

const sectionTitle = (text: string) => (
  <Title level={5} style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>
    {text}
  </Title>
);

const HelpBody: React.FC = () => (
  <div style={{ fontSize: 13 }}>
    {sectionTitle("1. รูปแบบ label มี 2 แบบ")}
    <Paragraph style={{ marginBottom: 8 }}>
      <Text strong>A / A1</Text> (ค่าเริ่มต้น): ชิ้นเนื้อเป็น A, B, C และ block นับใหม่ในแต่ละชิ้น{" "}
      <br />
      <Text strong>1 / A</Text>: ชิ้นเนื้อเป็น 1, 2, 3 และ block เป็นตัวอักษรรันต่อกันทั้งเคส
      (A, B, C … Z, AA, AB) ไม่ว่าจะอยู่ชิ้นไหน
    </Paragraph>
    <Table<Row>
      size="small"
      pagination={false}
      bordered
      dataSource={schemeRows}
      columns={[
        { title: "ตัวอย่าง 3 ชิ้น ชิ้นละ 2 block", dataIndex: "specimen" },
        { title: "A / A1", dataIndex: "a1", render: mono },
        { title: "1 / A", dataIndex: "numberLetter", render: mono },
      ]}
    />

    {sectionTitle("2. มีผลกับเคสไหน")}
    <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
      <li>มีผลกับเคสที่<Text strong>ยังไม่มีชิ้นเนื้อ</Text>เท่านั้น ระบบดูแบบจากชิ้นเนื้อชิ้นแรกของเคส</li>
      <li>
        เคสที่มีชิ้นเนื้ออยู่แล้วใช้แบบเดิมตลอด สลับ setting ไปมาเคสเก่าก็ไม่เปลี่ยน
        และชิ้นเนื้อหรือ block ที่เพิ่มในเคสเก่าก็ใช้แบบเดิมของเคสนั้น
      </li>
    </ul>

    {sectionTitle("3. แบบ 1 / A: ตอนอยู่ในห้อง gross กับหลังออกจากห้อง gross")}
    <ul style={{ paddingLeft: 20, marginBottom: 8 }}>
      <li>
        <Text strong>ยังอยู่ในห้อง gross:</Text> ตัวอักษรเรียงตามลำดับชิ้นเนื้อเสมอ
        เพิ่มหรือลบ block หรือชิ้นเนื้อ ระบบจะเรียงตัวอักษรใหม่ทั้งเคส
        และหน้าจอจะเตือน เช่น “ชิ้น 2: ตัวอักษร block เปลี่ยน D → E” ถ้าเขียนตลับไปแล้วต้องแก้ตาม
        แนะนำให้เขียนหรือพิมพ์ตลับหลังตัดเคสนั้นเสร็จ
      </li>
      <li>
        <Text strong>ออกจากห้อง gross แล้ว:</Text> ตัวอักษรล็อก block ที่เพิ่มทีหลัง
        (เช่น ตอนพยาธิแพทย์สั่ง additional sections) ได้ตัวถัดจากตัวสุดท้ายในเคส ตัวเดิมไม่ขยับ
      </li>
    </ul>
    <Table<PhaseRow>
      size="small"
      pagination={false}
      bordered
      dataSource={phaseRows}
      columns={[
        { title: "", dataIndex: "action" },
        { title: "ยังอยู่ในห้อง gross", dataIndex: "inGross", render: phaseCell },
        { title: "ออกจากห้อง gross แล้ว", dataIndex: "afterGross", render: phaseCell },
      ]}
    />
    <Paragraph style={{ marginTop: 12, marginBottom: 4 }}>
      ระบบนับว่าเคส<Text strong>ออกจากห้อง gross แล้ว</Text>เมื่อเข้าข้อใดข้อหนึ่ง:
    </Paragraph>
    <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
      <li>
        สถานะเคสเลย <Tag style={{ marginInlineEnd: 0 }}>Grossed</Tag> ไปแล้ว (processed, stained,
        pending diagnosis ฯลฯ) หรือพยาธิแพทย์สั่ง additional sections
      </li>
      <li>มี block ในเคสเข้า processing, embedded, sectioned หรือ stained แล้ว</li>
      <li>พิมพ์สติกเกอร์สไลด์ของเคสไปแล้ว</li>
    </ul>

    {sectionTitle("4. เมื่อลบ block (When a Block Is Deleted)")}
    <Table<DeleteRow>
      size="small"
      pagination={false}
      bordered
      dataSource={deleteRows}
      columns={[
        { title: "", dataIndex: "mode", width: 170 },
        { title: "A / A1: ลบ A2 จาก A1 A2 A3", dataIndex: "a1", render: example },
        { title: "1 / A: ลบ C จาก A B C D E F", dataIndex: "numberLetter", render: example },
      ]}
    />
    <ul style={{ paddingLeft: 20, marginTop: 12, marginBottom: 0 }}>
      <li>ลบ block ตัวสุดท้าย: block ที่เพิ่มถัดไปได้เลขหรือตัวอักษรนั้นกลับมาใช้ ทั้งสองโหมด</li>
      <li>แบบ 1 / A: setting นี้มีผลหลังออกจากห้อง gross เท่านั้น ก่อนนั้นเรียงใหม่ให้ต่อกันเสมอ</li>
      <li>
        แบบ 1 / A แนะนำ <Text strong>Keep the gap</Text> เพราะ Renumber จะเปลี่ยนชื่อ block
        ของชิ้นอื่นที่ส่งเข้าแลปไปแล้ว ทำให้ตลับและสไลด์จริงไม่ตรงกับในระบบ
      </li>
    </ul>

    {sectionTitle("5. ส่วนอื่นที่ใช้ label นี้")}
    <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
      <li>
        รายงาน: {mono("1: Appendix — Representative sections are submitted: A, B, G")}
      </li>
      <li>สติกเกอร์สไลด์และทุกหน้าที่แสดง block ใช้ label เดียวกัน (QR บนสติกเกอร์ไม่เปลี่ยน)</li>
      <li>ไฟล์ WSI ที่ตั้งชื่อแบบ {mono("S26-00012_G")} จับคู่กับ block ได้เมื่อเลือกแบบ 1 / A</li>
    </ul>
  </div>
);

const SurgicalLabelHelp: React.FC = () => (
  <Collapse
    style={{ marginTop: 16 }}
    items={[
      {
        key: "labels",
        label: (
          <Text strong>
            <InfoCircleOutlined style={{ marginRight: 8 }} />
            รายละเอียด: label ชิ้นเนื้อและ block ทำงานอย่างไร (อ่านก่อนเปลี่ยน)
          </Text>
        ),
        children: <HelpBody />,
      },
    ]}
  />
);

export default SurgicalLabelHelp;

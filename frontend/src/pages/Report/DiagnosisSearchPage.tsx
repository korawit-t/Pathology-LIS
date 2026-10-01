import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileExcelOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import DiagnosisSearchService from "../../services/diagnosisSearchService";
import HospitalService from "../../services/hospitalService";
import type { Hospital } from "../../types/hospital";
import type {
  DiagnosisSearchCriteria,
  DiagnosisSearchDateField,
  DiagnosisSearchMatchMode,
  DiagnosisSearchParams,
  DiagnosisSearchRow,
} from "../../types/diagnosisSearch";
import { exportToCsv } from "../../utils/exportCsv";
import logger from "../../utils/logger";

const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().startOf("year"), dayjs()];

const fmtDate = (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-");

const malignancyTag = (v: boolean | null) => {
  if (v === true) return <Tag color="red">Malignant</Tag>;
  if (v === false) return <Tag color="green">Benign</Tag>;
  return <Tag>-</Tag>;
};

/** Criteria + totals stamped above the header row, so the exported file still
 *  says what was asked once it is sitting in someone else's inbox. */
const criteriaPreamble = (
  criteria: DiagnosisSearchCriteria,
  total: number,
  malignantCount: number,
  listed: number,
): (string | number)[][] => {
  const joiner = criteria.match_mode === "all" ? " และ " : " หรือ ";
  const extras = [
    criteria.include_gross ? "รวม gross description" : null,
    criteria.include_microscopic ? "รวม microscopic description" : null,
    criteria.only_reported ? "เฉพาะเคสที่ออกรายงานแล้ว" : null,
  ].filter(Boolean);

  const rows: (string | number)[][] = [
    ["รายงานค้นหาเคสตามชิ้นเนื้อและการวินิจฉัย (Diagnosis Search Report)"],
    ["Specimen มีคำว่า", criteria.specimen_terms.join(joiner) || "-"],
    ["Diagnosis มีคำว่า", criteria.diagnosis_terms.join(joiner) || "-"],
    ["เงื่อนไขคำค้น", criteria.match_mode === "all" ? "ครบทุกคำ (AND)" : "คำใดคำหนึ่ง (OR)"],
    [
      "ช่วงวันที่",
      `${criteria.date_from ?? "-"} ถึง ${criteria.date_to ?? "-"} (${
        criteria.date_field === "reported" ? "วันที่ออกรายงาน" : "วันที่รับสิ่งส่งตรวจ"
      })`,
    ],
    ["โรงพยาบาล", criteria.hospital_name ?? "ทั้งหมด"],
    ["ตัวเลือกเพิ่มเติม", extras.join(" · ") || "-"],
    ["เคสที่เข้าเงื่อนไข", total],
    ["ติดธง Malignancy", malignantCount],
    ["ออกไฟล์เมื่อ", dayjs().format("DD/MM/YYYY HH:mm")],
  ];
  if (total > listed) {
    rows.push([
      "หมายเหตุ",
      `ไฟล์นี้มี ${listed} เคสแรกจากทั้งหมด ${total} เคส — แบ่งช่วงวันที่ให้แคบลงเพื่อออกให้ครบ`,
    ]);
  }
  rows.push([]);
  return rows;
};

const DiagnosisSearchPage: React.FC = () => {
  const [specimenTerms, setSpecimenTerms] = useState<string[]>([]);
  const [diagnosisTerms, setDiagnosisTerms] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<DiagnosisSearchMatchMode>("all");
  const [dateField, setDateField] = useState<DiagnosisSearchDateField>("registered");
  const [range, setRange] = useState<[Dayjs, Dayjs]>(DEFAULT_RANGE);
  const [hospitalId, setHospitalId] = useState<number | undefined>(undefined);
  const [onlyReported, setOnlyReported] = useState(true);
  const [includeGross, setIncludeGross] = useState(false);
  const [includeMicroscopic, setIncludeMicroscopic] = useState(false);

  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DiagnosisSearchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [malignantCount, setMalignantCount] = useState(0);
  // The criteria the *displayed* rows came from — editing the form afterwards
  // must not relabel an export that still holds the previous result set.
  const [resultCriteria, setResultCriteria] = useState<DiagnosisSearchCriteria | null>(null);

  useEffect(() => {
    HospitalService.getHospitals()
      .then(setHospitals)
      .catch(() => {
        /* hospital filter is optional — a failure here must not block search */
      });
  }, []);

  const hasTerms = specimenTerms.length > 0 || diagnosisTerms.length > 0;

  const params = useMemo<DiagnosisSearchParams>(
    () => ({
      specimen_terms: specimenTerms,
      diagnosis_terms: diagnosisTerms,
      match_mode: matchMode,
      include_gross: includeGross,
      include_microscopic: includeMicroscopic,
      date_field: dateField,
      date_from: range[0]?.format("YYYY-MM-DD"),
      date_to: range[1]?.format("YYYY-MM-DD"),
      hospital_id: hospitalId,
      only_reported: onlyReported,
    }),
    [
      specimenTerms,
      diagnosisTerms,
      matchMode,
      includeGross,
      includeMicroscopic,
      dateField,
      range,
      hospitalId,
      onlyReported,
    ],
  );

  const runSearch = useCallback(async () => {
    if (!hasTerms) {
      message.warning("กรุณาระบุคำค้นอย่างน้อยหนึ่งคำ (specimen หรือ diagnosis)");
      return;
    }
    setLoading(true);
    try {
      const res = await DiagnosisSearchService.search(params);
      setRows(res.items);
      setTotal(res.total);
      setMalignantCount(res.malignant_count);
      setResultCriteria(res.criteria);
    } catch (err) {
      logger.error("Diagnosis search failed:", err);
      message.error("ค้นหาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [hasTerms, params]);

  const reset = () => {
    setSpecimenTerms([]);
    setDiagnosisTerms([]);
    setMatchMode("all");
    setDateField("registered");
    setRange(DEFAULT_RANGE);
    setHospitalId(undefined);
    setOnlyReported(true);
    setIncludeGross(false);
    setIncludeMicroscopic(false);
    setRows([]);
    setTotal(0);
    setMalignantCount(0);
    setResultCriteria(null);
  };

  const exportFile = () => {
    if (!resultCriteria) return;
    // Flattened up front: the matched specimen/diagnosis lists have to collapse
    // to one cell each, and a spreadsheet wants Yes/No rather than a tri-state.
    const flat = rows.map((r, i) => ({
      no: i + 1,
      accession_no: r.accession_no,
      hn: r.hn ?? "",
      patient_name: r.patient_name,
      gender: r.gender ?? "",
      hospital_name: r.hospital_name ?? "",
      matched_specimens: r.matched_specimens.join("; "),
      registered_at: fmtDate(r.registered_at),
      report_at: fmtDate(r.report_at),
      pathologist_name: r.pathologist_name ?? "",
      has_malignancy: r.has_malignancy === true ? "Yes" : r.has_malignancy === false ? "No" : "",
      matched_diagnoses: r.matched_diagnoses.join(" | "),
    }));

    exportToCsv(
      `diagnosis_search_${dayjs().format("YYYYMMDD_HHmm")}.csv`,
      flat,
      [
        { header: "ลำดับ", key: "no" },
        { header: "Accession No.", key: "accession_no" },
        { header: "HN", key: "hn" },
        { header: "ชื่อผู้ป่วย", key: "patient_name" },
        { header: "เพศ", key: "gender" },
        { header: "โรงพยาบาล", key: "hospital_name" },
        { header: "ชิ้นเนื้อที่ตรงเงื่อนไข", key: "matched_specimens" },
        { header: "วันที่รับ", key: "registered_at" },
        { header: "วันที่รายงาน", key: "report_at" },
        { header: "พยาธิแพทย์", key: "pathologist_name" },
        { header: "Malignancy", key: "has_malignancy" },
        { header: "ข้อความวินิจฉัยที่ตรงเงื่อนไข", key: "matched_diagnoses" },
      ],
      { preamble: criteriaPreamble(resultCriteria, total, malignantCount, rows.length) },
    );
  };

  const columns: ColumnsType<DiagnosisSearchRow> = [
    { title: "#", width: 52, align: "center", render: (_v, _r, i) => i + 1 },
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      width: 130,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    { title: "HN", dataIndex: "hn", width: 110, render: (v: string | null) => v || "-" },
    { title: "ชื่อผู้ป่วย", dataIndex: "patient_name", width: 200, ellipsis: true },
    {
      title: "ชิ้นเนื้อที่ตรงเงื่อนไข",
      dataIndex: "matched_specimens",
      render: (v: string[]) =>
        v.length ? (
          <Space size={4} wrap>
            {v.map((s) => (
              <Tag key={s} color="blue" style={{ marginInlineEnd: 0 }}>
                {s}
              </Tag>
            ))}
          </Space>
        ) : (
          "-"
        ),
    },
    {
      title: "วันที่รับ",
      dataIndex: "registered_at",
      width: 112,
      align: "center",
      sorter: (a, b) =>
        dayjs(a.registered_at ?? 0).valueOf() - dayjs(b.registered_at ?? 0).valueOf(),
      render: (v: string | null) => fmtDate(v),
    },
    {
      title: "วันที่รายงาน",
      dataIndex: "report_at",
      width: 112,
      align: "center",
      sorter: (a, b) => dayjs(a.report_at ?? 0).valueOf() - dayjs(b.report_at ?? 0).valueOf(),
      render: (v: string | null) => fmtDate(v),
    },
    {
      title: "พยาธิแพทย์",
      dataIndex: "pathologist_name",
      width: 160,
      ellipsis: true,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Malignancy",
      dataIndex: "has_malignancy",
      width: 110,
      align: "center",
      render: (v: boolean | null) => malignancyTag(v),
    },
  ];

  const truncated = total > rows.length;

  return (
    <div>
      <Card size="small" title="เงื่อนไขการค้นหา (Search Criteria)">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Text type="secondary">ชิ้นเนื้อ / Specimen มีคำว่า</Text>
            <Select
              mode="tags"
              value={specimenTerms}
              onChange={setSpecimenTerms}
              tokenSeparators={[","]}
              open={false}
              suffixIcon={null}
              placeholder="เช่น colon, biopsy — คั่นด้วย comma หรือกด Enter"
              style={{ width: "100%", marginTop: 4 }}
            />
          </Col>
          <Col xs={24} lg={12}>
            <Text type="secondary">การวินิจฉัย / Diagnosis มีคำว่า</Text>
            <Select
              mode="tags"
              value={diagnosisTerms}
              onChange={setDiagnosisTerms}
              tokenSeparators={[","]}
              open={false}
              suffixIcon={null}
              placeholder="เช่น adenocarcinoma — คั่นด้วย comma หรือกด Enter"
              style={{ width: "100%", marginTop: 4 }}
            />
          </Col>

          <Col xs={24} lg={8}>
            <Text type="secondary">เงื่อนไขคำค้น</Text>
            <div style={{ marginTop: 4 }}>
              <Segmented
                block
                value={matchMode}
                onChange={(v) => setMatchMode(v as DiagnosisSearchMatchMode)}
                options={[
                  { label: "ครบทุกคำ (AND)", value: "all" },
                  { label: "คำใดคำหนึ่ง (OR)", value: "any" },
                ]}
              />
            </div>
          </Col>
          <Col xs={24} lg={8}>
            <Text type="secondary">นับตามวันที่</Text>
            <div style={{ marginTop: 4 }}>
              <Segmented
                block
                value={dateField}
                onChange={(v) => setDateField(v as DiagnosisSearchDateField)}
                options={[
                  { label: "วันที่รับ", value: "registered" },
                  { label: "วันที่รายงาน", value: "reported" },
                ]}
              />
            </div>
          </Col>
          <Col xs={24} lg={8}>
            <Text type="secondary">ช่วงวันที่</Text>
            <RangePicker
              value={range}
              onChange={(v) => v?.[0] && v?.[1] && setRange([v[0], v[1]])}
              allowClear={false}
              format="DD/MM/YYYY"
              style={{ width: "100%", marginTop: 4 }}
            />
          </Col>

          <Col xs={24} lg={8}>
            <Text type="secondary">โรงพยาบาล</Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={hospitalId}
              onChange={setHospitalId}
              placeholder="ทั้งหมด"
              style={{ width: "100%", marginTop: 4 }}
              options={hospitals.map((h) => ({ value: h.id, label: h.name }))}
            />
          </Col>
          <Col xs={24} lg={16}>
            <Text type="secondary">ตัวเลือกเพิ่มเติม</Text>
            <div style={{ marginTop: 8 }}>
              <Space size="large" wrap>
                <Space size={8}>
                  <Switch checked={onlyReported} onChange={setOnlyReported} size="small" />
                  <Text>เฉพาะเคสที่ออกรายงานแล้ว</Text>
                </Space>
                <Space size={8}>
                  <Switch checked={includeGross} onChange={setIncludeGross} size="small" />
                  <Text>ค้นใน gross description ด้วย</Text>
                </Space>
                <Space size={8}>
                  <Switch
                    checked={includeMicroscopic}
                    onChange={setIncludeMicroscopic}
                    size="small"
                  />
                  <Text>ค้นใน microscopic description ด้วย</Text>
                </Space>
              </Space>
            </div>
          </Col>
        </Row>

        <Divider style={{ margin: "16px 0 12px" }} />

        <Space wrap>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={loading}
            disabled={!hasTerms}
            onClick={runSearch}
          >
            ค้นหา
          </Button>
          <Button icon={<ReloadOutlined />} onClick={reset}>
            ล้างเงื่อนไข
          </Button>
          <Tooltip title="ไฟล์ CSV (UTF-8 BOM) เปิดใน Excel ได้ตรง ๆ โดยภาษาไทยไม่เพี้ยน และมีหัวรายงานบอกเงื่อนไขที่ใช้ค้น">
            <Button
              icon={<FileExcelOutlined />}
              disabled={rows.length === 0}
              onClick={exportFile}
            >
              Export Excel / CSV
            </Button>
          </Tooltip>
        </Space>

        <Paragraph type="secondary" style={{ fontSize: 12, margin: "12px 0 0" }}>
          <InfoCircleOutlined style={{ marginRight: 6 }} />
          นับเป็นเคสที่เข้าเงื่อนไขเมื่อเคสนั้นมีชิ้นเนื้ออย่างน้อยหนึ่งชิ้นที่ตรงคำค้นฝั่ง specimen
          และมีการวินิจฉัยอย่างน้อยหนึ่งรายการที่ตรงคำค้นฝั่ง diagnosis — ทั้งสองฝั่งอาจมาจากชิ้นเนื้อต่างชิ้นกันในเคสเดียวได้
          จึงแสดงชิ้นเนื้อและข้อความวินิจฉัยที่ตรงเงื่อนไขไว้ให้ตรวจทาน (กดลูกศรหน้าแถวเพื่อดูข้อความวินิจฉัย)
        </Paragraph>
      </Card>

      {resultCriteria && (
        <>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic title="เคสที่เข้าเงื่อนไข" value={total} suffix="เคส" />
              </Card>
            </Col>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic
                  title="ติดธง Malignancy"
                  value={malignantCount}
                  suffix="เคส"
                  valueStyle={{ color: "#cf1322" }}
                />
              </Card>
            </Col>
          </Row>

          {truncated && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
              message={`แสดง ${rows.length} เคสแรกจากทั้งหมด ${total} เคส — แบ่งช่วงวันที่ให้แคบลงเพื่อดูและออกไฟล์ให้ครบ`}
            />
          )}

          <Table<DiagnosisSearchRow>
            style={{ marginTop: 16 }}
            rowKey="case_id"
            size="middle"
            bordered
            loading={loading}
            dataSource={rows}
            columns={columns}
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} เคส` }}
            expandable={{
              rowExpandable: (r) => r.matched_diagnoses.length > 0,
              expandedRowRender: (r) => (
                <div style={{ paddingInlineStart: 8 }}>
                  {r.matched_diagnoses.map((dx, i) => (
                    <Paragraph key={i} style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>
                      <Text type="secondary">▪ </Text>
                      {dx}
                    </Paragraph>
                  ))}
                </div>
              ),
            }}
          />
        </>
      )}
    </div>
  );
};

export default DiagnosisSearchPage;

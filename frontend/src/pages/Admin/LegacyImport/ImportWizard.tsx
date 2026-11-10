import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Segmented,
  Select,
  Space,
  Spin,
  Steps,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import { DeleteOutlined, FileExcelOutlined, InboxOutlined, LoadingOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import HospitalService from "../../../services/hospitalService";
import legacyImportService, {
  LegacyFieldSource,
  LegacyImportBatch,
  LegacyImportProfile,
  LegacyImportReportType,
  LegacyInspectResult,
  LegacyPreviewResult,
  LegacyTargetField,
} from "../../../services/legacyImportService";
import type { Hospital } from "../../../types/hospital";
import MappingStep from "./MappingStep";
import PreviewStep from "./PreviewStep";
import { REPORT_TYPE_LABEL, apiErrorText, buildMapping, initialFields, missingRequired } from "./mappingUtils";

const { Text } = Typography;

interface Props {
  onCommitted: () => void;
  onShowHistory: () => void;
}

const ImportWizard: React.FC<Props> = ({ onCommitted, onShowHistory }) => {
  const [step, setStep] = useState(0);
  const [allFields, setAllFields] = useState<Record<LegacyImportReportType, LegacyTargetField[]> | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [profiles, setProfiles] = useState<LegacyImportProfile[]>([]);

  const [reportType, setReportType] = useState<LegacyImportReportType>("surgical");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inspect, setInspect] = useState<LegacyInspectResult | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState(1);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);

  const [sourceSystem, setSourceSystem] = useState("");
  const [fields, setFields] = useState<Record<string, LegacyFieldSource>>({});
  const [hospitalValues, setHospitalValues] = useState<Record<string, number>>({});
  const [defaultHospitalId, setDefaultHospitalId] = useState<number | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip");

  const [preview, setPreview] = useState<LegacyPreviewResult | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [batch, setBatch] = useState<LegacyImportBatch | null>(null);

  const [busy, setBusy] = useState<null | "inspect" | "preview" | "commit">(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [saving, setSaving] = useState(false);

  const targets = useMemo(() => allFields?.[reportType] ?? [], [allFields, reportType]);
  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const missing = missingRequired(targets, fields);

  useEffect(() => {
    legacyImportService
      .getFields()
      .then(setAllFields)
      .catch((e) => message.error(apiErrorText(e, "โหลดรายการช่องไม่สำเร็จ")));
    HospitalService.getHospitals()
      .then(setHospitals)
      .catch(() => message.error("โหลดรายชื่อโรงพยาบาลไม่สำเร็จ"));
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await legacyImportService.getProfiles(reportType));
    } catch (e) {
      message.error(apiErrorText(e, "โหลด mapping ที่บันทึกไว้ไม่สำเร็จ"));
    }
  }, [reportType]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const applyProfileOrSuggestions = (result: LegacyInspectResult, chosen: LegacyImportProfile | null) => {
    const { fields: f, missingColumns: m } = initialFields(result.headers, result.suggested_fields, chosen?.mapping);
    setFields(f);
    setMissingColumns(m);
    if (chosen) {
      setSourceSystem(chosen.mapping.source_system);
      setHospitalValues(chosen.mapping.hospital_values ?? {});
      setDefaultHospitalId(chosen.mapping.default_hospital_id ?? null);
      setOnDuplicate(chosen.mapping.on_duplicate);
    }
  };

  const readFile = async (f: File, opts?: { sheet?: string | null; headerRow?: number; profile?: LegacyImportProfile | null }) => {
    const useProfile = opts?.profile !== undefined ? opts.profile : profile;
    const useSheet = opts?.sheet !== undefined ? opts.sheet : useProfile?.mapping.sheet ?? null;
    const useHeaderRow = opts?.headerRow ?? useProfile?.mapping.header_row ?? 1;
    setBusy("inspect");
    try {
      let result: LegacyInspectResult;
      try {
        result = await legacyImportService.inspect(f, reportType, useSheet, useHeaderRow);
      } catch (e) {
        // A saved mapping's sheet name may not exist in this workbook; fall
        // back to the first sheet rather than refusing the file.
        if (!useSheet) throw e;
        result = await legacyImportService.inspect(f, reportType, null, useHeaderRow);
        message.warning(`ไม่พบชีต “${useSheet}” ในไฟล์นี้ ใช้ชีตแรกแทน`);
      }
      setFile(f);
      setInspect(result);
      setSheet(result.sheet ?? null);
      setHeaderRow(useHeaderRow);
      setPreview(null);
      applyProfileOrSuggestions(result, useProfile);
    } catch (e) {
      message.error(apiErrorText(e, "อ่านไฟล์ไม่สำเร็จ"));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setStep(0);
    setFile(null);
    setInspect(null);
    setSheet(null);
    setHeaderRow(1);
    setPreview(null);
    setBatch(null);
    setSkipInvalid(false);
    setMissingColumns([]);
    setFields({});
    setHospitalValues({});
  };

  const changeReportType = (t: LegacyImportReportType) => {
    setReportType(t);
    setProfileId(null);
    reset();
  };

  const changeProfile = (id: number | null) => {
    setProfileId(id);
    const chosen = profiles.find((p) => p.id === id) ?? null;
    if (file) readFile(file, { profile: chosen, sheet: chosen?.mapping.sheet ?? sheet, headerRow: chosen?.mapping.header_row ?? headerRow });
  };

  const mapping = () =>
    buildMapping({ reportType, sourceSystem, sheet, headerRow, fields, hospitalValues, defaultHospitalId, onDuplicate });

  const runPreview = async () => {
    if (!file) return;
    setBusy("preview");
    try {
      const result = await legacyImportService.preview(file, mapping());
      setPreview(result);
      setPreviewStale(false);
      setStep(2);
    } catch (e) {
      message.error(apiErrorText(e, "ตรวจสอบข้อมูลไม่สำเร็จ"));
    } finally {
      setBusy(null);
    }
  };

  const runCommit = async () => {
    if (!file) return;
    setBusy("commit");
    try {
      const result = await legacyImportService.commit(file, mapping(), skipInvalid);
      setBatch(result);
      setStep(3);
      onCommitted();
    } catch (e) {
      message.error(apiErrorText(e, "นำเข้าไม่สำเร็จ"));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async (asNew: boolean) => {
    const name = profileName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const saved =
        !asNew && profile
          ? await legacyImportService.updateProfile(profile.id, name, mapping())
          : await legacyImportService.createProfile(name, mapping());
      message.success("บันทึก mapping แล้ว");
      setSaveOpen(false);
      await loadProfiles();
      setProfileId(saved.id);
    } catch (e) {
      message.error(apiErrorText(e, "บันทึก mapping ไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!profile) return;
    try {
      await legacyImportService.deleteProfile(profile.id);
      message.success("ลบ mapping แล้ว");
      setProfileId(null);
      await loadProfiles();
    } catch (e) {
      message.error(apiErrorText(e, "ลบ mapping ไม่สำเร็จ"));
    }
  };

  const changeField = (key: string, src: LegacyFieldSource | null) => {
    setFields((prev) => {
      const next = { ...prev };
      if (src) next[key] = src;
      else delete next[key];
      return next;
    });
  };

  const changeHospitalValue = (value: string, hospitalId: number | null) => {
    setHospitalValues((prev) => {
      const next = { ...prev };
      if (hospitalId) next[value] = hospitalId;
      else delete next[value];
      return next;
    });
    setPreviewStale(true);
  };

  if (!allFields) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  const fileStep = (
    <div>
      <Space wrap size={24} style={{ marginBottom: 16 }}>
        <Space orientation="vertical" size={2}>
          <Text strong>ประเภทรายงาน</Text>
          <Segmented
            value={reportType}
            onChange={(v) => changeReportType(v as LegacyImportReportType)}
            options={(Object.keys(REPORT_TYPE_LABEL) as LegacyImportReportType[]).map((t) => ({
              value: t,
              label: REPORT_TYPE_LABEL[t],
            }))}
          />
        </Space>
        <Space orientation="vertical" size={2}>
          <Text strong>Mapping ที่บันทึกไว้</Text>
          <Space size={4}>
            <Select
              data-testid="profile-select"
              style={{ width: 260 }}
              allowClear
              placeholder={profiles.length ? "เลือก mapping" : "ยังไม่มี mapping ที่บันทึกไว้"}
              disabled={!profiles.length}
              value={profileId ?? undefined}
              onChange={(v?: number) => changeProfile(v ?? null)}
              options={profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
            {profile && (
              <Popconfirm title={`ลบ mapping “${profile.name}”?`} okText="ลบ" cancelText="ยกเลิก" onConfirm={deleteProfile}>
                <Button icon={<DeleteOutlined />} aria-label="ลบ mapping" />
              </Popconfirm>
            )}
          </Space>
        </Space>
      </Space>

      <Upload.Dragger
        accept=".xlsx,.csv,.txt"
        showUploadList={false}
        maxCount={1}
        disabled={busy === "inspect"}
        beforeUpload={(f) => {
          readFile(f, { sheet: profile?.mapping.sheet ?? null, headerRow: profile?.mapping.header_row ?? 1 });
          return false;
        }}
      >
        <p className="ant-upload-drag-icon">{busy === "inspect" ? <LoadingOutlined /> : <InboxOutlined />}</p>
        <p className="ant-upload-text">คลิกหรือลากไฟล์มาวางที่นี่</p>
        <p className="ant-upload-hint">รองรับ .xlsx และ .csv (UTF-8 หรือ Windows-874) ไม่เกิน 20 MB / 50,000 แถว</p>
      </Upload.Dragger>

      {inspect && file && (
        <div style={{ marginTop: 16 }}>
          <Descriptions size="small" bordered column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="ไฟล์">
              <FileExcelOutlined style={{ marginRight: 6 }} />
              {file.name}
            </Descriptions.Item>
            <Descriptions.Item label="จำนวนแถว">{inspect.total_rows.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="คอลัมน์">{inspect.headers.length}</Descriptions.Item>
          </Descriptions>
          <Space wrap style={{ marginTop: 12 }}>
            {inspect.sheets.length > 1 && (
              <Space size={4}>
                <Text>ชีต</Text>
                <Select
                  style={{ width: 200 }}
                  value={sheet ?? undefined}
                  options={inspect.sheets.map((s) => ({ value: s, label: s }))}
                  onChange={(v: string) => readFile(file, { sheet: v, headerRow })}
                />
              </Space>
            )}
            <Space size={4}>
              <Text>หัวคอลัมน์อยู่แถวที่</Text>
              <InputNumber min={1} max={50} value={headerRow} onChange={(v) => setHeaderRow(Number(v) || 1)} />
              <Button icon={<ReloadOutlined />} onClick={() => readFile(file, { sheet, headerRow })} loading={busy === "inspect"}>
                อ่านใหม่
              </Button>
            </Space>
          </Space>
          <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
            หัวคอลัมน์: {inspect.headers.join(", ")}
          </Text>
        </div>
      )}
    </div>
  );

  const nextDisabledReason = !sourceSystem.trim()
    ? "ใส่ชื่อระบบเดิมก่อน"
    : missing.length
      ? `ยังไม่ได้จับคู่: ${missing.join(", ")}`
      : null;

  const importable = preview ? preview.new_rows + (onDuplicate === "update" ? preview.existing_rows : 0) : 0;
  const commitDisabledReason = !preview
    ? "ตรวจสอบข้อมูลก่อน"
    : previewStale
      ? "เปลี่ยนการจับคู่โรงพยาบาลแล้ว กดตรวจสอบอีกครั้งก่อน"
      : preview.error_rows > 0 && !skipInvalid
        ? "ยังมีแถวที่มีข้อผิดพลาด"
        : importable === 0
          ? "ไม่มีแถวที่จะเพิ่มหรืออัปเดต"
          : null;

  return (
    <div>
      <Steps
        size="small"
        current={step}
        style={{ marginBottom: 24 }}
        items={[{ title: "เลือกไฟล์" }, { title: "จับคู่คอลัมน์" }, { title: "ตรวจสอบและนำเข้า" }]}
      />

      {step === 0 && fileStep}

      {step === 1 && inspect && (
        <>
          {missingColumns.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title="ไฟล์นี้ไม่มีบางคอลัมน์ที่ mapping ที่เลือกใช้"
              description={missingColumns.join(", ")}
            />
          )}
          <MappingStep
            targets={targets}
            inspect={inspect}
            fields={fields}
            onFieldChange={changeField}
            sourceSystem={sourceSystem}
            onSourceSystemChange={setSourceSystem}
            onDuplicate={onDuplicate}
            onDuplicateChange={setOnDuplicate}
            defaultHospitalId={defaultHospitalId}
            onDefaultHospitalChange={setDefaultHospitalId}
            hospitals={hospitals}
          />
        </>
      )}

      {step === 2 && preview && (
        <>
          <PreviewStep
            preview={preview}
            targets={targets}
            hospitals={hospitals}
            hospitalValues={hospitalValues}
            onHospitalValueChange={changeHospitalValue}
            onDuplicate={onDuplicate}
            stale={previewStale}
          />
          {preview.error_rows > 0 && (
            <Checkbox style={{ marginTop: 16 }} checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)}>
              นำเข้าเฉพาะแถวที่ไม่มีข้อผิดพลาด (ข้าม {preview.error_rows.toLocaleString()} แถว)
            </Checkbox>
          )}
        </>
      )}

      {step === 3 && batch && (
        <Result
          status="success"
          title="นำเข้าเรียบร้อย"
          subTitle={`ชุดที่ #${batch.id}: เพิ่ม ${batch.inserted_count.toLocaleString()} · อัปเดต ${batch.updated_count.toLocaleString()} · ข้าม ${batch.skipped_count.toLocaleString()} · ข้อผิดพลาด ${batch.error_count.toLocaleString()} แถว`}
          extra={[
            <Button key="new" type="primary" onClick={reset}>
              นำเข้าไฟล์ใหม่
            </Button>,
            <Button key="history" onClick={onShowHistory}>
              ดูประวัติการนำเข้า
            </Button>,
          ]}
        />
      )}

      {step < 3 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 8, flexWrap: "wrap" }}>
          <Space>
            {step > 0 && <Button onClick={() => setStep(step - 1)}>ย้อนกลับ</Button>}
          </Space>
          <Space wrap>
            {step >= 1 && (
              <Button
                icon={<SaveOutlined />}
                onClick={() => {
                  setProfileName(profile?.name ?? "");
                  setSaveOpen(true);
                }}
                disabled={!sourceSystem.trim()}
              >
                บันทึก mapping
              </Button>
            )}
            {step === 0 && (
              <Button type="primary" disabled={!inspect} onClick={() => setStep(1)}>
                ถัดไป
              </Button>
            )}
            {step === 1 && (
              <Tooltip title={nextDisabledReason}>
                <Button type="primary" disabled={!!nextDisabledReason} loading={busy === "preview"} onClick={runPreview}>
                  ตรวจสอบข้อมูล
                </Button>
              </Tooltip>
            )}
            {step === 2 && (
              <>
                <Button icon={<ReloadOutlined />} loading={busy === "preview"} onClick={runPreview} type={previewStale ? "primary" : "default"}>
                  ตรวจสอบอีกครั้ง
                </Button>
                <Tooltip title={commitDisabledReason}>
                  <Popconfirm
                    title={`นำเข้า ${importable.toLocaleString()} รายงาน?`}
                    description="ยกเลิกทั้งชุดได้ภายหลังจากแท็บประวัติการนำเข้า"
                    okText="นำเข้า"
                    cancelText="ยกเลิก"
                    onConfirm={runCommit}
                    disabled={!!commitDisabledReason}
                  >
                    <Button type="primary" disabled={!!commitDisabledReason} loading={busy === "commit"}>
                      นำเข้า {importable ? importable.toLocaleString() : ""} รายงาน
                    </Button>
                  </Popconfirm>
                </Tooltip>
              </>
            )}
          </Space>
        </div>
      )}

      <Modal
        title="บันทึก mapping"
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => setSaveOpen(false)}>
            ยกเลิก
          </Button>,
          profile && (
            <Button key="new" onClick={() => saveProfile(true)} loading={saving} disabled={!profileName.trim() || profileName.trim() === profile.name}>
              บันทึกเป็นชุดใหม่
            </Button>
          ),
          <Button key="save" type="primary" onClick={() => saveProfile(false)} loading={saving} disabled={!profileName.trim()}>
            {profile ? `บันทึกทับ “${profile.name}”` : "บันทึก"}
          </Button>,
        ]}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
          เก็บการจับคู่คอลัมน์ ชื่อระบบเดิม และการจับคู่โรงพยาบาลไว้ใช้กับไฟล์ถัดไปจากระบบเดียวกัน
        </Text>
        <Input
          autoFocus
          placeholder="ชื่อ mapping"
          maxLength={100}
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          onPressEnter={() => saveProfile(false)}
        />
      </Modal>
    </div>
  );
};

export default ImportWizard;

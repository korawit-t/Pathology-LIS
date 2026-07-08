import React, { useEffect, useState, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  Button,
  Row,
  Col,
  Checkbox,
  Space,
  Upload,
  Select,
  message,
  Popconfirm,
  Divider,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import { DeleteOutlined, CloseCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import debounce from "lodash/debounce";

// Components & Services
import PatientFormModal from "../../../components/PatientFormModal";
import HisPatientSearchModal from "../../SurgicalCase/components/HisPatientSearchModal";
import GynePrintPreviewModal from "./GynePrintPreviewModal";
import PatientSearchField from "../../../components/FormParts/PatientSearchField";
import RequestDocumentsUpload from "../../../components/FormParts/RequestDocumentsUpload";
import GyneCytoFormFields from "./GyneCytoFormModal.fields";
import type { HisPatientResult } from "../../../services/hisService";
import PatientService from "../../../services/patientService";
import HospitalService from "../../../services/hospitalService";
import DepartmentService from "../../../services/departmentService";
import MedicalSchemeService from "../../../services/medicalSchemeService";
import UserService from "../../../services/userService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import type { RequestFile } from "../../../types/surgical";
import TitleService from "../../../services/titleService";
import SpecimenTemplateService from "../../../services/specimenTemplateService";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";
import type { Patient } from "../../../types/patient";
import type { Title } from "../../../types/title";
import type { Hospital } from "../../../types/hospital";
import type { Department } from "../../../types/department";
import type { MedicalScheme } from "../../../types/medicalScheme";
import type { User } from "../../../types/user";

interface GyneCytoFormModalProps {
  open: boolean;
  editingId: number | null;
  onCancel: () => void;
  onSuccess: (savedData: GyneCytologyCase | null) => void;
  onRefresh?: () => void;
}

const GyneCytoFormModal: React.FC<GyneCytoFormModalProps> = ({
  open,
  editingId,
  onCancel,
  onSuccess,
  onRefresh,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saveAndNewData, setSaveAndNewData] = useState<GyneCytologyCase | null>(
    null,
  );
  const pendingResetRef = React.useRef(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  // Master Data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemes, setSchemes] = useState<MedicalScheme[]>([]);
  const [staffs, setStaffs] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isHisModalOpen, setIsHisModalOpen] = useState(false);
  const [gyneSpecimenTypes, setGyneSpecimenTypes] = useState<string[]>([
    "Conventional",
    "Liquid Based (LBC)",
  ]);

  useEffect(() => {
    if (open) {
      fetchMasterData();
      if (editingId) loadEditingData();
      else {
        form.resetFields();
        setFileList([]);
        form.setFieldsValue({
          collection_site: "Cervical/Endocervical",
          is_postmenopausal: false,
          is_pregnant: false,
          is_out_lab_consult: false,
          is_out_lab: false,
          collect_at: dayjs(),
        });
      }
    }
  }, [open, editingId]);

  const fetchMasterData = async () => {
    try {
      const [h, d, sc, u, t, specimenTypes] = await Promise.all([
        HospitalService.getHospitals(),
        DepartmentService.getDepartments(true),
        MedicalSchemeService.getSchemes(),
        UserService.getUsers(),
        TitleService.getTitles(),
        SpecimenTemplateService.getTemplates("gyne_cyto"),
      ]);
      setHospitals(h);
      setDepartments(d);
      setSchemes(sc);
      setStaffs(u);
      setTitles(t);
      if (specimenTypes.length) {
        const names = specimenTypes.map((s) => s.name);
        setGyneSpecimenTypes(names);
        if (!editingId && !form.getFieldValue("specimen_type")) {
          form.setFieldValue("specimen_type", names[0]);
        }
      }
    } catch (err) {
      message.error("Failed to load master data");
    }
  };

  const loadEditingData = async () => {
    setLoading(true);
    try {
      const data = await GyneCytologyCaseService.getById(editingId!);
      if (data.patient) setPatients([data.patient]);
      if (data.request_files) {
        setFileList(
          data.request_files.map((f: RequestFile) => ({
            uid: String(f.id),
            name: f.file_name,
            status: "done" as const,
            type: f.file_type,
          })),
        );
      }
      setTimeout(() => {
        form.setFieldsValue({
          ...data,
          patient_id: data.patient?.id || data.patient_id,
          hospital_id: data.hospital_id
            ? Number(data.hospital_id)
            : data.hospital?.id
              ? Number(data.hospital?.id)
              : undefined,
          department_id: data.department?.id ?? data.department_id ?? undefined,
          medical_scheme_id:
            data.medical_scheme?.id ?? data.medical_scheme_id ?? undefined,
          hn: data.hn,
          pathologist_id: data.pathologist?.id || data.pathologist_id,
          cytotechnologist_id:
            data.cytotechnologist?.id || data.cytotechnologist_id,
          last_menstrual_period: data.last_menstrual_period
            ? dayjs(data.last_menstrual_period)
            : null,
          collect_at: data.collect_at ? dayjs(data.collect_at) : null,
        });
      }, 0);
    } catch (err) {
      message.error("Failed to load case data");
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearchPatient = useMemo(
    () =>
      debounce(async (v: string) => {
        if (!v || v.length < 3) return;
        setIsSearching(true);
        try {
          const res = await PatientService.getPatients(v);
          setPatients(res);
        } finally {
          setIsSearching(false);
        }
      }, 500),
    [],
  );

  const handleSelectSpecificHN = (
    e: React.MouseEvent,
    hnItem: string,
    patientId: number,
  ) => {
    e.stopPropagation();
    if (hnItem.includes(": ")) {
      const [hName, hNumber] = hnItem.split(": ");
      const targetHospital = hospitals.find((h) => h.name === hName);
      form.setFieldsValue({
        patient_id: patientId,
        hn: hNumber,
        hospital_id: targetHospital?.id,
      });
      message.success(`HN: ${hNumber} (${hName}) selected`);
    }
  };

  const handlePreviewFile = async (file: UploadFile) => {
    if (file.uid.startsWith("rc-upload") || file.uid.startsWith("pending-"))
      return;
    try {
      const response = await GyneCytologyCaseService.downloadRequestFileBlob(
        Number(file.uid),
      );
      const blob = new Blob([response], {
        type: file.type || "application/octet-stream",
      });
      const url = window.URL.createObjectURL(blob);
      setPreviewImage(url);
      setPreviewTitle(file.name);
      setPreviewOpen(true);
    } catch {
      message.error("Failed to open file");
    }
  };

  const handleConfirmDownload = (file: UploadFile) => {
    Modal.confirm({
      title: "Download File",
      content: `Download "${file.name}"?`,
      okText: "Download",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await GyneCytologyCaseService.downloadRequestFile(
            Number(file.uid),
            file.name,
          );
          message.success("File downloaded successfully");
        } catch {
          message.error("Failed to download file");
        }
      },
    });
  };

  const handleConfirmDeleteFile = (file: UploadFile) => {
    if (file.uid.startsWith("rc-upload") || file.uid.startsWith("pending-")) {
      setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
      return;
    }
    Modal.confirm({
      title: "Delete File",
      content: `Delete "${file.name}"? This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await GyneCytologyCaseService.deleteRequestFile(Number(file.uid));
          message.success("File deleted");
          setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
        } catch {
          message.error("Failed to delete file");
        }
      },
    });
  };

  const handleUploadRequest = async (options: {
    file: File;
    onSuccess: (res: string) => void;
    onError: (err: { err: unknown }) => void;
  }) => {
    const { file, onSuccess, onError } = options;
    if (!editingId) {
      message.warning("Please save the case before uploading files");
      onError({ err: new Error("Case not created yet") });
      return;
    }
    try {
      setIsUploading(true);
      const res = await GyneCytologyCaseService.uploadRequestFile(
        editingId,
        file,
      );
      const newFile: UploadFile = {
        uid: String(res.file_id),
        name: file.name,
        status: "done",
        type: file.type,
      };
      setFileList((prev) => [...prev, newFile]);
      onSuccess("ok");
      message.success(`${file.name} uploaded successfully`);
    } catch (err) {
      onError({ err });
      message.error(`Failed to upload ${file.name}`);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadProps: UploadProps = {
    customRequest:
      handleUploadRequest as unknown as UploadProps["customRequest"],
    onRemove: () => false,
    fileList,
    accept: ".pdf,.jpg,.jpeg,.png",
    showUploadList: false,
    beforeUpload: (file) => {
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error("File must be smaller than 10MB");
        return Upload.LIST_IGNORE;
      }
      if (!editingId) {
        setFileList((prev) => [
          ...prev,
          {
            uid: `pending-${Date.now()}`,
            name: file.name,
            status: "done",
            type: file.type,
            originFileObj: file as any,
          },
        ]);
        return Upload.LIST_IGNORE;
      }
      return true;
    },
  };

  const handleDelete = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      await GyneCytologyCaseService.delete(editingId);
      message.success("Case deleted successfully");
      onSuccess(null);
    } catch {
      message.error("Failed to delete case");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    let cancelReason = "";

    Modal.confirm({
      title: "Confirm case cancellation?",
      icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
      content: (
        <div style={{ marginTop: 16 }}>
          <p>Please provide a reason for cancellation:</p>
          <Input.TextArea
            rows={3}
            placeholder="e.g. Wrong HN, Changed hospital, Other..."
            onChange={(e) => (cancelReason = e.target.value)}
          />
        </div>
      ),
      okText: "Confirm Cancel",
      okType: "danger",
      cancelText: "Close",
      onOk: async () => {
        if (!cancelReason.trim()) {
          message.warning("Please provide a reason before cancelling");
          return Promise.reject();
        }
        try {
          setLoading(true);
          await GyneCytologyCaseService.cancel(editingId!, cancelReason);
          message.success("Case cancelled successfully");
          onSuccess(null);
        } catch {
          message.error("Failed to cancel case");
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const doSave = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        last_menstrual_period:
          values.last_menstrual_period?.format("YYYY-MM-DD"),
        collect_at: values.collect_at?.toISOString(),
      };
      const res = editingId
        ? await GyneCytologyCaseService.update(editingId, payload)
        : await GyneCytologyCaseService.create(payload);
      message.success(editingId ? "Updated successfully" : "Registered successfully");
      onSuccess(res);
    } catch (err) {
      message.error("An error occurred while saving");
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values: any) => {
    if (!values.cytotechnologist_id) {
      Modal.confirm({
        title: "Cytotechnologist not specified",
        content:
          "Screened by (Cytotechnologist) has not been specified. Continue saving anyway?",
        okText: "Continue Saving",
        cancelText: "Cancel",
        onOk: () => doSave(values),
      });
      return;
    }
    await doSave(values);
  };

  const doSaveAndNew = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        last_menstrual_period:
          values.last_menstrual_period?.format("YYYY-MM-DD"),
        collect_at: values.collect_at?.toISOString(),
      };
      const res = await GyneCytologyCaseService.create(payload);
      message.success(`Registered successfully (${res.accession_no})`);
      onRefresh?.();
      setFileList([]);
      pendingResetRef.current = true;
      setSaveAndNewData(res);
    } catch (err) {
      message.error("An error occurred while saving");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndNew = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (!values.cytotechnologist_id) {
      Modal.confirm({
        title: "Cytotechnologist not specified",
        content:
          "Screened by (Cytotechnologist) has not been specified. Continue saving anyway?",
        okText: "Continue Saving",
        cancelText: "Cancel",
        onOk: () => doSaveAndNew(values),
      });
      return;
    }
    await doSaveAndNew(values);
  };

  return (
    <>
      <Modal
        title={editingId ? "Edit Gyne Case" : "Gyne Cytology Registration"}
        open={open}
        onCancel={onCancel}
        footer={null}
        width={950}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {/* Row 1: Patient search + Hospital */}
          <Row gutter={16}>
            <Col span={14}>
              <PatientSearchField
                patients={patients}
                titles={titles}
                hospitals={hospitals}
                isSearching={isSearching}
                onSearch={debouncedSearchPatient}
                onNewPatient={() => setIsPatientModalOpen(true)}
                onHisSearch={() => setIsHisModalOpen(true)}
                onSelectHN={handleSelectSpecificHN}
              />
            </Col>
            <Col span={10}>
              <Form.Item
                name="hospital_id"
                label="Hospital"
                rules={[{ required: true, message: "Please select a hospital" }]}
              >
                <Select placeholder="Select Hospital">
                  {hospitals.map((h) => (
                    <Select.Option key={h.id} value={h.id}>
                      {h.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* Rows 2–5: HN/clinician/dept/scheme, specimen, checkboxes, staff */}
          <GyneCytoFormFields
            hospitals={hospitals}
            departments={departments}
            schemes={schemes}
            staffs={staffs}
            gyneSpecimenTypes={gyneSpecimenTypes}
            editingId={editingId}
          />

          {/* Request Documents + Outlab flag + Express */}
          <Divider style={{ margin: "8px 0" }} />
          <Row gutter={16} align="middle">
            <Col span={12}>
              <RequestDocumentsUpload
                uploadProps={uploadProps}
                fileList={fileList}
                isUploading={isUploading}
                editingId={editingId}
                onPreview={handlePreviewFile}
                onDownload={handleConfirmDownload}
                onDelete={handleConfirmDeleteFile}
              />
            </Col>
            <Col
              span={6}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Form.Item
                name="is_out_lab"
                valuePropName="checked"
                style={{ margin: 0 }}
              >
                <Checkbox>
                  <span
                    style={{
                      background: "#f0f5ff",
                      border: "1px solid #adc6ff",
                      borderRadius: 6,
                      padding: "4px 10px",
                      color: "#1d39c4",
                      fontWeight: 600,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔬 Out Lab Test
                  </span>
                </Checkbox>
              </Form.Item>
            </Col>
            <Col span={6} style={{ display: "flex", justifyContent: "center" }}>
              <Form.Item
                name="is_express"
                valuePropName="checked"
                initialValue={false}
                style={{ margin: 0 }}
              >
                <Checkbox>
                  <span
                    style={{
                      background: "#fff1f0",
                      border: "1px solid #ffa39e",
                      borderRadius: 6,
                      padding: "4px 10px",
                      color: "#cf1322",
                      fontWeight: 600,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔥 Express
                  </span>
                </Checkbox>
              </Form.Item>
            </Col>
          </Row>

          {/* Footer buttons */}
          <div
            style={{
              marginTop: 24,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Space size={8}>
              <Button onClick={onCancel} size="large">
                Cancel
              </Button>
              {editingId && (
                <>
                  {form.getFieldValue("status") === "registered" ? (
                    <Popconfirm
                      title="Delete this case?"
                      description="This will permanently remove the case from the system."
                      onConfirm={handleDelete}
                      okText="Delete"
                      cancelText="Cancel"
                      okButtonProps={{ danger: true, loading }}
                    >
                      <Button danger icon={<DeleteOutlined />} type="text">
                        Delete Case
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Popconfirm
                      title="Confirm cancel this case?"
                      onConfirm={handleCancel}
                      okText="Confirm Cancel"
                      cancelText="Close"
                      okButtonProps={{ danger: true, loading }}
                    >
                      <Button danger icon={<CloseCircleOutlined />} type="text">
                        Cancel Case
                      </Button>
                    </Popconfirm>
                  )}
                </>
              )}
            </Space>
            <Space size={12}>
              {!editingId && (
                <Button
                  size="large"
                  loading={loading}
                  onClick={handleSaveAndNew}
                  style={{
                    minWidth: 150,
                    background: "#52c41a",
                    borderColor: "#389e0d",
                    color: "#fff",
                  }}
                >
                  Save & New
                </Button>
              )}
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                size="large"
                style={{ minWidth: 150 }}
              >
                {editingId ? "Save Changes" : "Save & Close"}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal
        open={previewOpen}
        title={previewTitle}
        footer={null}
        onCancel={() => {
          setPreviewOpen(false);
          if (previewImage) URL.revokeObjectURL(previewImage);
          setPreviewImage(null);
        }}
        width={900}
      >
        {previewImage &&
          (previewTitle.toLowerCase().endsWith(".pdf") ? (
            <iframe
              src={previewImage}
              style={{ width: "100%", height: 600, border: "none" }}
            />
          ) : (
            <img
              src={previewImage}
              style={{ width: "100%" }}
              alt={previewTitle}
            />
          ))}
      </Modal>

      <PatientFormModal
        open={isPatientModalOpen}
        onClose={() => setIsPatientModalOpen(false)}
        onSuccess={(p) => {
          setPatients([p, ...patients]);
          form.setFieldsValue({
            patient_id: p.id,
            hn: p.hn || form.getFieldValue("hn"),
          });
          setIsPatientModalOpen(false);
        }}
        titles={titles}
        hospitals={hospitals}
        schemes={schemes}
      />

      <HisPatientSearchModal
        open={isHisModalOpen}
        onCancel={() => setIsHisModalOpen(false)}
        caseType="gyne"
        onSelect={async (record: HisPatientResult) => {
          setIsHisModalOpen(false);
          try {
            const firstName = record.fname?.trim() || "";
            const lastName = record.lname?.trim() || "";
            let patient: Patient | null = null;

            if (record.cid && record.cid.trim()) {
              const existing = await PatientService.getPatients(record.cid);
              patient = existing.find((p) => p.cid === record.cid);
            }
            if (!patient && firstName) {
              const existing = await PatientService.getPatients(firstName);
              patient = existing.find(
                (p) => p.name === firstName && (p.ln || "") === lastName,
              );
            }
            let gender: string | undefined;
            if (record.gender_code === 1) gender = "Male";
            else if (record.gender_code === 2) gender = "Female";

            const pnameClean = (record.pname || "").trim();
            let matchedTitle = pnameClean
              ? titles.find((t) => (t.title || "").trim() === pnameClean)
              : undefined;

            if (pnameClean && !matchedTitle) {
              try {
                const created = await TitleService.createTitle({
                  title: pnameClean,
                });
                matchedTitle = created;
                setTitles((prev) => [...prev, created]);
                message.info(`Added new title: ${created.title}`);
              } catch {
                /* No permission to create */
              }
            }

            if (!patient) {
              patient = await PatientService.createPatient({
                title_id: matchedTitle?.id || undefined,
                name: firstName,
                ln: lastName || undefined,
                gender,
                cid: record.cid || undefined,
                birth_date: record.birthday
                  ? record.birthday.split(" ")[0]
                  : undefined,
              });
              message.success(
                `Created new patient: ${firstName} ${lastName}`.trim(),
              );
            } else if (!patient.title_id && matchedTitle) {
              await PatientService.updatePatient(patient.id, {
                title_id: matchedTitle.id,
              });
              patient = { ...patient, title_id: matchedTitle.id };
            }

            setPatients((prev) => {
              const exists = prev.find((p) => p.id === patient.id);
              return exists ? prev : [patient, ...prev];
            });

            const matchedHospitalId = hospitals[0]?.id;

            let matchedDepartmentId: number | undefined;
            if (record.department?.trim()) {
              const dn = record.department.trim().toLowerCase();
              const existing = departments.find((d) => {
                const n = d.name?.toLowerCase().trim() ?? "";
                return n === dn || n.includes(dn) || dn.includes(n);
              });
              if (existing) {
                matchedDepartmentId = existing.id;
              } else {
                try {
                  const created = await DepartmentService.createDepartment({
                    name: record.department.trim(),
                    is_active: true,
                  });
                  matchedDepartmentId = created.id;
                  setDepartments((prev) => [...prev, created]);
                  message.info(`Added new Department: ${created.name}`);
                } catch {
                  /* No permission to create */
                }
              }
            }

            let matchedSchemeId: number | undefined;
            if (record.pttype?.trim()) {
              const pt = record.pttype.trim().toLowerCase();
              const existing = schemes.find(
                (s) =>
                  s.name?.toLowerCase() === pt ||
                  s.name?.toLowerCase().includes(pt) ||
                  pt.includes(s.name?.toLowerCase() ?? ""),
              );
              if (existing) {
                matchedSchemeId = existing.id;
              } else {
                try {
                  const created = await MedicalSchemeService.createScheme({
                    name: record.pttype.trim(),
                  });
                  matchedSchemeId = created.id;
                  setSchemes((prev) => [...prev, created]);
                  message.info(`Added new Medical Scheme: ${created.name}`);
                } catch {
                  /* No permission to create */
                }
              }
            }

            const dayObj = record.order_date
              ? dayjs(record.order_date)
              : undefined;
            form.setFieldsValue({
              patient_id: patient.id,
              hn: record.hn || undefined,
              hospital_id: matchedHospitalId,
              department_id: matchedDepartmentId,
              medical_scheme_id: matchedSchemeId,
              clinician_name: record.doctor || undefined,
              collect_at: dayObj?.isValid() ? dayObj : undefined,
            });
            message.success("Data copied from HIS successfully");
          } catch (err: any) {
            message.error("Failed to import data: " + (err.message || ""));
          }
        }}
      />
      <GynePrintPreviewModal
        open={!!saveAndNewData}
        data={saveAndNewData}
        onCancel={() => {
          setSaveAndNewData(null);
          if (pendingResetRef.current) {
            pendingResetRef.current = false;
            form.resetFields();
            form.setFieldsValue({
              collection_site: "Cervical/Endocervical",
              is_postmenopausal: false,
              is_pregnant: false,
              is_out_lab_consult: false,
              is_out_lab: false,
            });
          }
        }}
      />
    </>
  );
};

export default GyneCytoFormModal;

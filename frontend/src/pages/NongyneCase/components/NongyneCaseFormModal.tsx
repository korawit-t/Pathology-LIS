import React, { useEffect, useState, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Row,
  Col,
  Space,
  Popconfirm,
  Upload,
  message,
  Divider,
  Checkbox,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  DeleteOutlined,
  CloseCircleOutlined,
  FireOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import debounce from "lodash/debounce";
import PatientFormModal from "../../../components/PatientFormModal";
import HisPatientSearchModal from "../../SurgicalCase/components/HisPatientSearchModal";
import NongynePrintPreviewModal from "./NongynePrintPreviewModal";
import PatientSearchField from "../../../components/FormParts/PatientSearchField";
import RequestDocumentsUpload from "../../../components/FormParts/RequestDocumentsUpload";
import NongyneCaseFormFields from "./NongyneCaseFormModal.fields";
import type { HisPatientResult } from "../../../services/hisService";
import TitleService from "../../../services/titleService";
import SpecimenTemplateService from "../../../services/specimenTemplateService";
import type { SpecimenTemplate } from "../../../services/specimenTemplateService";

import NongyneCytologyCaseService from "../../../services/nongyneCytoCaseService";
import type { RequestFile } from "../../../types/surgical";
import PatientService from "../../../services/patientService";
import HospitalService from "../../../services/hospitalService";
import DepartmentService from "../../../services/departmentService";
import MedicalSchemeService from "../../../services/medicalSchemeService";
import UserService from "../../../services/userService";
import logger from "../../../utils/logger";
import { NongyneCytologyCase, PatientRef } from "../../../types/nongyne";
import type { Patient } from "../../../types/patient";
import type { Title } from "../../../types/title";
import type { Hospital } from "../../../types/hospital";
import type { Department } from "../../../types/department";
import type { MedicalScheme } from "../../../types/medicalScheme";
import type { User } from "../../../types/user";

const { Option } = Select;

interface NongyneCaseFormModalProps {
  open: boolean;
  editingId: number | null;
  onCancel: () => void;
  onSuccess: (savedData: NongyneCytologyCase | null) => void;
  onRefresh?: () => void;
}

const DEFAULT_SPECIMEN_TYPES: SpecimenTemplate[] = [
  "Fluid",
  "FNA",
  "Urine",
  "Sputum",
  "CSF",
  "Brushing",
  "Washing",
  "Other",
].map((name, index) => ({
  id: 0,
  name,
  category: "nongyne_cyto",
  default_slide_count: 1,
  requires_slide_count: false,
  requires_volume: false,
  sort_order: index,
}));

const NongyneCaseFormModal: React.FC<NongyneCaseFormModalProps> = ({
  open,
  editingId,
  onCancel,
  onSuccess,
  onRefresh,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saveAndNewData, setSaveAndNewData] =
    useState<NongyneCytologyCase | null>(null);
  const pendingResetRef = React.useRef(false);

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  // Master Data States
  const [patients, setPatients] = useState<(Patient | PatientRef)[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemes, setSchemes] = useState<MedicalScheme[]>([]);
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [cytotechnologists, setCytotechnologists] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenTemplate[]>(
    DEFAULT_SPECIMEN_TYPES,
  );

  // State for Modals
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isHisModalOpen, setIsHisModalOpen] = useState(false);

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [
          hospitals,
          departments,
          schemes,
          pathologists,
          cytos,
          titles,
          specimenTypes,
        ] = await Promise.all([
          HospitalService.getHospitals(),
          DepartmentService.getDepartments(true),
          MedicalSchemeService.getSchemes(),
          UserService.getUsers({ role: "pathologist" }),
          UserService.getUsers({ role: "cytotechnologist" }),
          TitleService.getTitles(),
          SpecimenTemplateService.getTemplates("nongyne_cyto"),
        ]);
        setHospitals(hospitals);
        setDepartments(departments);
        setSchemes(schemes);
        setPathologists(pathologists);
        setCytotechnologists(cytos);
        setTitles(titles);
        if (specimenTypes.length) setSpecimenTypes(specimenTypes);
      } catch (err) {
        message.error("Failed to load reference data");
      }
    };

    if (open) {
      fetchMasterData();
      if (editingId) {
        loadEditingData();
      } else {
        form.resetFields();
        setFileList([]);
        form.setFieldsValue({ collect_at: dayjs() });
      }
    }
  }, [open, editingId]);

  const loadEditingData = async () => {
    setLoading(true);
    try {
      const data = await NongyneCytologyCaseService.getById(editingId!);

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

      form.setFieldsValue({
        ...data,
        patient_id: data.patient?.id,
        pathologist_id: data.pathologist?.id || data.pathologist_id,
        cytotechnologist_id:
          data.cytotechnologist?.id || data.cytotechnologist_id,
        hospital_id: data.hospital?.id || data.hospital_id,
        medical_scheme_id: data.medical_scheme_id,
        department_id: data.department_id,

        collect_at: data.collect_at ? dayjs(data.collect_at) : null,
        registered_at: data.registered_at ? dayjs(data.registered_at) : null,
      });
    } catch (err) {
      message.error("Failed to load case data");
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearchPatient = useMemo(
    () =>
      debounce(async (value: string) => {
        if (!value || value.trim().length < 3) {
          setPatients([]);
          return;
        }
        setIsSearching(true);
        try {
          const patients = await PatientService.getPatients(value);
          setPatients(patients);
        } catch (err) {
          logger.error("Search Patient Error:", err);
          setPatients([]);
        } finally {
          setIsSearching(false);
        }
      }, 500),
    [],
  );

  const handlePatientCreationSuccess = (newPatient: Patient) => {
    setPatients((prev) => [newPatient, ...prev]);
    form.setFieldsValue({
      patient_id: newPatient.id,
    });
    message.success(
      `Patient ${newPatient.name}${newPatient.ln ? " " + newPatient.ln : ""} selected`,
    );
    setIsPatientModalOpen(false);
  };

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
      const response = await NongyneCytologyCaseService.downloadRequestFileBlob(
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
          await NongyneCytologyCaseService.downloadRequestFile(
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
          await NongyneCytologyCaseService.deleteRequestFile(Number(file.uid));
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
      const res = await NongyneCytologyCaseService.uploadRequestFile(
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

  // For specimen types configured with requires_slide_count /
  // requires_volume, warn (but don't block) when the corresponding field was
  // left blank — resolves true if it's fine to proceed, false if the user
  // backed out to go fill it in.
  const confirmRegistrationWarnings = (values: any): Promise<boolean> => {
    if (editingId) return Promise.resolve(true);
    const match = specimenTypes.find((s) => s.name === values.specimen_type);
    if (!match) return Promise.resolve(true);

    const missing: string[] = [];
    if (match.requires_slide_count && !values.num_slides) {
      missing.push("Number of Slides");
    }
    if (match.requires_volume && !values.received_volume_ml) {
      missing.push("Received Volume (ml)");
    }
    if (missing.length === 0) return Promise.resolve(true);

    return new Promise((resolve) => {
      Modal.confirm({
        title: "Some Fields Not Specified",
        content: `"${values.specimen_type}" usually needs: ${missing.join(", ")}. Continue with the default anyway?`,
        okText: "Continue",
        cancelText: "Go Back",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const handleSubmit = async (values: any) => {
    if (!(await confirmRegistrationWarnings(values))) return;
    setLoading(true);
    try {
      const formattedValues = {
        ...values,
        collect_at: values.collect_at ? values.collect_at.toISOString() : null,
      };

      let savedResult;
      if (editingId) {
        savedResult = await NongyneCytologyCaseService.update(
          editingId,
          formattedValues,
        );
        message.success("Case updated successfully");
      } else {
        savedResult = await NongyneCytologyCaseService.create(formattedValues);
        message.success("Case registered successfully");
      }

      onSuccess(savedResult ?? null);
    } catch (err: any) {
      logger.error("Backend Error:", err.response?.data?.detail);
      message.error(
        "Save failed: " +
          (err.response?.data?.detail || "An unexpected error occurred"),
      );
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
    if (!(await confirmRegistrationWarnings(values))) return;
    setLoading(true);
    try {
      const formattedValues = {
        ...values,
        collect_at: values.collect_at ? values.collect_at.toISOString() : null,
      };
      const saved = await NongyneCytologyCaseService.create(formattedValues);
      message.success(`ลงทะเบียนสำเร็จ (${saved.accession_no})`);
      onRefresh?.();
      setFileList([]);
      pendingResetRef.current = true;
      setSaveAndNewData(saved);
    } catch (err: any) {
      message.error(
        "Save failed: " +
          (err.response?.data?.detail || "An unexpected error occurred"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      await NongyneCytologyCaseService.delete(editingId);
      message.success("Case deleted successfully");
      onSuccess(null);
    } catch (err) {
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
          await NongyneCytologyCaseService.cancel(editingId!, cancelReason);

          message.success("Case cancelled successfully");
          onSuccess(null);
        } catch (error: any) {
          const errorMsg =
            error.response?.data?.detail || "Failed to cancel case";
          message.error(errorMsg);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <>
      <Modal
        title={
          editingId ? "Edit Non-Gyne Cyto Case" : "Register Non-Gyne Cyto Case"
        }
        open={open}
        onCancel={onCancel}
        footer={null}
        width={1000}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            specimen_type: "Fluid",
          }}
        >
          {/* Patient Search + Hospital row */}
          <Row gutter={16}>
            <Col span={12}>
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
            {editingId && (
              <Col span={4}>
                <Form.Item name="accession_no" label="Accession No.">
                  <Input
                    disabled
                    style={{ fontWeight: "bold", color: "black" }}
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={editingId ? 8 : 10}>
              <Form.Item
                name="hospital_id"
                label="Hospital"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select Hospital">
                  {hospitals.map((h) => (
                    <Option key={h.id} value={h.id}>
                      {h.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* All other form fields */}
          <NongyneCaseFormFields
            hospitals={hospitals}
            departments={departments}
            schemes={schemes}
            staffs={{ pathologists, cytotechnologists, specimenTypes }}
            editingId={editingId}
          />

          {/* Request Documents Upload */}
          <Divider style={{ margin: "8px 0" }} />
          <Row gutter={16} align="middle">
            <Col span={18}>
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
            <Col span={6} style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              <Form.Item name="is_express" valuePropName="checked" initialValue={false} style={{ margin: 0 }}>
                <Checkbox>
                  <span style={{ background: "#fff1f0", border: "1px solid #ffa39e", borderRadius: 6, padding: "4px 10px", color: "#cf1322", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                    <FireOutlined style={{ marginRight: 4 }} /> Express
                  </span>
                </Checkbox>
              </Form.Item>
              <Form.Item name="is_rose" valuePropName="checked" initialValue={false} style={{ margin: 0 }}>
                <Checkbox>
                  <span style={{ background: "#f9f0ff", border: "1px solid #d3adf7", borderRadius: 6, padding: "4px 10px", color: "#531dab", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                    🔬 ROSE
                  </span>
                </Checkbox>
              </Form.Item>
            </Col>
          </Row>

          <div
            style={{
              marginTop: 32,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button onClick={onCancel} size="large">
                Close
              </Button>
              {editingId && (
                <>
                  {form.getFieldValue("status") === "registered" ? (
                    <Popconfirm
                      title="Confirm delete this case?"
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
            </div>
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
        onSuccess={handlePatientCreationSuccess}
        titles={titles}
        hospitals={hospitals}
      />

      <HisPatientSearchModal
        open={isHisModalOpen}
        onCancel={() => setIsHisModalOpen(false)}
        caseType="nongyne"
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
            if (!patient) {
              let gender: string | undefined;
              if (record.gender_code === 1) gender = "Male";
              else if (record.gender_code === 2) gender = "Female";

              const matchedTitle = titles.find(
                (t) => record.pname && t.title === record.pname,
              );
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
                `New patient created: ${firstName} ${lastName}`.trim(),
              );
            }

            setPatients((prev) => {
              const exists = prev.find((p) => p.id === patient.id);
              return exists ? prev : [patient, ...prev];
            });

            const matchedHospitalId = hospitals[0]?.id;

            let matchedDepartmentId: number | undefined;
            if (record.department?.trim()) {
              const existing = departments.find((d) => {
                const dn = d.name?.toLowerCase().trim() ?? "";
                const rn = record.department!.toLowerCase().trim();
                return dn === rn || dn.includes(rn) || rn.includes(dn);
              });
              if (existing) {
                matchedDepartmentId = existing.id;
              } else {
                const created = await DepartmentService.createDepartment({
                  name: record.department.trim(),
                  is_active: true,
                });
                matchedDepartmentId = created.id;
                setDepartments((prev) => [...prev, created]);
                message.info(`New department added: ${created.name}`);
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
                  message.info(`เพิ่มสิทธิ์การรักษาใหม่: ${created.name}`);
                } catch {
                  /* ไม่มีสิทธิ์สร้าง */
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
              lab_number: record.lab_order_number || undefined,
            });
            message.success("HIS data imported successfully");
          } catch (err: any) {
            message.error("Failed to import HIS data: " + (err.message || ""));
          }
        }}
      />
      <NongynePrintPreviewModal
        open={!!saveAndNewData}
        data={saveAndNewData}
        onCancel={() => {
          setSaveAndNewData(null);
          if (pendingResetRef.current) {
            pendingResetRef.current = false;
            form.resetFields();
          }
        }}
      />
    </>
  );
};

export default NongyneCaseFormModal;

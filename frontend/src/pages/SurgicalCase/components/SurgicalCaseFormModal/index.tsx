import React, { useEffect, useState, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Row,
  Col,
  Popconfirm,
  message,
  Upload,
  Space,
  Divider,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  PrinterOutlined,
  DeleteOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import debounce from "lodash/debounce";
import PatientFormModal from "../../../../components/PatientFormModal";
import HisPatientSearchModal from "../HisPatientSearchModal";
import type { HisPatientResult } from "../../../../services/hisService";
import TitleService from "../../../../services/titleService";
import PatientSearchField from "../../../../components/FormParts/PatientSearchField";
import RequestDocumentsUpload from "../../../../components/FormParts/RequestDocumentsUpload";
import SurgicalCaseFormFields from "./SurgicalCaseFormFields";
// Services
import SurgicalCaseService from "../../../../services/surgicalCaseService";
import PatientService from "../../../../services/patientService";
import HospitalService from "../../../../services/hospitalService";
import DepartmentService from "../../../../services/departmentService";
import MedicalSchemeService from "../../../../services/medicalSchemeService";
import UserService from "../../../../services/userService";

// Constants & Types
import {
  SurgicalCase,
  RequestFile,
  SurgicalCaseCreatePayload,
} from "../../../../types/surgical";
import type { Patient } from "../../../../types/patient";
import type { Hospital } from "../../../../types/hospital";
import type { Title } from "../../../../types/title";
import type { Department } from "../../../../types/department";
import type { MedicalScheme } from "../../../../types/medicalScheme";
import type { User } from "../../../../types/user";
import PrintPreviewModal from "../PrintPreviewModal";
import logger from "../../../../utils/logger";

const { Option } = Select;


interface SurgicalCaseFormModalProps {
  open: boolean;
  editingId: number | null;
  onCancel: () => void;
  onSuccess: (savedData: SurgicalCase | null) => void;
  onRefresh?: () => void;
}

const SurgicalCaseFormModal: React.FC<SurgicalCaseFormModalProps> = ({
  open,
  editingId,
  onCancel,
  onSuccess,
  onRefresh,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const pendingResetRef = React.useRef(false);

  // Master Data States
  const [patients, setPatients] = useState<Patient[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemes, setSchemes] = useState<MedicalScheme[]>([]);
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // State ควบคุม Modal Patient
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isHisModalOpen, setIsHisModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [caseData, setCaseData] = useState<SurgicalCase | null>(null);

  // File Upload States
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");

  // 1. Fetch Master Data เมื่อเปิด Modal ครั้งแรก
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [hospitals, departments, schemes, pathologists, titles] =
          await Promise.all([
            HospitalService.getHospitals(),
            DepartmentService.getDepartments(true),
            MedicalSchemeService.getSchemes(),
            UserService.getUsers({ role: "pathologist" }),
            TitleService.getTitles(),
          ]);
        setHospitals(hospitals);
        setDepartments(departments);
        setSchemes(schemes);
        setPathologists(pathologists);
        setTitles(titles);
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
        setCaseData(null);
        form.setFieldsValue({
          is_express: false,
          is_frozen_section: false,
          is_extended_fix: false,
          is_formalin_fixed: false,
          is_grossed: false,
          is_processed: false,
          is_slide_prepped: false,
          is_reported: false,
          collect_at: dayjs(),
        });
      }
    }
  }, [open, editingId]);

  // 2. Load ข้อมูลกรณีแก้ไข
  const loadEditingData = async () => {
    setLoading(true);
    try {
      const data = await SurgicalCaseService.getCaseById(editingId!);
      setCaseData(data);

      if (data.patient) setPatients([data.patient as Patient]);

      if (data.request_files) {
        setFileList(
          data.request_files.map((file: RequestFile) => ({
            uid: String(file.id),
            name: file.file_name,
            status: "done",
            url: file.file_path, // Could be used if serving directly via URL
            type: file.file_type,
          })),
        );
      } else {
        setFileList([]);
      }

      // 🌟 ปรับปรุงการ Mapping ข้อมูลก่อนเข้า Form
      form.setFieldsValue({
        ...data,
        // ดึง ID จาก Object ออกมาใส่ในฟิลด์ที่ Form.Item name กำหนดไว้
        pathologist_id: data.pathologist?.id || data.pathologist_id,
        hospital_id: data.hospital?.id || data.hospital_id,
        medical_scheme_id: data.medical_scheme?.id || data.medical_scheme_id,
        department_id: data.department?.id || data.department_id,

        collect_at: data.collect_at ? dayjs(data.collect_at) : null,
        registered_at: data.registered_at ? dayjs(data.registered_at) : null,
      });
    } catch (err) {
      message.error("Failed to load case data");
    } finally {
      setLoading(false);
    }
  };

  // 3. Search Patient Logic
  const debouncedSearchPatient = useMemo(
    () =>
      debounce(async (value: string) => {
        if (!value || value.trim().length < 3) {
          setPatients([]); // ล้างข้อมูลเมื่อคำค้นหาสั้นเกินไป
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
    // 1. เพิ่มคนไข้ใหม่เข้าไปใน List เพื่อให้ Select หาเจอ
    setPatients((prev) => [newPatient, ...prev]);

    // 2. ตั้งค่าให้ Form เลือกคนใหม่นี้ทันที
    form.setFieldsValue({
      patient_id: newPatient.id,
    });

    message.success(
      `Patient ${newPatient.name}${newPatient.ln ? " " + newPatient.ln : ""} selected`,
    );
    setIsPatientModalOpen(false);
  };

  // Handle patient selection from HIS modal
  const handleHisPatientSelect = async (record: HisPatientResult) => {
    setIsHisModalOpen(false);
    try {
      // Map HOSxP gender code: 1=ชาย(male), 2=หญิง(female)
      let gender: string | undefined;
      if (record.gender_code === 1) gender = "Male";
      else if (record.gender_code === 2) gender = "Female";

      // HIS sends fname (first name) and lname (last name) separately
      const firstName = record.fname?.trim() || "";
      const lastName = record.lname?.trim() || "";
      let patient: Patient | null = null;

      // 1. Find by CID (most reliable)
      if (record.cid && record.cid.trim()) {
        const existingPatients = await PatientService.getPatients(record.cid);
        patient = existingPatients.find((p) => p.cid === record.cid);
      }

      // 2. Find by first name + last name match
      if (!patient && firstName) {
        const existingPatients = await PatientService.getPatients(firstName);
        patient = existingPatients.find(
          (p) => p.name === firstName && (p.ln || "") === lastName,
        );
      }

      const pnameClean = (record.pname || "").trim();
      let matchedTitle = pnameClean
        ? titles.find((t) => (t.title || "").trim() === pnameClean)
        : undefined;

      if (pnameClean && !matchedTitle) {
        try {
          const created = await TitleService.createTitle({ title: pnameClean });
          matchedTitle = created;
          setTitles((prev) => [...prev, created]);
          message.info(`เพิ่มคำนำหน้าใหม่: ${created.title}`);
        } catch {
          /* ไม่มีสิทธิ์สร้าง — ปล่อยผ่าน */
        }
      }

      // 3. Create new patient with split name fields
      if (!patient) {
        patient = await PatientService.createPatient({
          title_id: matchedTitle?.id || undefined,
          name: firstName,
          ln: lastName || undefined,
          gender: gender,
          cid: record.cid || undefined,
          birth_date: record.birthday
            ? record.birthday.split(" ")[0]
            : undefined,
        });
        message.success(`New patient created: ${firstName} ${lastName}`.trim());
      } else if (!patient.title_id && matchedTitle) {
        // Backfill title for existing patient registered without one
        await PatientService.updatePatient(patient.id, {
          title_id: matchedTitle.id,
        });
        patient = { ...patient, title_id: matchedTitle.id };
      }

      // Set patient in the list so the Select can find it
      setPatients((prev) => {
        const exists = prev.find((p) => p.id === patient.id);
        return exists ? prev : [patient, ...prev];
      });

      // Parse order_date for collect_at
      const collectAt = record.order_date
        ? dayjs(record.order_date)
        : undefined;

      // Auto-match or create medical scheme from HIS pttype text
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

      // Match hospital — HIS is connected to one institution so default to first
      const matchedHospitalId = hospitals[0]?.id;

      // Match department by name (bidirectional substring + trim to handle whitespace from HIS)
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
          try {
            const created = await DepartmentService.createDepartment({
              name: record.department.trim(),
              is_active: true,
            });
            matchedDepartmentId = created.id;
            setDepartments((prev) => [...prev, created]);
            message.info(`New department added: ${created.name}`);
          } catch {
            // No permission to create department — leave field blank
          }
        }
      }

      // Auto-fill form fields
      form.setFieldsValue({
        patient_id: patient.id,
        hn: record.hn || undefined,
        vn: record.vn || undefined,
        an: record.an || undefined,
        hospital_id: matchedHospitalId,
        department_id: matchedDepartmentId,
        clinician_name: record.doctor || undefined,
        collect_at: collectAt?.isValid() ? collectAt : undefined,
        lab_number: record.lab_order_number || undefined,
        medical_scheme_id: matchedSchemeId,
      });

      message.success("HIS data imported successfully");
    } catch (err: any) {
      logger.error("HIS patient select error:", err);
      message.error(
        "Failed to import HIS data: " +
          (err.response?.data?.detail || err.message || "Unknown error"),
      );
    }
  };

  // 4. HN Auto-fill Logic
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

  const handleSubmit = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      // 1. เตรียมข้อมูล Payload ก่อน (ต้องทำก่อนเรียก Service)
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const registerId = currentUser.id;
      const formattedValues = {
        ...values,
        registrar_id: registerId || 1,
        ...(!editingId && {
          status: values.is_extended_fix ? "formalin_fixing" : "registered",
        }),
        // ป้องกัน undefined สำหรับ boolean
        is_formalin_fixed: !!values.is_formalin_fixed,
        is_extended_fix: !!values.is_extended_fix,
        is_express: !!values.is_express,
        is_frozen_section: !!values.is_frozen_section,
        is_grossed: !!values.is_grossed,
        is_processed: !!values.is_processed,
        is_slide_prepped: !!values.is_slide_prepped,
        is_reported: !!values.is_reported,

        collect_at: values.collect_at
          ? (values.collect_at as Dayjs).toISOString()
          : null,
      };

      let savedResult;
      if (editingId) {
        savedResult = await SurgicalCaseService.updateCase(
          editingId,
          formattedValues,
        );
        message.success("Case updated successfully");
      } else {
        savedResult = await SurgicalCaseService.createCase(
          formattedValues as unknown as SurgicalCaseCreatePayload,
        );

        // Upload any queued files now that we have a case ID
        const pendingFiles = fileList.filter((f) => f.originFileObj);
        if (pendingFiles.length > 0) {
          const newCaseId = savedResult.id;
          await Promise.allSettled(
            pendingFiles.map((pf) =>
              SurgicalCaseService.uploadRequestFile(
                newCaseId,
                pf.originFileObj as File,
              ).catch(() => {
                message.warning(
                  `Failed to upload "${pf.name}". Please retry in edit mode.`,
                );
              }),
            ),
          );
        }

        message.success("Case registered successfully");
      }

      // 3. ส่งข้อมูลที่ได้จาก Backend (ซึ่งมี ID และ Accession No) กลับไปที่หน้า Manager
      // เนื่องจาก SurgicalCaseService ของคุณ return res.data มาให้แล้ว
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
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setLoading(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const formattedValues = {
        ...values,
        registrar_id: currentUser.id || 1,
        status: values.is_extended_fix ? "formalin_fixing" : "registered",
        is_formalin_fixed: !!values.is_formalin_fixed,
        is_extended_fix: !!values.is_extended_fix,
        is_express: !!values.is_express,
        is_frozen_section: !!values.is_frozen_section,
        is_grossed: false,
        is_processed: false,
        is_slide_prepped: false,
        is_reported: false,
        collect_at: values.collect_at
          ? (values.collect_at as any).toISOString()
          : null,
      };
      const saved = await SurgicalCaseService.createCase(
        formattedValues as unknown as SurgicalCaseCreatePayload,
      );
      const pendingFiles = fileList.filter((f) => f.originFileObj);
      if (pendingFiles.length > 0) {
        await Promise.allSettled(
          pendingFiles.map((pf) =>
            SurgicalCaseService.uploadRequestFile(
              saved.id,
              pf.originFileObj as File,
            ).catch(() => {
              message.warning(`Failed to upload "${pf.name}"`);
            }),
          ),
        );
      }
      message.success(`ลงทะเบียนสำเร็จ (${saved.accession_no})`);
      onRefresh?.();
      setCaseData(saved);
      setFileList([]);
      pendingResetRef.current = true;
      setIsPrintModalOpen(true);
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
      await SurgicalCaseService.deleteCase(editingId);
      message.success("Case deleted successfully");

      // 🌟 ส่ง null กลับไปเพื่อบอกหน้าหลักว่า "เคสนี้ไม่มีตัวตนแล้ว"
      onSuccess(null);
    } catch (err) {
      message.error("Failed to delete case");
    } finally {
      setLoading(false);
    }
  };

  // --- Preview Request File ---
  const handlePreviewFile = async (file: UploadFile) => {
    // Pending file (not uploaded yet) — preview from local object
    if (file.originFileObj) {
      const url = URL.createObjectURL(file.originFileObj as File);
      setPreviewImage(url);
      setPreviewTitle(file.name);
      setPreviewOpen(true);
      return;
    }
    if (file.uid.startsWith("rc-upload")) return;
    try {
      const response = await SurgicalCaseService.downloadRequestFileBlob(
        Number(file.uid),
      );
      const blob = new Blob([response], {
        type: file.type || "application/octet-stream",
      });
      const url = window.URL.createObjectURL(blob);
      setPreviewImage(url);
      setPreviewTitle(file.name);
      setPreviewOpen(true);
    } catch (err) {
      message.error("Failed to open file");
    }
  };

  // --- Confirm Download ---
  const handleConfirmDownload = (file: UploadFile) => {
    Modal.confirm({
      title: "Download File",
      icon: <DownloadOutlined style={{ color: "#1890ff" }} />,
      content: `Download "${file.name}"?`,
      okText: "Download",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await SurgicalCaseService.downloadRequestFile(
            Number(file.uid),
            file.name,
          );
          message.success("File downloaded successfully");
        } catch (err) {
          message.error("Failed to download file");
        }
      },
    });
  };

  // --- Confirm Delete ---
  const handleConfirmDeleteFile = (file: UploadFile) => {
    if (file.uid.startsWith("rc-upload") || file.uid.startsWith("pending-")) {
      setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
      return;
    }
    Modal.confirm({
      title: "Delete File",
      icon: <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />,
      content: `Delete "${file.name}"? This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await SurgicalCaseService.deleteRequestFile(Number(file.uid));
          message.success("File deleted");
          setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
        } catch (error) {
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
      const res = await SurgicalCaseService.uploadRequestFile(
        editingId,
        file as File,
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
        // Queue locally — will upload after case is created
        setFileList((prev) => [
          ...prev,
          {
            uid: `pending-${Date.now()}-${Math.random()}`,
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

  const handleCancel = () => {
    let cancelReason = "";

    Modal.confirm({
      title: "Cancel this case?",
      icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
      content: (
        <div style={{ marginTop: 16 }}>
          <p>Per ISO 15189, please provide a reason for cancellation:</p>
          <Input.TextArea
            rows={3}
            placeholder="e.g. Wrong HN entered, hospital change, other..."
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
          await SurgicalCaseService.cancelCase(editingId!, {
            reason: cancelReason,
          });

          message.success("Case cancelled and logged");

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
        title={editingId ? "Edit Specimen Case" : "Register New Specimen"}
        open={open}
        onCancel={onCancel}
        footer={null}
        width={1000}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={(changedValues) => {
            // 🚩 ตรวจสอบเมื่อมีการเปลี่ยนค่า is_extended_fix
            if (!editingId && changedValues.hasOwnProperty("is_extended_fix")) {
              const isChecked = changedValues.is_extended_fix;
              if (!form.getFieldValue("is_grossed")) {
                form.setFieldsValue({
                  status: isChecked ? "formalin_fixing" : "registered",
                });
              }
            }
          }}
        >
          {/* 🚩 เพิ่มฟิลด์ hidden เพื่อให้ค่าส่งไปกับ handleSubmit */}
          <Form.Item name="status" hidden>
            <Input />
          </Form.Item>

          {/* --- 1. Patient Search + Hospital Row --- */}
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

          {/* --- 2. Form Fields (HN/VN/AN, Lab/Clinician/Dept/Path, Date/Express/Fixation) --- */}
          <SurgicalCaseFormFields
            hospitals={hospitals}
            departments={departments}
            schemes={schemes}
            pathologists={pathologists}
            editingId={editingId}
            form={form}
          />

          {/* --- 3. Request Documents Upload --- */}
          <Divider style={{ margin: "8px 0" }} />
          <RequestDocumentsUpload
            uploadProps={uploadProps}
            fileList={fileList}
            isUploading={isUploading}
            editingId={editingId}
            onPreview={handlePreviewFile}
            onDownload={handleConfirmDownload}
            onDelete={handleConfirmDeleteFile}
          />

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
                  {/* 1. ถ้ายังเป็น Registered ให้แสดงปุ่ม "ลบ" (Hard Delete) */}
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
                    /* 2. ถ้าสถานะอื่น (ทำงานไปแล้ว) ให้แสดงปุ่ม "ยกเลิกเคส" (Soft Delete/Cancel) */
                    <Popconfirm
                      title="Cancel this case?"
                      description="The case status will be changed to Cancelled for record keeping."
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
              {editingId && caseData && (
                <Button
                  icon={<PrinterOutlined />}
                  size="large"
                  onClick={() => setIsPrintModalOpen(true)}
                >
                  Print Label
                </Button>
              )}
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

      {/* 🌟 Preview Modal สำหรับดูไฟล์ Request */}
      <Modal
        open={previewOpen}
        title={previewTitle}
        footer={null}
        onCancel={() => {
          setPreviewOpen(false);
          // Revoke blob URL to free memory
          if (previewImage) window.URL.revokeObjectURL(previewImage);
          setPreviewImage("");
        }}
        width={800}
        centered
      >
        {previewTitle?.toLowerCase().endsWith(".pdf") ? (
          <iframe
            src={previewImage}
            title={previewTitle}
            style={{ width: "100%", height: "70vh", border: "none" }}
          />
        ) : (
          <img
            alt={previewTitle}
            style={{ width: "100%" }}
            src={previewImage}
          />
        )}
      </Modal>

      {/* 🌟 เพิ่ม PatientFormModal ตรงนี้ */}
      <PatientFormModal
        open={isPatientModalOpen}
        onClose={() => setIsPatientModalOpen(false)}
        onSuccess={handlePatientCreationSuccess}
        titles={titles}
        hospitals={hospitals}
        schemes={schemes}
      />

      {/* 🌟 HIS Patient Search Modal */}
      <HisPatientSearchModal
        open={isHisModalOpen}
        onCancel={() => setIsHisModalOpen(false)}
        onSelect={handleHisPatientSelect}
      />

      <PrintPreviewModal
        open={isPrintModalOpen}
        surgicalCase={caseData}
        onCancel={() => {
          setIsPrintModalOpen(false);
          if (pendingResetRef.current) {
            pendingResetRef.current = false;
            setCaseData(null);
            form.resetFields();
            form.setFieldsValue({
              is_express: false,
              is_extended_fix: false,
              is_formalin_fixed: false,
              is_grossed: false,
              is_processed: false,
              is_slide_prepped: false,
              is_reported: false,
            });
          }
        }}
      />
    </>
  );
};
export default SurgicalCaseFormModal;

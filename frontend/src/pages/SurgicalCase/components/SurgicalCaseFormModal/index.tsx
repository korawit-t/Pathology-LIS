import React, { useEffect, useState } from "react";
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
  Space,
  Divider,
} from "antd";
import type { UploadFile } from "antd";
import {
  PrinterOutlined,
  DeleteOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { usePatientSearch } from "../../../../hooks/usePatientSearch";
import { useCaseFileUpload } from "../../../../hooks/useCaseFileUpload";
import { useCaseLifecycleActions } from "../../../../hooks/useCaseLifecycleActions";
import { loadMasterData } from "../../../../utils/caseMasterData";
import { importHisPatient } from "../../../../utils/hisPatientImport";
import PatientFormModal from "../../../../components/PatientFormModal";
import HisPatientSearchModal from "../HisPatientSearchModal";
import type { HisPatientResult } from "../../../../services/hisService";
import TitleService from "../../../../services/titleService";
import PatientSearchField from "../../../../components/FormParts/PatientSearchField";
import RequestDocumentsUpload from "../../../../components/FormParts/RequestDocumentsUpload";
import SurgicalCaseFormFields from "./SurgicalCaseFormFields";
// Services
import SurgicalCaseService from "../../../../services/surgicalCaseService";
import HospitalService from "../../../../services/hospitalService";
import DepartmentService from "../../../../services/departmentService";
import MedicalSchemeService from "../../../../services/medicalSchemeService";
import UserService from "../../../../services/userService";

// Constants & Types
import {
  SurgicalCase,
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
import type { CaseFormModalProps } from "../../../../types/caseFormModal";

const { Option } = Select;

type SurgicalCaseFormModalProps = CaseFormModalProps<SurgicalCase>;

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
  const [titles, setTitles] = useState<Title[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemes, setSchemes] = useState<MedicalScheme[]>([]);
  const [pathologists, setPathologists] = useState<User[]>([]);
  const {
    patients,
    setPatients,
    isSearching,
    debouncedSearchPatient,
    handleSelectSpecificHN,
    handlePatientCreationSuccess,
  } = usePatientSearch(form, hospitals);

  // State ควบคุม Modal Patient
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isHisModalOpen, setIsHisModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [caseData, setCaseData] = useState<SurgicalCase | null>(null);

  // File Upload
  const {
    fileList,
    setFileList,
    isUploading,
    uploadProps,
    handleConfirmDownload,
    handleConfirmDeleteFile,
    flushPendingUploads,
    toUploadFileList,
  } = useCaseFileUpload(SurgicalCaseService, editingId);
  const { handleDelete, handleCancel } = useCaseLifecycleActions(
    editingId,
    SurgicalCaseService.deleteCase,
    (id, reason) => SurgicalCaseService.cancelCase(id, { reason }),
    {
      title: "Cancel this case?",
      prompt: "Per ISO 15189, please provide a reason for cancellation:",
      placeholder: "e.g. Wrong HN entered, hospital change, other...",
    },
    onSuccess,
    setLoading,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");

  // 1. Fetch Master Data เมื่อเปิด Modal ครั้งแรก
  useEffect(() => {
    const fetchMasterData = async () => {
      const result = await loadMasterData(() =>
        Promise.all([
          HospitalService.getHospitals(),
          DepartmentService.getDepartments(true),
          MedicalSchemeService.getSchemes(),
          UserService.getUsers({ role: "pathologist" }),
          TitleService.getTitles(),
        ]),
      );
      if (!result) return;
      const [hospitals, departments, schemes, pathologists, titles] = result;
      setHospitals(hospitals);
      setDepartments(departments);
      setSchemes(schemes);
      setPathologists(pathologists);
      setTitles(titles);
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

      setFileList(toUploadFileList(data.request_files));

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

  // Handle patient selection from HIS modal
  const handleHisPatientSelect = async (record: HisPatientResult) => {
    setIsHisModalOpen(false);
    try {
      const { patient, matchedHospitalId, matchedDepartmentId, matchedSchemeId, collectAt } =
        await importHisPatient(record, {
          titles,
          schemes,
          departments,
          hospitals,
          setTitles,
          setSchemes,
          setDepartments,
          setPatients,
          backfillExistingPatientTitle: true,
        });

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
    } catch (err: unknown) {
      logger.error("HIS patient select error:", err);
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      message.error(
        "Failed to import HIS data: " +
          (axiosErr.response?.data?.detail || axiosErr.message || "Unknown error"),
      );
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
        await flushPendingUploads(savedResult.id);

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
          ? (values.collect_at as Dayjs).toISOString()
          : null,
      };
      const saved = await SurgicalCaseService.createCase(
        formattedValues as unknown as SurgicalCaseCreatePayload,
      );
      await flushPendingUploads(saved.id);
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

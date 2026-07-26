import React, { useEffect, useState } from "react";
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
  message,
  Divider,
  Checkbox,
} from "antd";
import type { UploadFile } from "antd";
import {
  DeleteOutlined,
  CloseCircleOutlined,
  FireOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { usePatientSearch } from "../../../hooks/usePatientSearch";
import { useCaseFileUpload } from "../../../hooks/useCaseFileUpload";
import { useCaseLifecycleActions } from "../../../hooks/useCaseLifecycleActions";
import { loadMasterData } from "../../../utils/caseMasterData";
import { importHisPatient } from "../../../utils/hisPatientImport";
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
import HospitalService from "../../../services/hospitalService";
import DepartmentService from "../../../services/departmentService";
import MedicalSchemeService from "../../../services/medicalSchemeService";
import UserService from "../../../services/userService";
import logger from "../../../utils/logger";
import { NongyneCytologyCase, NongyneCytologyCaseCreate, PatientRef } from "../../../types/nongyne";
import type { Title } from "../../../types/title";
import type { Hospital } from "../../../types/hospital";
import type { Department } from "../../../types/department";
import type { MedicalScheme } from "../../../types/medicalScheme";
import type { User } from "../../../types/user";
import type { CaseFormModalProps } from "../../../types/caseFormModal";

const { Option } = Select;

type NongyneCaseFormModalProps = CaseFormModalProps<NongyneCytologyCase>;

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

  const {
    fileList,
    setFileList,
    isUploading,
    uploadProps,
    handleConfirmDownload,
    handleConfirmDeleteFile,
    flushPendingUploads,
    toUploadFileList,
  } = useCaseFileUpload(NongyneCytologyCaseService, editingId);
  const { handleDelete, handleCancel } = useCaseLifecycleActions(
    editingId,
    NongyneCytologyCaseService.delete,
    NongyneCytologyCaseService.cancel,
    {
      title: "Confirm case cancellation?",
      prompt: "Please provide a reason for cancellation:",
      placeholder: "e.g. Wrong HN, Changed hospital, Other...",
    },
    onSuccess,
    setLoading,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  // Master Data States
  const [titles, setTitles] = useState<Title[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemes, setSchemes] = useState<MedicalScheme[]>([]);
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [cytotechnologists, setCytotechnologists] = useState<User[]>([]);
  const {
    patients,
    setPatients,
    isSearching,
    debouncedSearchPatient,
    handleSelectSpecificHN,
    handlePatientCreationSuccess,
  } = usePatientSearch<PatientRef>(form, hospitals);
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenTemplate[]>(
    DEFAULT_SPECIMEN_TYPES,
  );

  // State for Modals
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isHisModalOpen, setIsHisModalOpen] = useState(false);

  useEffect(() => {
    const fetchMasterData = async () => {
      const result = await loadMasterData(() =>
        Promise.all([
          HospitalService.getHospitals(),
          DepartmentService.getDepartments(true),
          MedicalSchemeService.getSchemes(),
          UserService.getUsers({ role: "pathologist" }),
          UserService.getUsers({ role: "cytotechnologist" }),
          TitleService.getTitles(),
          SpecimenTemplateService.getTemplates("nongyne_cyto"),
        ]),
      );
      if (!result) return;
      const [hospitals, departments, schemes, pathologists, cytos, titles, specimenTypes] = result;
      setHospitals(hospitals);
      setDepartments(departments);
      setSchemes(schemes);
      setPathologists(pathologists);
      setCytotechnologists(cytos);
      setTitles(titles);
      if (specimenTypes.length) setSpecimenTypes(specimenTypes);
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
      setFileList(toUploadFileList(data.request_files));

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

  // For specimen types configured with requires_slide_count /
  // requires_volume, warn (but don't block) when the corresponding field was
  // left blank — resolves true if it's fine to proceed, false if the user
  // backed out to go fill it in.
  const confirmRegistrationWarnings = (
    values: Record<string, unknown>,
  ): Promise<boolean> => {
    if (editingId) return Promise.resolve(true);
    const specimenType = values.specimen_type as string | undefined;
    const match = specimenTypes.find((s) => s.name === specimenType);
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
        content: `"${specimenType}" usually needs: ${missing.join(", ")}. Continue with the default anyway?`,
        okText: "Continue",
        cancelText: "Go Back",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!(await confirmRegistrationWarnings(values))) return;
    setLoading(true);
    try {
      const formattedValues = {
        ...values,
        collect_at: values.collect_at
          ? (values.collect_at as Dayjs).toISOString()
          : null,
      };

      let savedResult;
      if (editingId) {
        savedResult = await NongyneCytologyCaseService.update(
          editingId,
          formattedValues,
        );
        message.success("Case updated successfully");
      } else {
        savedResult = await NongyneCytologyCaseService.create(
          formattedValues as unknown as NongyneCytologyCaseCreate,
        );
        // Upload any queued files now that we have a case ID
        await flushPendingUploads(savedResult.id);
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
    let values: Record<string, unknown>;
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
        collect_at: values.collect_at
          ? (values.collect_at as Dayjs).toISOString()
          : null,
      };
      const saved = await NongyneCytologyCaseService.create(
        formattedValues as unknown as NongyneCytologyCaseCreate,
      );
      await flushPendingUploads(saved.id);
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
            const { patient, matchedHospitalId, matchedDepartmentId, matchedSchemeId, collectAt } =
              await importHisPatient<PatientRef>(record, {
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

            form.setFieldsValue({
              patient_id: patient.id,
              hn: record.hn || undefined,
              hospital_id: matchedHospitalId,
              department_id: matchedDepartmentId,
              medical_scheme_id: matchedSchemeId,
              clinician_name: record.doctor || undefined,
              collect_at: collectAt?.isValid() ? collectAt : undefined,
              lab_number: record.lab_order_number || undefined,
            });
            message.success("HIS data imported successfully");
          } catch (err: unknown) {
            logger.error("HIS patient select error:", err);
            const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
            message.error(
              "Failed to import HIS data: " +
                (axiosErr.response?.data?.detail || axiosErr.message || ""),
            );
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

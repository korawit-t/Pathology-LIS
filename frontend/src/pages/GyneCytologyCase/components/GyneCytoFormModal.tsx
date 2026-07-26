import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Button,
  Row,
  Col,
  Checkbox,
  Space,
  Select,
  message,
  Popconfirm,
  Divider,
} from "antd";
import type { UploadFile } from "antd";
import { DeleteOutlined, CloseCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { usePatientSearch } from "../../../hooks/usePatientSearch";
import { useCaseFileUpload } from "../../../hooks/useCaseFileUpload";
import { useCaseLifecycleActions } from "../../../hooks/useCaseLifecycleActions";
import { loadMasterData } from "../../../utils/caseMasterData";
import { importHisPatient } from "../../../utils/hisPatientImport";
import logger from "../../../utils/logger";

// Components & Services
import PatientFormModal from "../../../components/PatientFormModal";
import HisPatientSearchModal from "../../SurgicalCase/components/HisPatientSearchModal";
import GynePrintPreviewModal from "./GynePrintPreviewModal";
import PatientSearchField from "../../../components/FormParts/PatientSearchField";
import RequestDocumentsUpload from "../../../components/FormParts/RequestDocumentsUpload";
import GyneCytoFormFields from "./GyneCytoFormModal.fields";
import type { HisPatientResult } from "../../../services/hisService";
import HospitalService from "../../../services/hospitalService";
import DepartmentService from "../../../services/departmentService";
import MedicalSchemeService from "../../../services/medicalSchemeService";
import UserService from "../../../services/userService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import TitleService from "../../../services/titleService";
import SpecimenTemplateService from "../../../services/specimenTemplateService";
import type { GyneCytologyCase, GyneCytologyCaseCreate } from "../../../types/gyne-cytology";
import type { Title } from "../../../types/title";
import type { Hospital } from "../../../types/hospital";
import type { Department } from "../../../types/department";
import type { MedicalScheme } from "../../../types/medicalScheme";
import type { User } from "../../../types/user";
import type { CaseFormModalProps } from "../../../types/caseFormModal";

type GyneCytoFormModalProps = CaseFormModalProps<GyneCytologyCase>;

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
  const {
    fileList,
    setFileList,
    isUploading,
    uploadProps,
    handleConfirmDownload,
    handleConfirmDeleteFile,
    flushPendingUploads,
    toUploadFileList,
  } = useCaseFileUpload(GyneCytologyCaseService, editingId);
  const { handleDelete, handleCancel } = useCaseLifecycleActions(
    editingId,
    GyneCytologyCaseService.delete,
    GyneCytologyCaseService.cancel,
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

  // Master Data
  const [titles, setTitles] = useState<Title[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemes, setSchemes] = useState<MedicalScheme[]>([]);
  const [staffs, setStaffs] = useState<User[]>([]);
  const {
    patients,
    setPatients,
    isSearching,
    debouncedSearchPatient,
    handleSelectSpecificHN,
    handlePatientCreationSuccess,
  } = usePatientSearch(form, hospitals);
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
    const result = await loadMasterData(
      () =>
        Promise.all([
          HospitalService.getHospitals(),
          DepartmentService.getDepartments(true),
          MedicalSchemeService.getSchemes(),
          UserService.getUsers(),
          TitleService.getTitles(),
          SpecimenTemplateService.getTemplates("gyne_cyto"),
        ]),
      "Failed to load master data",
    );
    if (!result) return;
    const [h, d, sc, u, t, specimenTypes] = result;
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
  };

  const loadEditingData = async () => {
    setLoading(true);
    try {
      const data = await GyneCytologyCaseService.getById(editingId!);
      if (data.patient) setPatients([data.patient]);
      setFileList(toUploadFileList(data.request_files));
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

  const doSave = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        last_menstrual_period: (
          values.last_menstrual_period as { format: (f: string) => string } | undefined
        )?.format("YYYY-MM-DD"),
        collect_at: (values.collect_at as Dayjs | undefined)?.toISOString(),
      };
      const res = editingId
        ? await GyneCytologyCaseService.update(editingId, payload)
        : await GyneCytologyCaseService.create(
            payload as unknown as GyneCytologyCaseCreate,
          );
      // Upload any queued files now that we have a case ID (create only —
      // an edit-mode save has nothing pending, files upload immediately).
      if (!editingId) {
        await flushPendingUploads(res.id);
      }
      message.success(editingId ? "Updated successfully" : "Registered successfully");
      onSuccess(res);
    } catch (err) {
      message.error("An error occurred while saving");
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values: Record<string, unknown>) => {
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

  const doSaveAndNew = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        last_menstrual_period: (
          values.last_menstrual_period as { format: (f: string) => string } | undefined
        )?.format("YYYY-MM-DD"),
        collect_at: (values.collect_at as Dayjs | undefined)?.toISOString(),
      };
      const res = await GyneCytologyCaseService.create(
        payload as unknown as GyneCytologyCaseCreate,
      );
      await flushPendingUploads(res.id);
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
    let values: Record<string, unknown>;
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
        onSuccess={handlePatientCreationSuccess}
        titles={titles}
        hospitals={hospitals}
      />

      <HisPatientSearchModal
        open={isHisModalOpen}
        onCancel={() => setIsHisModalOpen(false)}
        caseType="gyne"
        onSelect={async (record: HisPatientResult) => {
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

            form.setFieldsValue({
              patient_id: patient.id,
              hn: record.hn || undefined,
              hospital_id: matchedHospitalId,
              department_id: matchedDepartmentId,
              medical_scheme_id: matchedSchemeId,
              clinician_name: record.doctor || undefined,
              collect_at: collectAt?.isValid() ? collectAt : undefined,
            });
            message.success("Data copied from HIS successfully");
          } catch (err: unknown) {
            logger.error("HIS patient select error:", err);
            const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
            message.error(
              "Failed to import data: " +
                (axiosErr.response?.data?.detail || axiosErr.message || ""),
            );
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

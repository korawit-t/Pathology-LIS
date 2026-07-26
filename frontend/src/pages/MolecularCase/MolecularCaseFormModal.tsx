import React, { useEffect, useMemo, useState } from "react";
import { Modal, Form, Select, Input, DatePicker, Segmented, message, Spin, Row, Col } from "antd";
import debounce from "lodash/debounce";
import dayjs from "dayjs";

import { usePatientSearch } from "../../hooks/usePatientSearch";
import { importHisPatient } from "../../utils/hisPatientImport";
import PatientFormModal from "../../components/PatientFormModal";
import HisPatientSearchModal from "../SurgicalCase/components/HisPatientSearchModal";
import type { HisPatientResult } from "../../services/hisService";
import PatientSearchField from "../../components/FormParts/PatientSearchField";
import HospitalService from "../../services/hospitalService";
import DepartmentService from "../../services/departmentService";
import MedicalSchemeService from "../../services/medicalSchemeService";
import TitleService from "../../services/titleService";
import UserService from "../../services/userService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import AnatomicalPathologyTestService, { AnatomicalPathologyTest } from "../../services/anatomicalTestService";
import { MolecularCaseService, MolecularCasePatientRef } from "../../services/molecularCaseService";
import logger from "../../utils/logger";
import type { Patient } from "../../types/patient";
import type { Title } from "../../types/title";
import type { Hospital } from "../../types/hospital";
import type { Department } from "../../types/department";
import type { MedicalScheme } from "../../types/medicalScheme";
import type { SurgicalCase } from "../../types/surgical";
import type { User } from "../../types/user";

const { TextArea } = Input;
const { Option } = Select;

interface MolecularCaseFormModalProps {
  open: boolean;
  editingId: number | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const MolecularCaseFormModal: React.FC<MolecularCaseFormModalProps> = ({ open, editingId, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [mode, setMode] = useState<"existing" | "standalone">("existing");
  const [submitting, setSubmitting] = useState(false);
  const [loadingEditData, setLoadingEditData] = useState(false);

  // --- Lookups shared by both modes ---
  const [molecularTests, setMolecularTests] = useState<AnatomicalPathologyTest[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schemes, setSchemes] = useState<MedicalScheme[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [pathologists, setPathologists] = useState<User[]>([]);

  // --- "Existing Surgical case" mode ---
  const [caseOptions, setCaseOptions] = useState<SurgicalCase[]>([]);
  const [caseSearching, setCaseSearching] = useState(false);
  const [selectedCase, setSelectedCase] = useState<SurgicalCase | null>(null);
  const [loadingCase, setLoadingCase] = useState(false);

  // --- "Standalone" mode ---
  const {
    patients,
    setPatients,
    isSearching: isPatientSearching,
    debouncedSearchPatient,
    handleSelectSpecificHN,
    handlePatientCreationSuccess,
  } = usePatientSearch<MolecularCasePatientRef>(form, hospitals);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isHisModalOpen, setIsHisModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setSelectedCase(null);
    setCaseOptions([]);
    setPatients([]);

    Promise.all([
      HospitalService.getHospitals(),
      DepartmentService.getDepartments(true),
      MedicalSchemeService.getSchemes(),
      TitleService.getTitles(),
      AnatomicalPathologyTestService.getAllTests(),
      UserService.getUsers({ role: "pathologist" }),
    ])
      .then(([hospitalsRes, departmentsRes, schemesRes, titlesRes, testsRes, pathologistsRes]) => {
        setHospitals(hospitalsRes);
        setDepartments(departmentsRes);
        setSchemes(schemesRes);
        setTitles(titlesRes);
        setMolecularTests((testsRes.data || []).filter((t) => t.category === "Molecular"));
        setPathologists(pathologistsRes);
      })
      .catch(() => message.error("Failed to load reference data"));

    if (editingId) {
      setMode("standalone");
      loadEditingData();
    } else {
      setMode("existing");
    }
  }, [open, editingId, form]);

  const loadEditingData = async () => {
    setLoadingEditData(true);
    try {
      const data = await MolecularCaseService.getById(editingId!);
      if (data.patient) setPatients([data.patient]);
      form.setFieldsValue({
        accession_no: data.accession_no,
        patient_id: data.patient_id,
        hospital_id: data.hospital_id,
        department_id: data.department_id,
        medical_scheme_id: data.medical_scheme_id,
        hn: data.hn,
        an: data.an,
        vn: data.vn,
        clinician_name: data.clinician_name,
        clinical_diagnosis: data.clinical_diagnosis,
        collect_at: data.collect_at ? dayjs(data.collect_at) : null,
        test_id: data.ap_test_id,
        assist_pathologist_id: data.assist_pathologist_id,
      });
    } catch {
      message.error("Failed to load case data");
    } finally {
      setLoadingEditData(false);
    }
  };

  const debouncedSearchCase = useMemo(
    () =>
      debounce(async (value: string) => {
        if (!value || value.trim().length < 2) {
          setCaseOptions([]);
          return;
        }
        setCaseSearching(true);
        try {
          const res = await SurgicalCaseService.getCases({ search: value, limit: 20 });
          setCaseOptions(res.items || []);
        } catch {
          setCaseOptions([]);
        } finally {
          setCaseSearching(false);
        }
      }, 400),
    [],
  );

  const handleSelectCase = async (caseId: number) => {
    setLoadingCase(true);
    form.setFieldsValue({ block_id: undefined });
    try {
      const full = await SurgicalCaseService.getCaseById(caseId);
      setSelectedCase(full);
    } catch {
      message.error("Failed to load case detail");
      setSelectedCase(null);
    } finally {
      setLoadingCase(false);
    }
  };

  const blockOptions = useMemo(() => {
    if (!selectedCase?.specimens) return [];
    return selectedCase.specimens.flatMap((spec) =>
      (spec.blocks || []).map((block) => ({
        value: block.id,
        label: `${spec.specimen_label} — ${block.block_code || block.id}`,
      })),
    );
  }, [selectedCase]);

  const handleHisPatientSelect = async (record: HisPatientResult) => {
    setIsHisModalOpen(false);
    try {
      const { patient, matchedHospitalId, matchedDepartmentId, matchedSchemeId, collectAt } =
        await importHisPatient<MolecularCasePatientRef>(record, {
          titles,
          schemes,
          departments,
          hospitals,
          setTitles,
          setSchemes,
          setDepartments,
          setPatients,
          backfillExistingPatientTitle: false,
        });

      form.setFieldsValue({
        patient_id: patient.id,
        hn: record.hn || undefined,
        an: record.an || undefined,
        vn: record.vn || undefined,
        hospital_id: matchedHospitalId,
        department_id: matchedDepartmentId,
        medical_scheme_id: matchedSchemeId,
        clinician_name: record.doctor || undefined,
        collect_at: collectAt?.isValid() ? collectAt : undefined,
      });

      message.success("HIS data imported successfully");
    } catch (err: unknown) {
      logger.error("HIS patient select error:", err);
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      message.error("Failed to import HIS data: " + (axiosErr.response?.data?.detail || axiosErr.message || "Unknown error"));
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingId) {
        await MolecularCaseService.update(editingId, {
          patient_id: values.patient_id,
          ap_test_id: values.test_id,
          hospital_id: values.hospital_id,
          department_id: values.department_id,
          medical_scheme_id: values.medical_scheme_id,
          hn: values.hn,
          an: values.an,
          vn: values.vn,
          clinical_diagnosis: values.clinical_diagnosis,
          clinician_name: values.clinician_name,
          collect_at: values.collect_at ? values.collect_at.toISOString() : null,
          assist_pathologist_id: values.assist_pathologist_id,
        });
        message.success("Molecular case updated");
      } else if (mode === "existing") {
        await SurgicalBlockStainService.createStain({
          block_id: values.block_id,
          test_id: values.test_id,
          slide_no: 1,
          assist_pathologist_id: values.assist_pathologist_id,
        });
        message.success("Molecular test ordered");
      } else {
        await MolecularCaseService.createStandalone({
          patient_id: values.patient_id,
          ap_test_id: values.test_id,
          hospital_id: values.hospital_id,
          department_id: values.department_id,
          medical_scheme_id: values.medical_scheme_id,
          hn: values.hn,
          an: values.an,
          vn: values.vn,
          clinical_diagnosis: values.clinical_diagnosis,
          clinician_name: values.clinician_name,
          collect_at: values.collect_at ? values.collect_at.toISOString() : null,
          assist_pathologist_id: values.assist_pathologist_id,
        });
        message.success("Molecular case registered");
      }
      onSuccess();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      if (axiosErr?.response?.data?.detail) {
        message.error(axiosErr.response.data.detail);
      }
      // validateFields rejection already shows inline form errors
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      title={editingId ? "Edit Molecular Pathology Case" : "New Molecular Pathology Case"}
      width={900}
      destroyOnClose
    >
      {!editingId && (
        <Segmented
          block
          style={{ marginBottom: 16 }}
          value={mode}
          onChange={(v) => setMode(v as "existing" | "standalone")}
          options={[
            { label: "From Surgical Case", value: "existing" },
            { label: "Standalone", value: "standalone" },
          ]}
        />
      )}

      <Spin spinning={loadingEditData}>
        <Form form={form} layout="vertical">
          {mode === "existing" && !editingId ? (
            <>
              <Form.Item label="Surgical Case (Accession No. / HN / Patient)" required>
                <Select
                  showSearch
                  placeholder="Search surgical case..."
                  filterOption={false}
                  loading={caseSearching}
                  notFoundContent={caseSearching ? <Spin size="small" /> : "No results found"}
                  onSearch={debouncedSearchCase}
                  onChange={handleSelectCase}
                  options={caseOptions.map((c) => ({
                    value: c.id,
                    label: `${c.accession_no} — ${[c.patient?.title?.title, c.patient?.name, c.patient?.ln].filter(Boolean).join(" ") || c.hn || ""}`,
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="block_id"
                label="Block"
                rules={[{ required: true, message: "Please select a block" }]}
              >
                <Select
                  loading={loadingCase}
                  disabled={!selectedCase}
                  placeholder={selectedCase ? "Select block" : "Select a case first"}
                  options={blockOptions}
                />
              </Form.Item>

              <Form.Item name="assist_pathologist_id" label="Assist Pathologist">
                <Select
                  allowClear
                  placeholder="Select assist pathologist"
                  options={pathologists.map((p) => ({ value: p.id, label: p.full_name || p.username }))}
                />
              </Form.Item>
            </>
          ) : (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <PatientSearchField
                    patients={patients as Patient[]}
                    titles={titles}
                    hospitals={hospitals}
                    isSearching={isPatientSearching}
                    onSearch={debouncedSearchPatient}
                    onNewPatient={() => setIsPatientModalOpen(true)}
                    onHisSearch={() => setIsHisModalOpen(true)}
                    onSelectHN={handleSelectSpecificHN}
                  />
                </Col>
                {editingId && (
                  <Col span={5}>
                    <Form.Item name="accession_no" label="Accession No.">
                      <Input disabled style={{ fontWeight: "bold", color: "black" }} />
                    </Form.Item>
                  </Col>
                )}
                <Col span={editingId ? 7 : 12}>
                  <Form.Item name="hospital_id" label="Hospital">
                    <Select allowClear placeholder="Select Hospital">
                      {hospitals.map((h) => (
                        <Option key={h.id} value={h.id}>{h.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="department_id" label="Department">
                    <Select allowClear placeholder="Select department">
                      {departments.map((d) => (
                        <Option key={d.id} value={d.id}>{d.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="medical_scheme_id" label="Medical Scheme">
                    <Select allowClear placeholder="Select scheme">
                      {schemes.map((s) => (
                        <Option key={s.id} value={s.id}>{s.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="collect_at" label="Collection Date/Time">
                    <DatePicker showTime style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="hn" label="HN">
                    <Input placeholder="Hospital Number" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="an" label="AN">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="vn" label="VN">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="clinician_name" label="Clinician">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="assist_pathologist_id" label="Assist Pathologist">
                    <Select
                      allowClear
                      placeholder="Select assist pathologist"
                      options={pathologists.map((p) => ({ value: p.id, label: p.full_name || p.username }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="clinical_diagnosis" label="Clinical Diagnosis">
                <TextArea rows={2} />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="test_id"
            label="Molecular Test"
            rules={[{ required: true, message: "Please select a Molecular test" }]}
          >
            <Select
              placeholder="Select Molecular test"
              options={molecularTests.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
        </Form>
      </Spin>

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
        caseType="molecular"
        onSelect={handleHisPatientSelect}
      />
    </Modal>
  );
};

export default MolecularCaseFormModal;

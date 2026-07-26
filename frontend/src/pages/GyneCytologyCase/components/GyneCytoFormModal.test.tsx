import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import GyneCytoFormModal from "./GyneCytoFormModal";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import PatientService from "../../../services/patientService";
import HospitalService from "../../../services/hospitalService";
import DepartmentService from "../../../services/departmentService";
import MedicalSchemeService from "../../../services/medicalSchemeService";
import UserService from "../../../services/userService";
import TitleService from "../../../services/titleService";
import SpecimenTemplateService from "../../../services/specimenTemplateService";
import type { Patient } from "../../../types/patient";

vi.mock("../../../services/gyneCytoCaseService", () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    cancel: vi.fn(),
    uploadRequestFile: vi.fn(),
    deleteRequestFile: vi.fn(),
    downloadRequestFile: vi.fn(),
    downloadRequestFileBlob: vi.fn(),
  },
}));
vi.mock("../../../services/patientService", () => ({
  default: {
    getPatients: vi.fn().mockResolvedValue([]),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
  },
}));
vi.mock("../../../services/hospitalService", () => ({
  default: { getHospitals: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../../services/departmentService", () => ({
  default: { getDepartments: vi.fn().mockResolvedValue([]), createDepartment: vi.fn() },
}));
vi.mock("../../../services/medicalSchemeService", () => ({
  default: { getSchemes: vi.fn().mockResolvedValue([]), createScheme: vi.fn() },
}));
vi.mock("../../../services/userService", () => ({
  default: { getUsers: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../../services/titleService", () => ({
  default: { getTitles: vi.fn().mockResolvedValue([]), createTitle: vi.fn() },
}));
vi.mock("../../../services/specimenTemplateService", () => ({
  default: { getTemplates: vi.fn().mockResolvedValue([]) },
}));

const mockPatient = { id: 1, name: "Somchai", ln: "Deejai", hn: "HN001" } as Patient;

const renderModal = (props: Partial<React.ComponentProps<typeof GyneCytoFormModal>> = {}) =>
  render(
    <AntdApp>
      <GyneCytoFormModal open editingId={null} onCancel={vi.fn()} onSuccess={vi.fn()} {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (HospitalService.getHospitals as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 1, name: "General Hospital" },
  ]);
  (DepartmentService.getDepartments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (MedicalSchemeService.getSchemes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 5, full_name: "Cyto Tech", roles: ["cytotechnologist"] },
  ]);
  (TitleService.getTitles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (SpecimenTemplateService.getTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 1, name: "Conventional", case_type: "gyne_cyto" },
  ]);
  (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([mockPatient]);
});

const fillRequiredFields = async () => {
  await screen.findByText("Gyne Cytology Registration");

  fireEvent.mouseDown(screen.getByText("Search patient..."));
  const patientSearchInput = screen
    .getByText("Search patient...")
    .closest(".ant-select")
    ?.querySelector('input[role="combobox"]');
  fireEvent.change(patientSearchInput as Element, { target: { value: "Somchai" } });
  await waitFor(() => expect(PatientService.getPatients).toHaveBeenCalledWith("Somchai"), {
    timeout: 2000,
  });
  fireEvent.click(await screen.findByText("Somchai Deejai"));

  fireEvent.mouseDown(screen.getByText("Select Hospital"));
  fireEvent.click(await screen.findByText("General Hospital"));

  fireEvent.change(screen.getByLabelText("HN"), { target: { value: "HN001" } });

  // specimen_type auto-fills once the mocked (non-empty) specimen-template
  // response resolves — no manual interaction needed, just wait for it.
  await waitFor(() => {
    const text = document.getElementById("specimen_type")?.closest(".ant-select")?.textContent;
    expect(text).toContain("Conventional");
  });

  // Selecting a cytotechnologist avoids the "not specified" confirm dialog
  // onFinish shows otherwise — that dialog's animation-gated accessible
  // name made it an unreliably slow, flaky thing to drive in this suite.
  fireEvent.mouseDown(screen.getByText("เลือกนักเซลล์วิทยา"));
  fireEvent.click(await screen.findByText("Cyto Tech"));
};

describe("GyneCytoFormModal", () => {
  it("renders the registration form", async () => {
    renderModal();
    expect(await screen.findByText("Gyne Cytology Registration")).toBeInTheDocument();
    expect(screen.getByLabelText("HN")).toBeInTheDocument();
  });

  it("submits a new case with the selected patient, hospital, and HN", async () => {
    (GyneCytologyCaseService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 77,
      accession_no: "C26-00077",
    });
    renderModal();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Save & Close" }));

    await waitFor(() => expect(GyneCytologyCaseService.create).toHaveBeenCalled());
    const [payload] = (GyneCytologyCaseService.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({ patient_id: 1, hospital_id: 1, hn: "HN001" }),
    );
  });

  it("flushes a pre-save queued file to the backend right after case creation", async () => {
    (GyneCytologyCaseService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 88,
      accession_no: "C26-00088",
    });
    (GyneCytologyCaseService.uploadRequestFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: "ok",
      file_id: 501,
    });
    renderModal();
    await fillRequiredFields();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    const file = new File(["dummy"], "request-form.pdf", { type: "application/pdf" });
    await fireEvent.change(fileInput as Element, { target: { files: [file] } });
    expect(await screen.findByText("request-form.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save & Close" }));

    await waitFor(() => expect(GyneCytologyCaseService.create).toHaveBeenCalled());
    await waitFor(() =>
      expect(GyneCytologyCaseService.uploadRequestFile).toHaveBeenCalledWith(88, file),
    );
  });
});

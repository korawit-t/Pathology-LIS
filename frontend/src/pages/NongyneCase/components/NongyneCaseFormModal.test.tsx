import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import NongyneCaseFormModal from "./NongyneCaseFormModal";
import NongyneCytologyCaseService from "../../../services/nongyneCytoCaseService";
import PatientService from "../../../services/patientService";
import HospitalService from "../../../services/hospitalService";
import DepartmentService from "../../../services/departmentService";
import MedicalSchemeService from "../../../services/medicalSchemeService";
import UserService from "../../../services/userService";
import TitleService from "../../../services/titleService";
import SpecimenTemplateService from "../../../services/specimenTemplateService";
import type { Patient } from "../../../types/patient";

vi.mock("../../../services/nongyneCytoCaseService", () => ({
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
// Left empty deliberately: NongyneCaseFormModal seeds specimenTypes with a
// stable DEFAULT_SPECIMEN_TYPES list up front, so the form is interactive
// without waiting on this to resolve — avoids the auto-fill/dropdown race
// that made the equivalent Gyne interaction flaky (see GyneCytoFormModal
// .test.tsx's fillRequiredFields comment for the full story).
vi.mock("../../../services/specimenTemplateService", () => ({
  default: { getTemplates: vi.fn().mockResolvedValue([]) },
}));

const mockPatient = { id: 1, name: "Somchai", ln: "Deejai", hn: "HN001" } as Patient;

const renderModal = (props: Partial<React.ComponentProps<typeof NongyneCaseFormModal>> = {}) =>
  render(
    <AntdApp>
      <NongyneCaseFormModal open editingId={null} onCancel={vi.fn()} onSuccess={vi.fn()} {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (HospitalService.getHospitals as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 1, name: "General Hospital" },
  ]);
  (DepartmentService.getDepartments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (MedicalSchemeService.getSchemes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (TitleService.getTitles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([mockPatient]);
});

const fillRequiredFields = async () => {
  await screen.findByText("Register Non-Gyne Cyto Case");

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

  // specimen_type already defaults to "Fluid" via the !editingId init
  // effect's form.setFieldsValue — no interaction needed.
};

describe("NongyneCaseFormModal", () => {
  it("renders the registration form", async () => {
    renderModal();
    expect(await screen.findByText("Register Non-Gyne Cyto Case")).toBeInTheDocument();
    expect(screen.getByLabelText("HN")).toBeInTheDocument();
  });

  it("submits a new case with the selected patient, hospital, and HN", async () => {
    (NongyneCytologyCaseService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 66,
      accession_no: "N26-00066",
    });
    renderModal();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Save & Close" }));

    await waitFor(() => expect(NongyneCytologyCaseService.create).toHaveBeenCalled());
    const [payload] = (NongyneCytologyCaseService.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({ patient_id: 1, hospital_id: 1, hn: "HN001" }),
    );
  });

  it("flushes a pre-save queued file to the backend right after case creation", async () => {
    (NongyneCytologyCaseService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 99,
      accession_no: "N26-00099",
    });
    (NongyneCytologyCaseService.uploadRequestFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: "ok",
      file_id: 701,
    });
    renderModal();
    await fillRequiredFields();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    const file = new File(["dummy"], "request-form.pdf", { type: "application/pdf" });
    await fireEvent.change(fileInput as Element, { target: { files: [file] } });
    expect(await screen.findByText("request-form.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save & Close" }));

    await waitFor(() => expect(NongyneCytologyCaseService.create).toHaveBeenCalled());
    await waitFor(() =>
      expect(NongyneCytologyCaseService.uploadRequestFile).toHaveBeenCalledWith(99, file),
    );
  });
});

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import MolecularCaseFormModal from "./MolecularCaseFormModal";
import { MolecularCaseService } from "../../services/molecularCaseService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import AnatomicalPathologyTestService from "../../services/anatomicalTestService";
import PatientService from "../../services/patientService";
import HospitalService from "../../services/hospitalService";
import DepartmentService from "../../services/departmentService";
import MedicalSchemeService from "../../services/medicalSchemeService";
import TitleService from "../../services/titleService";
import UserService from "../../services/userService";
import type { Patient } from "../../types/patient";

vi.mock("../../services/molecularCaseService", () => ({
  MolecularCaseService: {
    createStandalone: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    finalize: vi.fn(),
    cancel: vi.fn(),
    uploadOutlabPdf: vi.fn(),
    deleteOutlabPdf: vi.fn(),
    getOutlabPdfBlob: vi.fn(),
    getResultPdfBlob: vi.fn(),
  },
}));
vi.mock("../../services/surgicalCaseService", () => ({
  default: {
    searchPublicCases: vi.fn().mockResolvedValue([]),
    searchPublicAllCases: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../services/surgicalBlockStainService", () => ({
  default: { createStain: vi.fn() },
}));
vi.mock("../../services/anatomicalTestService", () => ({
  default: { getAllTests: vi.fn() },
}));
vi.mock("../../services/patientService", () => ({
  default: {
    getPatients: vi.fn().mockResolvedValue([]),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
  },
}));
vi.mock("../../services/hospitalService", () => ({
  default: { getHospitals: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../services/departmentService", () => ({
  default: { getDepartments: vi.fn().mockResolvedValue([]), createDepartment: vi.fn() },
}));
vi.mock("../../services/medicalSchemeService", () => ({
  default: { getSchemes: vi.fn().mockResolvedValue([]), createScheme: vi.fn() },
}));
vi.mock("../../services/titleService", () => ({
  default: { getTitles: vi.fn().mockResolvedValue([]), createTitle: vi.fn() },
}));
vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn().mockResolvedValue([]) },
}));

const mockPatient = { id: 1, name: "Somchai", ln: "Deejai", hn: "HN001" } as Patient;

const renderModal = (props: Partial<React.ComponentProps<typeof MolecularCaseFormModal>> = {}) =>
  render(
    <AntdApp>
      <MolecularCaseFormModal open editingId={null} onCancel={vi.fn()} onSuccess={vi.fn()} {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (HospitalService.getHospitals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (DepartmentService.getDepartments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (MedicalSchemeService.getSchemes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (TitleService.getTitles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (UserService.getUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (AnatomicalPathologyTestService.getAllTests as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [{ id: 9, name: "BRAF Mutation", category: "Molecular" }],
  });
  (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([mockPatient]);
});

describe("MolecularCaseFormModal", () => {
  it("renders in 'existing surgical case' mode by default", async () => {
    renderModal();
    expect(
      await screen.findByText("New Molecular Pathology Case"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Surgical Case (Accession No. / HN / Patient)"),
    ).toBeInTheDocument();
  });

  it("submits a new standalone case with the selected patient and test", async () => {
    (MolecularCaseService.createStandalone as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 55,
    });
    renderModal();
    await screen.findByText("New Molecular Pathology Case");

    fireEvent.click(screen.getByText("Standalone"));

    fireEvent.mouseDown(await screen.findByText("Search patient..."));
    const patientSearchInput = screen
      .getByText("Search patient...")
      .closest(".ant-select")
      ?.querySelector('input[role="combobox"]');
    fireEvent.change(patientSearchInput as Element, { target: { value: "Somchai" } });
    await waitFor(() => expect(PatientService.getPatients).toHaveBeenCalledWith("Somchai"), {
      timeout: 2000,
    });
    fireEvent.click(await screen.findByText("Somchai Deejai"));

    fireEvent.mouseDown(screen.getByText("Select Molecular test"));
    fireEvent.click(await screen.findByText("BRAF Mutation"));

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(MolecularCaseService.createStandalone).toHaveBeenCalled());
    const [payload] = (MolecularCaseService.createStandalone as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(payload).toEqual(
      expect.objectContaining({ patient_id: 1, ap_test_id: 9 }),
    );
  });
});

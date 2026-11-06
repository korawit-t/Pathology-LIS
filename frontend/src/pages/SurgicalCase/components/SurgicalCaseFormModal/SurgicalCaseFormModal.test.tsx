import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SurgicalCaseFormModal from "./index";
import SurgicalCaseService from "../../../../services/surgicalCaseService";
import PatientService from "../../../../services/patientService";
import HospitalService from "../../../../services/hospitalService";
import DepartmentService from "../../../../services/departmentService";
import MedicalSchemeService from "../../../../services/medicalSchemeService";
import UserService from "../../../../services/userService";
import TitleService from "../../../../services/titleService";
import type { Patient } from "../../../../types/patient";

vi.mock("../../../../services/surgicalCaseService", () => ({
  default: {
    getCaseById: vi.fn(),
    createCase: vi.fn(),
    updateCase: vi.fn(),
    deleteCase: vi.fn(),
    cancelCase: vi.fn(),
    uploadRequestFile: vi.fn(),
    deleteRequestFile: vi.fn(),
    downloadRequestFile: vi.fn(),
    downloadRequestFileBlob: vi.fn(),
  },
}));
vi.mock("../../../../services/patientService", () => ({
  default: {
    getPatients: vi.fn().mockResolvedValue([]),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
  },
}));
vi.mock("../../../../services/hospitalService", () => ({
  default: { getHospitals: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../../../services/departmentService", () => ({
  default: { getDepartments: vi.fn().mockResolvedValue([]), createDepartment: vi.fn() },
}));
vi.mock("../../../../services/medicalSchemeService", () => ({
  default: { getSchemes: vi.fn().mockResolvedValue([]), createScheme: vi.fn() },
}));
vi.mock("../../../../services/userService", () => ({
  default: { getUsers: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../../../services/titleService", () => ({
  default: { getTitles: vi.fn().mockResolvedValue([]), createTitle: vi.fn() },
}));

const mockPatient = { id: 1, name: "Somchai", ln: "Deejai", hn: "HN001" } as Patient;

const renderModal = (props: Partial<React.ComponentProps<typeof SurgicalCaseFormModal>> = {}) =>
  render(
    <AntdApp>
      <SurgicalCaseFormModal
        open
        editingId={null}
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
        {...props}
      />
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

describe("SurgicalCaseFormModal", () => {
  it("renders the registration form", async () => {
    renderModal();
    expect(await screen.findByText("Register New Specimen")).toBeInTheDocument();
    expect(screen.getByLabelText("HN")).toBeInTheDocument();
  });

  it("submits a new case with the selected patient, hospital, and HN", async () => {
    (SurgicalCaseService.createCase as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 99,
      accession_no: "S26-00099",
    });
    renderModal();
    await screen.findByText("Register New Specimen");

    fireEvent.mouseDown(screen.getByText("Search patient..."));
    const patientSearchInput = screen
      .getByText("Search patient...")
      .closest(".ant-select")
      ?.querySelector('input[role="combobox"]');
    expect(patientSearchInput).toBeTruthy();
    fireEvent.change(patientSearchInput as Element, { target: { value: "Somchai" } });
    await waitFor(() => expect(PatientService.getPatients).toHaveBeenCalledWith("Somchai"), {
      timeout: 2000,
    });
    fireEvent.click(await screen.findByText("Somchai Deejai"));

    fireEvent.mouseDown(screen.getByText("Select Hospital"));
    fireEvent.click(await screen.findByText("General Hospital"));

    fireEvent.change(screen.getByLabelText("HN"), { target: { value: "HN001" } });

    fireEvent.click(screen.getByRole("button", { name: "Save & Close" }));

    await waitFor(() => expect(SurgicalCaseService.createCase).toHaveBeenCalled());
    const [payload] = (SurgicalCaseService.createCase as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({ patient_id: 1, hospital_id: 1, hn: "HN001" }),
    );
  });

  describe("editing a case whose clinical diagnosis was saved as HTML by gross/pathologist", () => {
    const html = "<p>Breast mass</p><p>R/O <strong>CA</strong></p>";

    beforeEach(() => {
      (SurgicalCaseService.getCaseById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 7,
        accession_no: "S26-00007",
        patient: mockPatient,
        patient_id: 1,
        hospital_id: 1,
        hn: "HN001",
        clinical_diagnosis: html,
      });
      (SurgicalCaseService.updateCase as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 7 });
    });

    const clinicalField = () =>
      screen.getByLabelText("Clinical History / Diagnosis") as HTMLTextAreaElement;

    it("shows the text without HTML tags", async () => {
      renderModal({ editingId: 7 });
      await waitFor(() => expect(clinicalField().value).toBe("Breast mass\nR/O CA"));
    });

    it("saves the original HTML when the field wasn't edited", async () => {
      renderModal({ editingId: 7 });
      await waitFor(() => expect(clinicalField().value).toBe("Breast mass\nR/O CA"));

      fireEvent.click(await screen.findByRole("button", { name: /Save Changes/ }));

      await waitFor(() => expect(SurgicalCaseService.updateCase).toHaveBeenCalled());
      const [, payload] = (SurgicalCaseService.updateCase as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(payload.clinical_diagnosis).toBe(html);
    });

    it("saves edited text as paragraphs", async () => {
      renderModal({ editingId: 7 });
      await waitFor(() => expect(clinicalField().value).toBe("Breast mass\nR/O CA"));

      fireEvent.change(clinicalField(), { target: { value: "Breast mass, left\nR/O CA" } });
      fireEvent.click(await screen.findByRole("button", { name: /Save Changes/ }));

      await waitFor(() => expect(SurgicalCaseService.updateCase).toHaveBeenCalled());
      const [, payload] = (SurgicalCaseService.updateCase as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(payload.clinical_diagnosis).toBe("<p>Breast mass, left</p><p>R/O CA</p>");
    });
  });
});

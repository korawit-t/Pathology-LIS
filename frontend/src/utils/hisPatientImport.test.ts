import { importHisPatient } from "./hisPatientImport";
import PatientService from "../services/patientService";
import TitleService from "../services/titleService";
import DepartmentService from "../services/departmentService";
import MedicalSchemeService from "../services/medicalSchemeService";

vi.mock("../services/patientService", () => ({
  default: { getPatients: vi.fn(), createPatient: vi.fn(), updatePatient: vi.fn() },
}));
vi.mock("../services/titleService", () => ({
  default: { createTitle: vi.fn() },
}));
vi.mock("../services/departmentService", () => ({
  default: { createDepartment: vi.fn() },
}));
vi.mock("../services/medicalSchemeService", () => ({
  default: { createScheme: vi.fn() },
}));

const hospitals = [{ id: 1, name: "General Hospital" }] as import("../types/hospital").Hospital[];

const baseRecord = {
  fname: "Somchai",
  lname: "Jaidee",
  cid: "1234567890123",
  pname: "Mr.",
  gender_code: 1,
  hn: "HN001",
  department: "Surgery",
  pttype: "Gold Card",
  order_date: "2026-01-01 10:00:00",
  birthday: "1990-01-01 00:00:00",
} as unknown as import("../services/hisService").HisPatientResult;

const makeDeps = (overrides: Partial<Parameters<typeof importHisPatient>[1]> = {}) => ({
  titles: [],
  schemes: [],
  departments: [],
  hospitals,
  setTitles: vi.fn(),
  setSchemes: vi.fn(),
  setDepartments: vi.fn(),
  setPatients: vi.fn(),
  backfillExistingPatientTitle: true,
  ...overrides,
});

describe("importHisPatient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (TitleService.createTitle as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 9, title: "Mr." });
    (DepartmentService.createDepartment as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 8,
      name: "Surgery",
    });
    (MedicalSchemeService.createScheme as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      name: "Gold Card",
    });
  });

  it("matches an existing patient by CID without creating a new one", async () => {
    const existing = { id: 5, name: "Somchai", ln: "Jaidee", cid: "1234567890123", title_id: 1 };
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([existing]);

    const deps = makeDeps({ titles: [{ id: 1, title: "Mr." }] as never });
    const result = await importHisPatient(baseRecord, deps);

    expect(result.patient).toEqual(existing);
    expect(PatientService.createPatient).not.toHaveBeenCalled();
  });

  it("falls back to first+last name match when CID lookup finds nothing", async () => {
    const existing = { id: 6, name: "Somchai", ln: "Jaidee", cid: undefined, title_id: 1 };
    (PatientService.getPatients as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // CID search
      .mockResolvedValueOnce([existing]); // name search

    const result = await importHisPatient(baseRecord, makeDeps());

    expect(result.patient).toEqual(existing);
    expect(PatientService.getPatients).toHaveBeenCalledTimes(2);
  });

  it("creates a new patient when no match is found by CID or name", async () => {
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const created = { id: 10, name: "Somchai", ln: "Jaidee" };
    (PatientService.createPatient as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const result = await importHisPatient(baseRecord, makeDeps());

    expect(PatientService.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Somchai", ln: "Jaidee", cid: baseRecord.cid }),
    );
    expect(result.patient).toEqual(created);
  });

  it("creates a title when the HIS-supplied title isn't in the known list", async () => {
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PatientService.createPatient as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 11 });
    const setTitles = vi.fn();

    await importHisPatient(baseRecord, makeDeps({ setTitles }));

    expect(TitleService.createTitle).toHaveBeenCalledWith({ title: "Mr." });
    expect(setTitles).toHaveBeenCalled();
  });

  it("swallows a title-creation failure (e.g. 403) and continues without a title", async () => {
    (TitleService.createTitle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("403 Forbidden"));
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const createPatient = PatientService.createPatient as ReturnType<typeof vi.fn>;
    createPatient.mockResolvedValue({ id: 12 });

    await importHisPatient(baseRecord, makeDeps());

    expect(createPatient).toHaveBeenCalledWith(
      expect.objectContaining({ title_id: undefined }),
    );
  });

  it("backfills an existing patient's missing title when backfillExistingPatientTitle is true", async () => {
    const existing = { id: 13, name: "Somchai", ln: "Jaidee", cid: "1234567890123", title_id: undefined };
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([existing]);

    const deps = makeDeps({ titles: [{ id: 1, title: "Mr." }] as never, backfillExistingPatientTitle: true });
    const result = await importHisPatient(baseRecord, deps);

    expect(PatientService.updatePatient).toHaveBeenCalledWith(13, { title_id: 1 });
    expect(result.patient.title_id).toBe(1);
  });

  it("does not backfill an existing patient's title when backfillExistingPatientTitle is false", async () => {
    const existing = { id: 14, name: "Somchai", ln: "Jaidee", cid: "1234567890123", title_id: undefined };
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([existing]);

    const deps = makeDeps({ titles: [{ id: 1, title: "Mr." }] as never, backfillExistingPatientTitle: false });
    await importHisPatient(baseRecord, deps);

    expect(PatientService.updatePatient).not.toHaveBeenCalled();
  });

  it("matches an existing department by case-insensitive substring instead of creating one", async () => {
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PatientService.createPatient as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 15 });

    const result = await importHisPatient(
      baseRecord,
      makeDeps({ departments: [{ id: 2, name: "surgery" }] as never }),
    );

    expect(result.matchedDepartmentId).toBe(2);
    expect(DepartmentService.createDepartment).not.toHaveBeenCalled();
  });

  it("creates a department when no match exists", async () => {
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PatientService.createPatient as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 16 });

    const result = await importHisPatient(baseRecord, makeDeps());

    expect(DepartmentService.createDepartment).toHaveBeenCalledWith({
      name: "Surgery",
      is_active: true,
    });
    expect(result.matchedDepartmentId).toBe(8);
  });

  it("matches an existing scheme instead of creating one", async () => {
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PatientService.createPatient as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 17 });

    const result = await importHisPatient(
      baseRecord,
      makeDeps({ schemes: [{ id: 3, name: "gold card" }] as never }),
    );

    expect(result.matchedSchemeId).toBe(3);
    expect(MedicalSchemeService.createScheme).not.toHaveBeenCalled();
  });

  it("defaults matchedHospitalId to the first hospital in the list", async () => {
    (PatientService.getPatients as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PatientService.createPatient as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 18 });

    const result = await importHisPatient(baseRecord, makeDeps());

    expect(result.matchedHospitalId).toBe(1);
  });
});

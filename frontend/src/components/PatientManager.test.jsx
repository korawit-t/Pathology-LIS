import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../contexts/ThemeContext";
import PatientManager from "./PatientManager";
import PatientService from "../services/patientService";
import TitleService from "../services/titleService";

vi.mock("../services/patientService", () => ({
  default: {
    getPatientPage: vi.fn(),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
    deletePatient: vi.fn(),
  },
}));
vi.mock("../services/titleService", () => ({
  default: { getTitles: vi.fn() },
}));

const patient = (overrides = {}) => ({
  id: 1,
  cid: "1111111111111",
  name: "Somchai",
  ln: "Jaidee",
  title: { id: 1, title: "Mr." },
  gender: "Male",
  birth_date: "1990-01-01",
  ...overrides,
});

const renderWithTheme = () => render(<ThemeProvider><PatientManager /></ThemeProvider>);
const pageOf = (items, total = items.length) => ({ items, total });

const selectGender = async (label) => {
  fireEvent.mouseDown(screen.getByText("Select Gender"));
  fireEvent.click(await screen.findByTitle(label));
};

beforeEach(() => {
  vi.clearAllMocks();
  TitleService.getTitles.mockResolvedValue([{ id: 1, title: "Mr." }, { id: 2, title: "Mrs." }]);
});

describe("PatientManager", () => {
  it("loads the first page from the server and keeps the server's order", async () => {
    PatientService.getPatientPage.mockResolvedValue(
      pageOf([
        patient({ id: 2, name: "Wichai", ln: "", title: null }),
        patient({ id: 1, name: "Somchai" }),
      ]),
    );
    renderWithTheme();

    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());
    expect(PatientService.getPatientPage).toHaveBeenCalledWith({ q: undefined, skip: 0, limit: 20 });
    // newest first comes from the server; the page no longer re-sorts by id
    const rows = document.querySelectorAll("tbody tr");
    expect(rows[0].textContent).toMatch(/Wichai/);
    expect(rows[1].textContent).toMatch(/Somchai/);
  });

  it("shows the hospital: HN labels from every case type", async () => {
    PatientService.getPatientPage.mockResolvedValue(
      pageOf([patient({ hn: "รพ.ก: 111, รพ.ข: 222" })]),
    );
    renderWithTheme();

    expect(await screen.findByText("รพ.ก: 111")).toBeInTheDocument();
    expect(screen.getByText("รพ.ข: 222")).toBeInTheDocument();
  });

  it("searches on the server (name, CID or HN) and goes back to page 1", async () => {
    PatientService.getPatientPage.mockResolvedValue(pageOf([patient()], 45));
    const { container } = renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("2"));
    await waitFor(() =>
      expect(PatientService.getPatientPage).toHaveBeenLastCalledWith({ q: undefined, skip: 20, limit: 20 }),
    );

    fireEvent.change(screen.getByPlaceholderText("Search by Name, CID or HN"), { target: { value: " HN123 " } });
    fireEvent.click(container.querySelector(".anticon-search").closest("button"));

    await waitFor(() =>
      expect(PatientService.getPatientPage).toHaveBeenLastCalledWith({ q: "HN123", skip: 0, limit: 20 }),
    );
  });

  it("searches after typing stops, without pressing Enter", async () => {
    PatientService.getPatientPage.mockResolvedValue(pageOf([]));
    renderWithTheme();
    await waitFor(() => expect(PatientService.getPatientPage).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText("Search by Name, CID or HN"), { target: { value: "somc" } });

    await waitFor(() =>
      expect(PatientService.getPatientPage).toHaveBeenLastCalledWith({ q: "somc", skip: 0, limit: 20 }),
    );
  });

  it("shows the total count from the server", async () => {
    PatientService.getPatientPage.mockResolvedValue(pageOf([patient()], 1234));
    renderWithTheme();

    expect(await screen.findByText("ทั้งหมด 1234 คน")).toBeInTheDocument();
  });

  it("renders gender icons for Male/Female, a Tag fallback otherwise, and a formatted birthdate", async () => {
    PatientService.getPatientPage.mockResolvedValue(
      pageOf([
        patient({ id: 1, name: "Somchai", gender: "Male", birth_date: "1990-01-15" }),
        patient({ id: 2, name: "Malee", gender: "Female", birth_date: null }),
        patient({ id: 3, name: "Noname", gender: null, birth_date: null }),
      ]),
    );
    const { container } = renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    expect(container.querySelector(".anticon-man")).toBeInTheDocument();
    expect(container.querySelector(".anticon-woman")).toBeInTheDocument();
    expect(screen.getByText("15/01/1990")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2); // missing birthdate + missing gender
  });

  it("creates a new patient, sending a null birth_date when left blank", async () => {
    PatientService.getPatientPage.mockResolvedValueOnce(pageOf([])).mockResolvedValueOnce(pageOf([patient()]));
    PatientService.createPatient.mockResolvedValue(patient());
    renderWithTheme();
    await waitFor(() => expect(PatientService.getPatientPage).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Patient/i }));
    fireEvent.change(await screen.findByPlaceholderText("First Name"), { target: { value: "Somchai" } });
    await selectGender("ชาย (Male)");
    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    await waitFor(() =>
      expect(PatientService.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Somchai", gender: "Male", birth_date: null }),
      ),
    );
    expect(PatientService.updatePatient).not.toHaveBeenCalled();
    await waitFor(() => expect(PatientService.getPatientPage).toHaveBeenCalledTimes(2));
  });

  it("edits an existing patient via updatePatient, round-tripping the pre-filled birth_date", async () => {
    PatientService.getPatientPage.mockResolvedValue(pageOf([patient({ birth_date: "1990-01-01" })]));
    PatientService.updatePatient.mockResolvedValue(patient({ name: "Somchai Updated" }));
    const { container } = renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    fireEvent.click(container.querySelector('[aria-label="edit"]').closest("button"));
    const nameInput = await screen.findByPlaceholderText("First Name");
    expect(nameInput).toHaveValue("Somchai");
    expect(screen.getByDisplayValue("1990-01-01")).toBeInTheDocument(); // birth_date pre-filled as dayjs, formatted back
    fireEvent.change(nameInput, { target: { value: "Somchai Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Patient" }));

    await waitFor(() =>
      expect(PatientService.updatePatient).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Somchai Updated", birth_date: "1990-01-01" }),
      ),
    );
    expect(PatientService.createPatient).not.toHaveBeenCalled();
  });

  it("shows the server-provided detail message when saving fails", async () => {
    PatientService.getPatientPage.mockResolvedValue(pageOf([]));
    PatientService.createPatient.mockRejectedValue({ response: { data: { detail: "HN already exists" } } });
    renderWithTheme();
    await waitFor(() => expect(PatientService.getPatientPage).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Patient/i }));
    fireEvent.change(await screen.findByPlaceholderText("First Name"), { target: { value: "Somchai" } });
    await selectGender("ชาย (Male)");
    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    expect(await screen.findByText("HN already exists")).toBeInTheDocument();
  });

  it("deletes a patient after confirming", async () => {
    PatientService.getPatientPage.mockResolvedValue(pageOf([patient()]));
    PatientService.deletePatient.mockResolvedValue({});
    const { container } = renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(PatientService.deletePatient).toHaveBeenCalledWith(1));
    await waitFor(() => expect(PatientService.getPatientPage).toHaveBeenCalledTimes(2));
  });

  it("shows why the server refused a delete (patient still has cases)", async () => {
    PatientService.getPatientPage.mockResolvedValue(pageOf([patient()]));
    PatientService.deletePatient.mockRejectedValue({
      response: { status: 409, data: { detail: "ลบคนไข้รายนี้ไม่ได้ เพราะยังมีเคสในระบบ (Gyne 1)" } },
    });
    const { container } = renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(await screen.findByText("ลบคนไข้รายนี้ไม่ได้ เพราะยังมีเคสในระบบ (Gyne 1)")).toBeInTheDocument();
  });

  it("shows an error message when loading patients fails", async () => {
    PatientService.getPatientPage.mockRejectedValue(new Error("network error"));
    renderWithTheme();

    expect(await screen.findByText("โหลดข้อมูลคนไข้ไม่สำเร็จ")).toBeInTheDocument();
  });
});

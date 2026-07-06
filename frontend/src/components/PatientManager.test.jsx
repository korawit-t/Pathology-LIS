import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../contexts/ThemeContext";
import PatientManager from "./PatientManager";
import PatientService from "../services/patientService";
import TitleService from "../services/titleService";

vi.mock("../services/patientService", () => ({
  default: {
    getPatients: vi.fn(),
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

const selectGender = async (label) => {
  fireEvent.mouseDown(screen.getByText("Select Gender"));
  fireEvent.click(await screen.findByTitle(label));
};

beforeEach(() => {
  vi.clearAllMocks();
  TitleService.getTitles.mockResolvedValue([{ id: 1, title: "Mr." }, { id: 2, title: "Mrs." }]);
});

describe("PatientManager", () => {
  it("loads and displays patients sorted by id", async () => {
    PatientService.getPatients.mockResolvedValue([
      patient({ id: 2, name: "Wichai", ln: "", title: null }),
      patient({ id: 1, name: "Somchai" }),
    ]);
    renderWithTheme();

    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());
    const cids = screen.getAllByText("1111111111111");
    expect(cids).toHaveLength(2);
    // id 1 (Somchai) should render before id 2 (Wichai) once sorted
    const rows = document.querySelectorAll("tbody tr");
    expect(rows[0].textContent).toMatch(/Somchai/);
    expect(rows[1].textContent).toMatch(/Wichai/);
  });

  it("filters by name (case-insensitive) or CID substring", async () => {
    PatientService.getPatients.mockResolvedValue([
      patient({ id: 1, name: "Somchai", cid: "1111111111111" }),
      patient({ id: 2, name: "Wichai", cid: "2222222222222" }),
    ]);
    renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Search by Name or CID"), { target: { value: "somc" } });
    expect(screen.queryByText(/Wichai/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search by Name or CID"), { target: { value: "2222222222222" } });
    expect(screen.getByText(/Wichai/)).toBeInTheDocument();
    expect(screen.queryByText(/Somchai/)).not.toBeInTheDocument();
  });

  it("renders gender icons for Male/Female, a Tag fallback otherwise, and a formatted birthdate", async () => {
    PatientService.getPatients.mockResolvedValue([
      patient({ id: 1, name: "Somchai", gender: "Male", birth_date: "1990-01-15" }),
      patient({ id: 2, name: "Malee", gender: "Female", birth_date: null }),
      patient({ id: 3, name: "Noname", gender: null, birth_date: null }),
    ]);
    const { container } = renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    expect(container.querySelector(".anticon-man")).toBeInTheDocument();
    expect(container.querySelector(".anticon-woman")).toBeInTheDocument();
    expect(screen.getByText("15/01/1990")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2); // missing birthdate + missing gender
  });

  it("creates a new patient, sending a null birth_date when left blank", async () => {
    PatientService.getPatients.mockResolvedValueOnce([]).mockResolvedValueOnce([patient()]);
    PatientService.createPatient.mockResolvedValue(patient());
    renderWithTheme();
    await waitFor(() => expect(PatientService.getPatients).toHaveBeenCalledTimes(1));

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
  });

  it("edits an existing patient via updatePatient, round-tripping the pre-filled birth_date", async () => {
    PatientService.getPatients.mockResolvedValue([patient({ birth_date: "1990-01-01" })]);
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
    PatientService.getPatients.mockResolvedValue([]);
    PatientService.createPatient.mockRejectedValue({ response: { data: { detail: "HN already exists" } } });
    renderWithTheme();
    await waitFor(() => expect(PatientService.getPatients).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Add Patient/i }));
    fireEvent.change(await screen.findByPlaceholderText("First Name"), { target: { value: "Somchai" } });
    await selectGender("ชาย (Male)");
    fireEvent.click(screen.getByRole("button", { name: "Create Patient" }));

    expect(await screen.findByText("HN already exists")).toBeInTheDocument();
  });

  it("deletes a patient after confirming", async () => {
    PatientService.getPatients.mockResolvedValue([patient()]);
    PatientService.deletePatient.mockResolvedValue({});
    const { container } = renderWithTheme();
    await waitFor(() => expect(screen.getByText(/Somchai/)).toBeInTheDocument());

    fireEvent.click(container.querySelector(".ant-btn-dangerous"));
    fireEvent.click(await screen.findByText("ยืนยันการลบ?"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(PatientService.deletePatient).toHaveBeenCalledWith(1));
  });

  it("shows an error message when loading patients fails", async () => {
    PatientService.getPatients.mockRejectedValue(new Error("network error"));
    renderWithTheme();

    expect(await screen.findByText("โหลดข้อมูลคนไข้/Master Data ไม่สำเร็จ")).toBeInTheDocument();
  });
});

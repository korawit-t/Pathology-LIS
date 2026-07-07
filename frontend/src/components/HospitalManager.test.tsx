import { render, screen, fireEvent, within } from "@testing-library/react";
import HospitalManager from "./HospitalManager";
import HospitalService from "../services/hospitalService";
import { Hospital } from "../types/hospital";

vi.mock("../services/hospitalService");
vi.mock("./SecureImage", () => ({
  useSecureSrc: () => undefined,
}));

const makeHospital = (overrides: Partial<Hospital> = {}): Hospital => ({
  id: 1,
  name: "Test Hospital",
  code: "H001",
  address: "123 Main St",
  use_custom_report_header: false,
  logo_path: null,
  ...overrides,
});

const mockedGetHospitals = HospitalService.getHospitals as unknown as ReturnType<typeof vi.fn>;

describe("HospitalManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Laboratory Name (EN) and Short Name (EN) fields when editing a hospital", async () => {
    mockedGetHospitals.mockResolvedValue([makeHospital()]);

    const { container } = render(<HospitalManager />);
    await screen.findByText("Test Hospital");

    const editButton = container.querySelector(".anticon-edit")?.closest("button");
    expect(editButton).toBeTruthy();
    fireEvent.click(editButton as HTMLButtonElement);

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Laboratory Name (EN)")).toBeInTheDocument();
    expect(within(modal).getByText("Short Name (EN)")).toBeInTheDocument();
  });

  it("shows the same fields when adding a new hospital", async () => {
    mockedGetHospitals.mockResolvedValue([]);

    render(<HospitalManager />);

    fireEvent.click(await screen.findByRole("button", { name: /add hospital/i }));

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Laboratory Name (EN)")).toBeInTheDocument();
    expect(within(modal).getByText("Short Name (EN)")).toBeInTheDocument();
  });

  it("renders Master in the Report Header column when the hospital has no override", async () => {
    mockedGetHospitals.mockResolvedValue([makeHospital({ use_custom_report_header: false })]);

    render(<HospitalManager />);

    expect(await screen.findByText("Master")).toBeInTheDocument();
  });
});

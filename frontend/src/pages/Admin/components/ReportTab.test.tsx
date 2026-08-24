import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReportTab from "./ReportTab";
import SystemSettingService from "../../../services/systemSettingService";
import { SystemSetting } from "../../../types/system";
import { ThemeProvider } from "../../../contexts/ThemeContext";

vi.mock("../../../services/systemSettingService");

const mockedGet = SystemSettingService.getSettings as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = SystemSettingService.updateSettings as unknown as ReturnType<typeof vi.fn>;

const makeSetting = (overrides: Partial<SystemSetting> = {}): SystemSetting =>
  ({
    id: 1,
    hospital_slug: "master",
    surgical_accession_prefix: "S",
    gyne_accession_prefix: "C",
    nongyne_accession_prefix: "N",
    molecular_accession_prefix: "M",
    show_specimen_name: true,
    is_cumulative_report: true,
    cumulative_report_newest_first: true,
    ...overrides,
  } as unknown as SystemSetting);

const renderTab = () =>
  render(
    <ThemeProvider>
      <ReportTab />
    </ThemeProvider>,
  );

describe("ReportTab accession prefixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdate.mockResolvedValue(makeSetting());
  });

  /** "Surgical", "Gyne Cytology" and "Non-Gyne Cytology" each label two fields
   *  on this tab — an accession prefix and a report footer — so the prefix
   *  inputs are addressed by their placeholder (the default letter) instead. */
  const prefixInput = (placeholder: string) =>
    screen.getByPlaceholderText(placeholder) as HTMLInputElement;

  /** Regression: molecular was the one case type whose prefix had no field
   *  here and no slot in the backend schema, so it was stuck on "M". */
  it("offers a prefix field for all four case types", async () => {
    mockedGet.mockResolvedValue(makeSetting());

    renderTab();

    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(prefixInput("S")).toBeInTheDocument();
    expect(prefixInput("C")).toBeInTheDocument();
    expect(prefixInput("N")).toBeInTheDocument();
    expect(prefixInput("M")).toBeInTheDocument();
  });

  it("loads the saved molecular prefix and sends an edit back", async () => {
    mockedGet.mockResolvedValue(makeSetting({ molecular_accession_prefix: "MX" }));

    renderTab();

    await waitFor(() => expect(prefixInput("M").value).toBe("MX"));

    fireEvent.change(prefixInput("M"), { target: { value: "ZQ" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          surgical_accession_prefix: "S",
          gyne_accession_prefix: "C",
          nongyne_accession_prefix: "N",
          molecular_accession_prefix: "ZQ",
        }),
      ),
    );
  });
});

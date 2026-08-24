import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BarcodeTab from "./BarcodeTab";
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
    barcode_opd_prefix: "5",
    barcode_ipd_prefix: "6",
    barcode_surgical_type_code: "21",
    barcode_gyne_type_code: "22",
    barcode_nongyne_type_code: "23",
    ...overrides,
  } as unknown as SystemSetting);

const renderTab = () =>
  render(
    <ThemeProvider>
      <BarcodeTab />
    </ThemeProvider>,
  );

/** The inputs are unlabelled (the description text sits in a sibling column),
 *  so they're addressed by their placeholder — which is the default code. */
const input = (placeholder: string) =>
  screen.getByPlaceholderText(placeholder) as HTMLInputElement;

describe("BarcodeTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdate.mockResolvedValue(makeSetting());
  });

  /** Regression: the barcode codes were absent from the backend's admin read
   *  schema, so the settings screen came back blank after every save even
   *  though the save itself returned 200. */
  it("populates every field from the saved settings", async () => {
    mockedGet.mockResolvedValue(makeSetting());

    renderTab();

    await waitFor(() => expect(input("2").value).toBe("5"));
    expect(input("3").value).toBe("6");
    expect(input("08").value).toBe("21");
    expect(input("09").value).toBe("22");
    expect(input("10").value).toBe("23");
  });

  it("sends the edited codes on save and reloads them", async () => {
    mockedGet.mockResolvedValue(makeSetting());

    renderTab();
    await waitFor(() => expect(input("08").value).toBe("21"));

    fireEvent.change(input("08"), { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode_opd_prefix: "5",
          barcode_ipd_prefix: "6",
          barcode_surgical_type_code: "31",
          barcode_gyne_type_code: "22",
          barcode_nongyne_type_code: "23",
        }),
      ),
    );
    // The tab re-reads after saving rather than trusting local form state.
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });

  it("previews the barcode pattern using the codes currently in the form", async () => {
    mockedGet.mockResolvedValue(makeSetting());

    renderTab();

    await waitFor(() => expect(screen.getByText("521VN001234")).toBeInTheDocument());
    expect(screen.getByText("621AN001234")).toBeInTheDocument();
    expect(screen.getByText("522VN001234")).toBeInTheDocument();
    expect(screen.getByText("523VN001234")).toBeInTheDocument();
  });
});

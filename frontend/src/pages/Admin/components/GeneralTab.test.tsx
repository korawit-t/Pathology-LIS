import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import GeneralTab from "./GeneralTab";
import SystemSettingService from "../../../services/systemSettingService";
import { SystemSetting } from "../../../types/system";

vi.mock("../../../services/systemSettingService");
vi.mock("../../../components/SecureImage", () => ({
  useSecureSrc: () => undefined,
}));

const makeSetting = (overrides: Partial<SystemSetting> = {}): SystemSetting =>
  ({
    id: 1,
    hospital_slug: "master",
    lab_name_th: "ห้องปฏิบัติการ",
    lab_name_en: "Master Lab",
    lab_address: "Master Address",
    report_logo_url: undefined,
    login_logo_url: undefined,
    ...overrides,
  } as unknown as SystemSetting);

const mockedGetAllSettings = SystemSettingService.getAllSettings as unknown as ReturnType<typeof vi.fn>;

describe("GeneralTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Laboratory Address and Report Header Logo when editing the master row", async () => {
    mockedGetAllSettings.mockResolvedValue([
      makeSetting({ id: 1, hospital_slug: "master" }),
    ]);

    render(<GeneralTab />);

    const editButton = await screen.findByRole("button", { name: /edit/i });
    fireEvent.click(editButton);

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Laboratory Address")).toBeInTheDocument();
    expect(within(modal).getByText("Report Header Logo")).toBeInTheDocument();
    expect(within(modal).getByText("Login Page Logo")).toBeInTheDocument();
  });

  it("hides Laboratory Address and Report Header Logo when editing a non-master row", async () => {
    mockedGetAllSettings.mockResolvedValue([
      makeSetting({ id: 2, hospital_slug: "clinic-b", lab_name_en: "Clinic B" }),
    ]);

    render(<GeneralTab />);

    const editButton = await screen.findByRole("button", { name: /edit/i });
    fireEvent.click(editButton);

    const modal = await screen.findByRole("dialog");
    expect(within(modal).queryByText("Laboratory Address")).not.toBeInTheDocument();
    expect(within(modal).queryByText("Report Header Logo")).not.toBeInTheDocument();
    expect(within(modal).getByText("Login Page Logo")).toBeInTheDocument();
  });

  it("hides both fields when creating a brand new login page", async () => {
    mockedGetAllSettings.mockResolvedValue([]);

    render(<GeneralTab />);

    await waitFor(() => expect(mockedGetAllSettings).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /create new login page/i }));

    const modal = await screen.findByRole("dialog");
    expect(within(modal).queryByText("Laboratory Address")).not.toBeInTheDocument();
    expect(within(modal).queryByText("Report Header Logo")).not.toBeInTheDocument();
    expect(within(modal).queryByText("Login Page Logo")).not.toBeInTheDocument();
  });
});

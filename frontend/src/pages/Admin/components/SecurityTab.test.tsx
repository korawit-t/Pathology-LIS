import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SecurityTab from "./SecurityTab";
import SystemSettingService from "../../../services/systemSettingService";
import { SystemSetting } from "../../../types/system";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import AuthService from "../../../services/authService";

vi.mock("../../../services/systemSettingService");
vi.mock("../../../services/authService");

const mockedGet = SystemSettingService.getSettings as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = SystemSettingService.updateSettings as unknown as ReturnType<typeof vi.fn>;

const makeSetting = (overrides: Partial<SystemSetting> = {}): SystemSetting =>
  ({
    id: 1,
    hospital_slug: "master",
    idle_timeout_minutes: 10,
    idle_warning_minutes: 1,
    password_min_length: 8,
    password_expiry_days: 0,
    mfa_enabled: false,
    mfa_required_roles: [],
    mfa_grace_period_days: 7,
    mfa_trusted_device_days: 14,
    mfa_step_up_minutes: 0,
    ...overrides,
  } as unknown as SystemSetting);

const renderTab = () =>
  render(
    <ThemeProvider>
      <SecurityTab />
    </ThemeProvider>,
  );

/** antd renders a multiple-mode Select's placeholder as a span, not a real
 *  placeholder attribute, so the disabled state has to be read off the
 *  wrapper class rather than queried semantically. */
const roleSelect = (container: HTMLElement) =>
  container.querySelector(".ant-select");

describe("SecurityTab — multi-factor authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(makeSetting());
    mockedUpdate.mockResolvedValue(makeSetting());
  });

  it("shows the MFA controls", async () => {
    renderTab();

    expect(await screen.findByText("Require a second factor")).toBeInTheDocument();
    expect(screen.getByText("Roles that must enrol")).toBeInTheDocument();
    expect(screen.getByText("Remember a device for")).toBeInTheDocument();
  });

  it("keeps the policy inputs disabled while the master switch is off", async () => {
    // Setting a grace period on an installation that has MFA switched off says
    // nothing and invites the reading that it does.
    const { container } = renderTab();
    await screen.findByText("Require a second factor");

    expect(roleSelect(container)?.className).toContain("ant-select-disabled");
  });

  it("enables them once the switch is on", async () => {
    const { container } = renderTab();
    await screen.findByText("Require a second factor");

    fireEvent.click(screen.getAllByRole("switch")[0]);

    await waitFor(() =>
      expect(roleSelect(container)?.className).not.toContain("ant-select-disabled"),
    );
  });

  it("warns that turning it on enrols nobody", async () => {
    // The likeliest misreading of this screen: flipping the switch and assuming
    // everyone is now protected.
    mockedGet.mockResolvedValue(makeSetting({ mfa_enabled: true }));
    renderTab();

    expect(await screen.findByText(/Users enrol themselves/)).toBeInTheDocument();
    expect(screen.getByText(/no printed recovery codes/)).toBeInTheDocument();
  });

  it("does not show that warning when MFA is off", async () => {
    renderTab();
    await screen.findByText("Require a second factor");

    expect(screen.queryByText(/Users enrol themselves/)).not.toBeInTheDocument();
  });

  it("saves the policy", async () => {
    mockedGet.mockResolvedValue(makeSetting({ mfa_enabled: true }));
    renderTab();
    await screen.findByText("Require a second factor");

    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0][0]).toMatchObject({ mfa_enabled: true });
  });

  it("explains what a zero-day trusted-device setting means", async () => {
    mockedGet.mockResolvedValue(
      makeSetting({ mfa_enabled: true, mfa_trusted_device_days: 0 }),
    );
    renderTab();

    expect(await screen.findByText(/a code is required at every login/)).toBeInTheDocument();
  });

  it("says plainly when nothing will be asked before sign-out", async () => {
    // The default. An administrator reading this row has to be able to tell
    // that report sign-out goes straight through — the previous wording
    // promised the opposite on every install.
    mockedGet.mockResolvedValue(
      makeSetting({ mfa_enabled: true, mfa_step_up_minutes: 0 }),
    );
    renderTab();

    expect(await screen.findByText(/Never asks/)).toBeInTheDocument();
  });

  it("names the window once the re-check is switched on", async () => {
    mockedGet.mockResolvedValue(
      makeSetting({ mfa_enabled: true, mfa_step_up_minutes: 30 }),
    );
    renderTab();

    expect(
      await screen.findByText(/stays quiet for 30 minutes/),
    ).toBeInTheDocument();
  });

  it("warns when the window is set low enough to interrupt a sign-out session", async () => {
    // The one misconfiguration worth catching in the UI: administrators read
    // the number as "per case" and pick something small.
    mockedGet.mockResolvedValue(
      makeSetting({ mfa_enabled: true, mfa_step_up_minutes: 5 }),
    );
    renderTab();

    expect(
      await screen.findByText(/interrupted every case or two/),
    ).toBeInTheDocument();
  });

  it("says the grace period is not enforced yet", async () => {
    // Otherwise an administrator sets it and reasonably expects it to bite.
    mockedGet.mockResolvedValue(makeSetting({ mfa_enabled: true }));
    renderTab();

    expect(await screen.findByText(/not yet enforced/)).toBeInTheDocument();
  });
});

describe("SecurityTab — saving behind the step-up guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(makeSetting({ mfa_enabled: true }));
  });

  it("prompts to confirm identity instead of reporting a failure", async () => {
    // Settings is one of the guarded actions. Without this the save just fails,
    // and since this screen owns the master switch, turning MFA on would make
    // turning it off again impossible from the UI.
    mockedUpdate.mockRejectedValue({
      response: { status: 403, data: { detail: "step_up_required" } },
    });
    renderTab();
    await screen.findByText("Require a second factor");

    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));

    expect(await screen.findByPlaceholderText("Code or password")).toBeInTheDocument();
    expect(screen.queryByText("Failed to save security settings")).not.toBeInTheDocument();
  });

  it("retries the save once identity is confirmed", async () => {
    mockedUpdate
      .mockRejectedValueOnce({ response: { status: 403, data: { detail: "step_up_required" } } })
      .mockResolvedValueOnce(makeSetting());
    (AuthService.stepUp as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    renderTab();
    await screen.findByText("Require a second factor");
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));

    fireEvent.change(await screen.findByPlaceholderText("Code or password"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
  });

  it("still reports an ordinary failure as a failure", async () => {
    mockedUpdate.mockRejectedValue({ response: { status: 500 } });
    renderTab();
    await screen.findByText("Require a second factor");

    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));

    expect(await screen.findByText("Failed to save security settings")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Code or password")).not.toBeInTheDocument();
  });
});

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import UserManager from "./UserManager";
import UserService from "../services/userService";
import HospitalService from "../services/hospitalService";
import PositionService from "../services/positionService";
import AuthService from "../services/authService";
import SystemSettingService from "../services/systemSettingService";
import { ThemeProvider } from "../contexts/ThemeContext";

vi.mock("../services/userService");
vi.mock("../services/hospitalService");
vi.mock("../services/positionService");
vi.mock("../services/authService");
vi.mock("../services/systemSettingService");

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "boss", roles: ["admin"] } }),
}));

const mockedGetUsers = UserService.getUsers as unknown as ReturnType<typeof vi.fn>;
const mockedResetMfa = UserService.resetMfa as unknown as ReturnType<typeof vi.fn>;
const mockedStepUp = AuthService.stepUp as unknown as ReturnType<typeof vi.fn>;

const enrolled = {
  id: 2,
  username: "drsmith",
  full_name: "Dr Smith",
  roles: ["pathologist"],
  status: true,
  mfa_enabled: true,
  hospital_ids: [],
};

const notEnrolled = { ...enrolled, id: 3, username: "nurse", mfa_enabled: false };

const renderManager = () =>
  render(
    <ThemeProvider>
      <UserManager />
    </ThemeProvider>,
  );

const clickReset = async (username: string) => {
  fireEvent.click(
    await screen.findByRole("button", {
      name: `Reset two-factor authentication for ${username}`,
    }),
  );
  const popup = await screen.findByRole("tooltip");
  fireEvent.click(within(popup).getByRole("button", { name: "Reset" }));
};

describe("UserManager — two-factor column and reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUsers.mockResolvedValue([enrolled, notEnrolled]);
    (HospitalService.getHospitals as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PositionService.getPositions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    mockedResetMfa.mockResolvedValue(undefined);
  });

  it("shows who has a second factor", async () => {
    renderManager();

    expect(await screen.findByText("drsmith")).toBeInTheDocument();
    expect(screen.getAllByText("On").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Off").length).toBeGreaterThan(0);
  });

  it("only offers a reset for users who have one", async () => {
    renderManager();
    await screen.findByText("drsmith");

    expect(
      screen.getByRole("button", { name: /Reset two-factor authentication for drsmith/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reset two-factor authentication for nurse/ }),
    ).not.toBeInTheDocument();
  });

  it("resets after confirmation", async () => {
    renderManager();
    await screen.findByText("drsmith");

    await clickReset("drsmith");

    await waitFor(() => expect(mockedResetMfa).toHaveBeenCalledWith(2));
  });

  it("asks the administrator to confirm their own identity first, then retries", async () => {
    // The endpoint refuses with step_up_required when the caller has MFA of
    // their own. Losing the target across that round trip would mean asking the
    // administrator to find the row again, so it is held and replayed.
    mockedResetMfa
      .mockRejectedValueOnce({
        response: { status: 403, data: { detail: "step_up_required" } },
      })
      .mockResolvedValueOnce(undefined);
    mockedStepUp.mockResolvedValue({});

    renderManager();
    await screen.findByText("drsmith");
    await clickReset("drsmith");

    // The prompt names the action, so nobody confirms something they did not mean.
    expect(
      await screen.findByText(/reset two-factor authentication for drsmith/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Code or password"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mockedStepUp).toHaveBeenCalledWith("123456"));
    await waitFor(() => expect(mockedResetMfa).toHaveBeenCalledTimes(2));
  });

  it("does not prompt for a step-up on an ordinary refusal", async () => {
    // A bare 403 means the caller may not do this at all; a prompt would be
    // asking them to prove something that would not help.
    mockedResetMfa.mockRejectedValue({
      response: { status: 403, data: { detail: "Insufficient permissions" } },
    });

    renderManager();
    await screen.findByText("drsmith");
    await clickReset("drsmith");

    await waitFor(() => expect(mockedResetMfa).toHaveBeenCalled());
    expect(screen.queryByPlaceholderText("Code or password")).not.toBeInTheDocument();
  });
});

describe("UserManager — password rules", () => {
  const mockedCreateUser = UserService.createUser as unknown as ReturnType<typeof vi.fn>;
  const mockedUpdateUser = UserService.updateUser as unknown as ReturnType<typeof vi.fn>;
  const mockedPublicSettings =
    SystemSettingService.getPublicSettings as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetUsers.mockResolvedValue([{ ...notEnrolled, position_id: 1 }]);
    (HospitalService.getHospitals as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PositionService.getPositions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: "Nurse" },
    ]);
    mockedPublicSettings.mockResolvedValue({ password_min_length: 8 });
  });

  const openCreate = async () => {
    renderManager();
    await screen.findByText("nurse");
    fireEvent.click(screen.getByRole("button", { name: /Add New User/ }));
    await screen.findByText("Create New User");
  };

  const passwordInput = () =>
    document.querySelector<HTMLInputElement>('[role="dialog"] input#password')!;

  it("says why a short password is refused before sending it", async () => {
    renderManager();
    await screen.findByText("nurse");

    fireEvent.click(screen.getByRole("button", { name: /Add New User/ }));
    await screen.findByText("Create New User");
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();

    fireEvent.change(passwordInput(), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));

    expect(
      await screen.findByText("Password must be at least 8 characters long."),
    ).toBeInTheDocument();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it("holds the form to the Security tab's Minimum Password Length", async () => {
    mockedPublicSettings.mockResolvedValue({ password_min_length: 12 });
    await openCreate();

    expect(await screen.findByText("At least 12 characters")).toBeInTheDocument();
    fireEvent.change(passwordInput(), { target: { value: "ten_chars!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));

    expect(
      await screen.findByText("Password must be at least 12 characters long."),
    ).toBeInTheDocument();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it("never asks for less than 8, whatever the setting says", async () => {
    mockedPublicSettings.mockResolvedValue({ password_min_length: 6 });
    await openCreate();

    expect(await screen.findByText("At least 8 characters")).toBeInTheDocument();
  });

  it("keeps the floor and the user list when the policy cannot be read", async () => {
    mockedPublicSettings.mockRejectedValue(new Error("offline"));
    await openCreate();

    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
  });

  it("marks the field a 422 names instead of showing nothing", async () => {
    // FastAPI's schema errors arrive as a list, not a string; passing that
    // list to message.error rendered no reason at all.
    mockedUpdateUser.mockRejectedValue({
      response: {
        status: 422,
        data: {
          detail: [
            {
              type: "string_too_short",
              loc: ["body", "password"],
              msg: "String should have at least 12 characters",
              ctx: { min_length: 12 },
            },
          ],
        },
      },
    });

    renderManager();
    await screen.findByText("nurse");

    fireEvent.click(document.querySelector<HTMLButtonElement>(".anticon-edit")!.closest("button")!);
    await screen.findByText("Edit User");

    fireEvent.change(passwordInput(), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Update User" }));

    await waitFor(() => expect(mockedUpdateUser).toHaveBeenCalled());
    expect(
      await screen.findByText("Must be at least 12 characters long."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Password: Must be at least 12 characters long\./),
    ).toBeInTheDocument();
  });

  it("leaves the password optional when editing", async () => {
    mockedUpdateUser.mockResolvedValue({});

    renderManager();
    await screen.findByText("nurse");

    fireEvent.click(document.querySelector<HTMLButtonElement>(".anticon-edit")!.closest("button")!);
    await screen.findByText("Edit User");
    fireEvent.click(screen.getByRole("button", { name: "Update User" }));

    await waitFor(() => expect(mockedUpdateUser).toHaveBeenCalled());
    expect(mockedUpdateUser.mock.calls[0][1]).not.toHaveProperty("password");
  });
});

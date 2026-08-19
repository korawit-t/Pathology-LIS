import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";
import AuthService from "../../services/authService";
import SystemSettingService from "../../services/systemSettingService";
import { SystemSetting } from "../../types/system";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../../services/authService");
vi.mock("../../services/systemSettingService");
// __APP_VERSION__ is a Vite `define` global (see vite.config.js) that isn't
// wired up in vitest.config.ts, so it's undefined under Vitest.
vi.mock("../../constants/app.constants", () => ({ APP_VERSION: "test" }));

const { mockHandleLoginSuccess } = vi.hoisted(() => ({
  mockHandleLoginSuccess: vi.fn(),
}));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ handleLoginSuccess: mockHandleLoginSuccess }),
}));

const mockedLogin = AuthService.login as unknown as ReturnType<typeof vi.fn>;
const mockedCompleteMfa =
  AuthService.completeMfaLogin as unknown as ReturnType<typeof vi.fn>;
const mockedGetPublicSettings =
  SystemSettingService.getPublicSettings as unknown as ReturnType<typeof vi.fn>;

const makeSetting = (overrides: Partial<SystemSetting> = {}): SystemSetting =>
  ({
    id: 1,
    hospital_slug: "master",
    lab_name_th: "ห้องปฏิบัติการ",
    lab_name_en: "Master Lab",
    login_announcement: null,
    ...overrides,
  } as unknown as SystemSetting);

const renderLogin = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard Home</div>} />
          <Route path="/results" element={<div>Results Home</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetPublicSettings.mockResolvedValue(makeSetting());
    mockHandleLoginSuccess.mockReturnValue({ status: "success" });
  });

  it("renders the login form once branding has loaded", async () => {
    renderLogin();

    expect(await screen.findByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("shows validation errors and does not call the API when submitted empty", async () => {
    renderLogin();
    await screen.findByPlaceholderText("Username");

    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Please enter your username.")).toBeInTheDocument();
    expect(await screen.findByText("Please enter your password.")).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("logs in successfully and navigates to the home route for the user's role", async () => {
    mockedLogin.mockResolvedValue({ data: { token_type: "bearer", roles: ["admin"] } });
    renderLogin();
    await screen.findByPlaceholderText("Username");

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Dashboard Home")).toBeInTheDocument();
    expect(mockedLogin).toHaveBeenCalledWith({ username: "alice", password: "s3cret" });
    expect(mockHandleLoginSuccess).toHaveBeenCalledWith({ token_type: "bearer", roles: ["admin"] });
  });

  it("navigates to the referral portal route for a clinician login", async () => {
    mockedLogin.mockResolvedValue({ data: { token_type: "bearer", roles: ["clinician"] } });
    renderLogin();
    await screen.findByPlaceholderText("Username");

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "bob" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Results Home")).toBeInTheDocument();
  });

  it("shows the server-provided error message on invalid credentials (401) and clears the password field", async () => {
    mockedLogin.mockRejectedValue({
      response: { status: 401, data: { detail: "Invalid username or password." } },
    });
    renderLogin();
    await screen.findByPlaceholderText("Username");

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Invalid username or password.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Password")).toHaveValue(""),
    );
    expect(mockHandleLoginSuccess).not.toHaveBeenCalled();
  });

  it("shows a rate-limit message on 429", async () => {
    mockedLogin.mockRejectedValue({ response: { status: 429 } });
    renderLogin();
    await screen.findByPlaceholderText("Username");

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(
      await screen.findByText("Too many login attempts. Please wait a moment and try again."),
    ).toBeInTheDocument();
  });

  it("shows a generic error message on an unexpected failure", async () => {
    mockedLogin.mockRejectedValue(new Error("Network Error"));
    renderLogin();
    await screen.findByPlaceholderText("Username");

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(
      await screen.findByText("An error occurred during login. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows a warning and does not navigate home when a password change is forced", async () => {
    mockedLogin.mockResolvedValue({ data: { token_type: "bearer", roles: ["admin"] } });
    mockHandleLoginSuccess.mockReturnValue({ status: "force_change" });
    renderLogin();
    await screen.findByPlaceholderText("Username");

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "temp1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(
      await screen.findByText("Please change your temporary password before continuing."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Home")).not.toBeInTheDocument();
  });
});

describe("Login — two-step with a second factor", () => {
  const CHALLENGE = { data: { mfa_required: true, mfa_token: "challenge-token" } };
  const SESSION = { data: { token_type: "bearer", roles: ["admin"] } };

  const submitCredentials = async () => {
    renderLogin();
    await screen.findByPlaceholderText("Username");
    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetPublicSettings.mockResolvedValue(makeSetting());
    mockHandleLoginSuccess.mockReturnValue({ status: "success" });
  });

  it("asks for a code instead of logging in when the server sends a challenge", async () => {
    mockedLogin.mockResolvedValue(CHALLENGE);
    await submitCredentials();

    expect(await screen.findByPlaceholderText("6-digit code")).toBeInTheDocument();
    // Nothing is logged in yet — the session only exists after the second step.
    expect(mockHandleLoginSuccess).not.toHaveBeenCalled();
  });

  it("completes the login once a valid code is entered", async () => {
    mockedLogin.mockResolvedValue(CHALLENGE);
    mockedCompleteMfa.mockResolvedValue(SESSION);
    await submitCredentials();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Dashboard Home")).toBeInTheDocument();
    expect(mockedCompleteMfa).toHaveBeenCalledWith("challenge-token", "123456", false);
  });

  it("passes the remember-device choice through", async () => {
    mockedLogin.mockResolvedValue(CHALLENGE);
    mockedCompleteMfa.mockResolvedValue(SESSION);
    await submitCredentials();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(mockedCompleteMfa).toHaveBeenCalledWith("challenge-token", "123456", true),
    );
  });

  it("does not remember the device unless the box is ticked", async () => {
    mockedLogin.mockResolvedValue(CHALLENGE);
    mockedCompleteMfa.mockResolvedValue(SESSION);
    await submitCredentials();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(mockedCompleteMfa).toHaveBeenCalledWith("challenge-token", "123456", false),
    );
  });

  it("keeps the user on the code step when the code is rejected", async () => {
    mockedLogin.mockResolvedValue(CHALLENGE);
    mockedCompleteMfa.mockRejectedValue({
      response: { status: 401, data: { detail: "That code is not valid." } },
    });
    await submitCredentials();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("That code is not valid.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("6-digit code")).toBeInTheDocument();
    expect(mockHandleLoginSuccess).not.toHaveBeenCalled();
  });

  it("can go back to the credentials step", async () => {
    // The challenge expires after five minutes and is single-use, so retyping
    // the code is not always enough to recover — there has to be a way back.
    mockedLogin.mockResolvedValue(CHALLENGE);
    await submitCredentials();
    await screen.findByPlaceholderText("6-digit code");

    fireEvent.click(screen.getByRole("button", { name: /Start again/ }));

    expect(await screen.findByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("6-digit code")).not.toBeInTheDocument();
  });

  it("does not send the username or password to the second step", async () => {
    mockedLogin.mockResolvedValue(CHALLENGE);
    mockedCompleteMfa.mockResolvedValue(SESSION);
    await submitCredentials();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(mockedCompleteMfa).toHaveBeenCalled());
    const args = JSON.stringify(mockedCompleteMfa.mock.calls[0]);
    expect(args).not.toContain("s3cret");
    expect(args).not.toContain("alice");
  });
});

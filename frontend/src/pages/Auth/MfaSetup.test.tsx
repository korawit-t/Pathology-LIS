import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MfaSetup from "./MfaSetup";
import AuthService from "../../services/authService";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../../services/authService");

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { roles: ["admin"], position_name: null } }),
}));

const mockedStart = AuthService.startMfaSetup as unknown as ReturnType<typeof vi.fn>;
const mockedConfirm = AuthService.confirmMfaSetup as unknown as ReturnType<typeof vi.fn>;

const SETUP = {
  data: {
    provisioning_uri: "otpauth://totp/Pathology%20LIS:alice?secret=JBSWY3DPEHPK3PXP",
    secret: "JBSWY3DPEHPK3PXP",
    issuer: "Pathology LIS",
    account_name: "alice",
  },
};

const renderSetup = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/mfa-setup"]}>
        <Routes>
          <Route path="/mfa-setup" element={<MfaSetup />} />
          <Route path="/dashboard" element={<div>Dashboard Home</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

const startSetup = async (password = "s3cret") => {
  renderSetup();
  fireEvent.change(screen.getByPlaceholderText("Your password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};

describe("MfaSetup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for the password before revealing anything", () => {
    renderSetup();

    expect(screen.getByPlaceholderText("Your password")).toBeInTheDocument();
    // A valid session is not enough: a stolen one must not be able to enrol its
    // own authenticator and lock the real owner out.
    expect(screen.queryByPlaceholderText("6-digit code")).not.toBeInTheDocument();
    expect(mockedStart).not.toHaveBeenCalled();
  });

  it("shows the QR code and the typed-in key after the password is accepted", async () => {
    mockedStart.mockResolvedValue(SETUP);
    await startSetup();

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("6-digit code")).toBeInTheDocument();
    expect(mockedStart).toHaveBeenCalledWith("s3cret");
  });

  it("renders a QR image from the provisioning URI", async () => {
    mockedStart.mockResolvedValue(SETUP);
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter>
          <MfaSetup />
        </MemoryRouter>
      </ThemeProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Your password"), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("JBSWY3DPEHPK3PXP");
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy());
  });

  it("stays on the password step when the password is wrong", async () => {
    mockedStart.mockRejectedValue({ response: { status: 401 } });
    await startSetup("wrong");

    expect(await screen.findByText("That password is not correct.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your password")).toBeInTheDocument();
  });

  it("explains when the server has no encryption key configured", async () => {
    // Nothing the user can do about it, so the message has to name who can.
    mockedStart.mockRejectedValue({
      response: {
        status: 503,
        data: { detail: "MFA_ENCRYPTION_KEY is not set. Ask an administrator to set it." },
      },
    });
    await startSetup();

    expect(await screen.findByText(/Ask an administrator/)).toBeInTheDocument();
  });

  it("confirms the code and reports success", async () => {
    mockedStart.mockResolvedValue(SETUP);
    mockedConfirm.mockResolvedValue({ data: { enabled: true } });
    await startSetup();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Two-factor authentication is on")).toBeInTheDocument();
    expect(mockedConfirm).toHaveBeenCalledWith("123456");
  });

  it("says on the success screen that recovery goes through an administrator", async () => {
    // The lab chose admin-verified reset over printed codes, so this is the
    // only place the user is told what happens if they lose the device.
    mockedStart.mockResolvedValue(SETUP);
    mockedConfirm.mockResolvedValue({ data: { enabled: true } });
    await startSetup();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/administrator has to reset it/)).toBeInTheDocument();
  });

  it("keeps the user on the code step when the code is rejected", async () => {
    mockedStart.mockResolvedValue(SETUP);
    mockedConfirm.mockRejectedValue({
      response: { status: 400, data: { detail: "That code is not valid." } },
    });
    await startSetup();

    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("That code is not valid.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("6-digit code")).toBeInTheDocument();
  });

  it("lets the user leave without enrolling", async () => {
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(await screen.findByText("Dashboard Home")).toBeInTheDocument();
  });
});

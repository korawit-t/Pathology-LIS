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
const mockedServerTime = AuthService.getServerTime as unknown as ReturnType<typeof vi.fn>;

const serverTime = (offsetSeconds = 0) => ({
  data: {
    server_time: new Date(Date.now() - offsetSeconds * 1000).toISOString(),
    totp_period_seconds: 30,
    totp_valid_window_steps: 1,
  },
});
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockedServerTime.mockResolvedValue(serverTime(0));
  });

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

  it("renders a QR code that is actually visible", async () => {
    // The previous version of this test queried for any svg in the container,
    // which antd's Steps and icons satisfy on their own — so it passed while
    // the QR was collapsed to nothing. Scope to the QR's own wrapper and check
    // it has a real size: bwip-js emits a viewBox and no width/height, and an
    // SVG with no intrinsic size renders as zero pixels.
    mockedStart.mockResolvedValue(SETUP);
    await startSetup();

    await screen.findByText("JBSWY3DPEHPK3PXP");
    const svg = (await screen.findByTestId("mfa-qr")).querySelector("svg");

    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBeTruthy();
    expect(svg?.getAttribute("height")).toBeTruthy();
    expect(Number(svg?.getAttribute("width"))).toBeGreaterThan(0);
  });

  it("encodes the provisioning URI rather than something else", async () => {
    // A QR that scans into the wrong thing is worse than none: the user gets a
    // working-looking authenticator entry that never produces a valid code.
    mockedStart.mockResolvedValue(SETUP);
    await startSetup();

    const svg = (await screen.findByTestId("mfa-qr")).querySelector("svg");
    expect(svg?.innerHTML.length).toBeGreaterThan(100);
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

  describe("clock drift", () => {
    it("warns when this device and the server disagree about the time", async () => {
      // TOTP is a function of the clock alone. Without this the failure reads
      // as "the app is giving me wrong codes", which sends people to look at
      // the authenticator instead of the server.
      mockedServerTime.mockResolvedValue(serverTime(120));
      renderSetup();

      expect(
        await screen.findByText(/disagree about the time/),
      ).toBeInTheDocument();
      // The number matters: "about 120 seconds apart" is what an administrator
      // needs to hear to know where to look.
      expect(screen.getByText(/120 seconds apart/)).toBeInTheDocument();
    });

    it("says nothing when the clocks agree", async () => {
      renderSetup();
      await screen.findByPlaceholderText("Your password");

      expect(screen.queryByText(/disagree about the time/)).not.toBeInTheDocument();
    });

    it("tolerates drift inside the validation window", async () => {
      // One step either side is accepted by the server, so warning at 20
      // seconds would be crying wolf.
      mockedServerTime.mockResolvedValue(serverTime(20));
      renderSetup();
      await screen.findByPlaceholderText("Your password");

      expect(screen.queryByText(/disagree about the time/)).not.toBeInTheDocument();
    });

    it("still lets the user enrol if the clock check itself fails", async () => {
      // It is a diagnostic, not a gate.
      mockedServerTime.mockRejectedValue(new Error("offline"));
      mockedStart.mockResolvedValue(SETUP);
      await startSetup();

      expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    });
  });
});

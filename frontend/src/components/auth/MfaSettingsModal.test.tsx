import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MfaSettingsModal from "./MfaSettingsModal";
import AuthService from "../../services/authService";
import { MfaStatus, TrustedDevice } from "../../types/auth";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../../services/authService");

const mockedStatus = AuthService.getMfaStatus as unknown as ReturnType<typeof vi.fn>;
const mockedDevices = AuthService.getTrustedDevices as unknown as ReturnType<typeof vi.fn>;
const mockedRevoke = AuthService.revokeTrustedDevice as unknown as ReturnType<typeof vi.fn>;
const mockedRevokeAll = AuthService.revokeAllTrustedDevices as unknown as ReturnType<typeof vi.fn>;

const makeStatus = (o: Partial<MfaStatus> = {}): MfaStatus => ({
  enabled: true,
  pending_setup: false,
  methods: [],
  required_for_this_user: false,
  system_enabled: true,
  ...o,
});

const makeDevice = (o: Partial<TrustedDevice> = {}): TrustedDevice => ({
  id: 1,
  label: "Chrome on Windows",
  ip_address: "10.0.0.5",
  created_at: "2026-08-01T09:00:00Z",
  last_used_at: "2026-08-19T08:00:00Z",
  expires_at: "2026-09-01T09:00:00Z",
  ...o,
});

const renderModal = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<MfaSettingsModal open onClose={vi.fn()} />} />
          <Route path="/mfa-setup" element={<div>Setup Page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

describe("MfaSettingsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStatus.mockResolvedValue({ data: makeStatus() });
    mockedDevices.mockResolvedValue({ data: [] });
  });

  it("offers to set up a factor when the user has none", async () => {
    mockedStatus.mockResolvedValue({ data: makeStatus({ enabled: false }) });
    renderModal();

    expect(
      await screen.findByRole("button", { name: /Set up two-factor/ }),
    ).toBeInTheDocument();
  });

  it("says recovery goes through an administrator", async () => {
    // There are no printed codes, so this is the expectation to set before
    // someone enrols rather than after they lose the device.
    mockedStatus.mockResolvedValue({ data: makeStatus({ enabled: false }) });
    renderModal();

    expect(await screen.findByText(/administrator has to reset it/)).toBeInTheDocument();
  });

  it("navigates to the setup page", async () => {
    mockedStatus.mockResolvedValue({ data: makeStatus({ enabled: false }) });
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /Set up two-factor/ }));

    expect(await screen.findByText("Setup Page")).toBeInTheDocument();
  });

  it("warns when the feature is not switched on system-wide", async () => {
    // Otherwise someone enrols, is never asked for a code, and concludes it is
    // broken.
    mockedStatus.mockResolvedValue({
      data: makeStatus({ enabled: false, system_enabled: false }),
    });
    renderModal();

    expect(await screen.findByText(/not be asked for a code/)).toBeInTheDocument();
  });

  it("lists the trusted devices", async () => {
    mockedDevices.mockResolvedValue({ data: [makeDevice()] });
    renderModal();

    expect(await screen.findByText("Chrome on Windows")).toBeInTheDocument();
    expect(screen.getByText(/from 10.0.0.5/)).toBeInTheDocument();
  });

  it("tells the user why the list matters", async () => {
    // A browser that skips the code is invisible everywhere else, so an entry
    // nobody recognises is the only signal available.
    mockedDevices.mockResolvedValue({ data: [makeDevice()] });
    renderModal();

    expect(await screen.findByText(/do not\s+recognise one/)).toBeInTheDocument();
  });

  it("says so when nothing is trusted", async () => {
    renderModal();

    expect(
      await screen.findByText(/asked for a code every time/),
    ).toBeInTheDocument();
  });

  it("revokes a single device after confirmation", async () => {
    mockedDevices.mockResolvedValue({ data: [makeDevice()] });
    mockedRevoke.mockResolvedValue({});
    renderModal();

    await screen.findByText("Chrome on Windows");
    // Target the row's own button by name — getAllByRole("button")[0] picks up
    // the modal's close control instead. The confirmation renders in a portal.
    fireEvent.click(screen.getByRole("button", { name: "Remove Chrome on Windows" }));
    const popup = await screen.findByRole("tooltip");
    fireEvent.click(within(popup).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledWith(1));
  });

  it("revokes every device after confirmation", async () => {
    mockedDevices.mockResolvedValue({ data: [makeDevice()] });
    mockedRevokeAll.mockResolvedValue({});
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /Remove all devices/ }));
    const popup = await screen.findByRole("tooltip");
    fireEvent.click(within(popup).getByRole("button", { name: "Remove all" }));

    await waitFor(() => expect(mockedRevokeAll).toHaveBeenCalled());
  });

  it("marks the factor as required when policy says so", async () => {
    mockedStatus.mockResolvedValue({
      data: makeStatus({ required_for_this_user: true }),
    });
    renderModal();

    expect(await screen.findByText("Required for your role")).toBeInTheDocument();
  });

  it("survives the endpoints failing", async () => {
    mockedStatus.mockRejectedValue(new Error("boom"));
    mockedDevices.mockRejectedValue(new Error("boom"));
    renderModal();

    expect(
      await screen.findByText("Could not load your security settings."),
    ).toBeInTheDocument();
  });
});

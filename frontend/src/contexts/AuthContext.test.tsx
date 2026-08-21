import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";
import AuthService from "../services/authService";
import SystemSettingService from "../services/systemSettingService";

vi.mock("../services/authService");
vi.mock("../services/systemSettingService");
// AuthContext calls axios directly for the cookie-only refresh, and imports the
// shared client for everything else. Both need stubbing or the provider cannot
// mount at all.
vi.mock("axios", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    create: () => ({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: {} }),
    }),
  },
}));
vi.mock("../services/httpClient", () => ({
  default: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn() },
  API_BASE_URL: "http://test",
}));

const mockedStatus = AuthService.getMfaStatus as unknown as ReturnType<typeof vi.fn>;

const Probe = () => {
  const { user } = useAuth();
  return (
    <div>
      <span data-testid="overdue">{String(user?.mfa_setup_required)}</span>
      <span data-testid="days">{String(user?.mfa_setup_due_in_days)}</span>
    </div>
  );
};

const renderProvider = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );

describe("AuthContext — enrolment status is not persisted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (SystemSettingService.getPublicSettings as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ idle_timeout_minutes: 10, idle_warning_minutes: 1 });
    mockedStatus.mockResolvedValue({ data: { setup_overdue: false, setup_due_in_days: null } });
  });

  it("keeps the policy flags out of localStorage", async () => {
    // They are server-owned policy state. Cached here they go stale the moment
    // an administrator changes the policy, and a gate that reads them from
    // localStorage is one the user can edit.
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 1, username: "alice", mfa_setup_required: false }),
    );
    localStorage.setItem("roles", JSON.stringify(["admin"]));
    mockedStatus.mockResolvedValue({ data: { setup_overdue: true, setup_due_in_days: 0 } });

    renderProvider();

    // The stored false must not win over the server's true.
    await waitFor(() => expect(screen.getByTestId("overdue")).toHaveTextContent("true"));
  });

  it("re-reads the status from the server on reload", async () => {
    localStorage.setItem("user", JSON.stringify({ id: 1, username: "alice" }));
    localStorage.setItem("roles", JSON.stringify(["admin"]));
    mockedStatus.mockResolvedValue({ data: { setup_overdue: false, setup_due_in_days: 3 } });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("days")).toHaveTextContent("3"));
    expect(mockedStatus).toHaveBeenCalled();
  });

  it("does not engage the gate when the status cannot be fetched", async () => {
    // The redirect is a nudge; the server refuses the actions that matter
    // regardless. Failing closed here would lock people out over a blip.
    localStorage.setItem("user", JSON.stringify({ id: 1, username: "alice" }));
    localStorage.setItem("roles", JSON.stringify(["admin"]));
    mockedStatus.mockRejectedValue(new Error("offline"));

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("overdue")).toHaveTextContent("undefined"),
    );
  });
});

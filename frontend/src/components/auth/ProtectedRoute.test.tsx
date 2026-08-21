import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

const makeUser = (overrides = {}) => ({
  id: 1,
  username: "alice",
  roles: ["admin"],
  is_temporary_password: false,
  is_password_expired: false,
  ...overrides,
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Dashboard</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/mfa-setup"
          element={
            <ProtectedRoute>
              <div>Setup Page</div>
            </ProtectedRoute>
          }
        />
        <Route path="/force-change-password" element={<div>Change Password</div>} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("ProtectedRoute — enrolment deadline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets an unaffected user through", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), loading: false });
    renderAt("/dashboard");

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("sends an overdue user to the setup page", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ mfa_setup_required: true }),
      loading: false,
    });
    renderAt("/dashboard");

    expect(screen.getByText("Setup Page")).toBeInTheDocument();
  });

  it("does not trap them in a redirect loop on the setup page itself", () => {
    // The obvious way to get this wrong: redirect to /mfa-setup from every
    // route including /mfa-setup.
    mockUseAuth.mockReturnValue({
      user: makeUser({ mfa_setup_required: true }),
      loading: false,
    });
    renderAt("/mfa-setup");

    expect(screen.getByText("Setup Page")).toBeInTheDocument();
  });

  it("still lets someone inside the grace period work", () => {
    // Warned, not blocked — the countdown is not the deadline.
    mockUseAuth.mockReturnValue({
      user: makeUser({ mfa_setup_required: false, mfa_setup_due_in_days: 3 }),
      loading: false,
    });
    renderAt("/dashboard");

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("puts a forced password change first", () => {
    // Someone can owe both. Enrolling with a password the system has already
    // decided must change is the wrong order.
    mockUseAuth.mockReturnValue({
      user: makeUser({ is_temporary_password: true, mfa_setup_required: true }),
      loading: false,
    });
    renderAt("/dashboard");

    expect(screen.getByText("Change Password")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to login", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderAt("/dashboard");

    expect(screen.getByText("Login")).toBeInTheDocument();
  });
});

/**
 * Dashboard pages switch on React state, so the menu used to replace a page
 * with unsaved edits silently, and a page with no menu item of its own (report
 * form, approval detail...) left nothing highlighted.
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import Dashboard from "./Dashboard";

// Views whose test page has unsaved edits from the moment it opens.
const page = vi.hoisted(() => ({ dirtyViews: new Set<string>() }));
const auth = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock("./dashboardViewResolver", async () => {
  const React = await import("react");
  const { useUnsavedChangesGuard } = await import("../../contexts/unsavedChanges");
  const TestPage = ({ view, onOpenReport }: { view: string; onOpenReport: (id: number, type?: string) => void }) => {
    useUnsavedChangesGuard(page.dirtyViews.has(view));
    return React.createElement(
      "div",
      { "data-testid": "page" },
      React.createElement("span", null, `view:${view}`),
      React.createElement("button", { onClick: () => onOpenReport(1, "surgical") }, "open report"),
    );
  };
  return {
    resolveDashboardView: (p: { currentView: string; onOpenReport: (id: number, type?: string) => void }) =>
      React.createElement(TestPage, { key: p.currentView, view: p.currentView, onOpenReport: p.onOpenReport }),
  };
});
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../services/userService", () => ({
  default: {
    getCurrentUser: vi.fn().mockResolvedValue({
      id: 1,
      username: "admin",
      full_name: "Test Admin",
      roles: ["admin"],
      preferences: { layout_mode: "side" },
    }),
    updateMyPreferences: vi.fn(),
  },
}));
vi.mock("../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false, toggleDarkMode: vi.fn() }),
}));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ logout: auth.logout }) }));
vi.mock("../../components/auth/ChangePasswordModal", () => ({ default: () => null }));
vi.mock("../../components/auth/MfaSettingsModal", () => ({ default: () => null }));
vi.mock("../../components/Layout/UpdateAvailableButton", () => ({ default: () => null }));

const sider = () => document.querySelector(".ant-layout-sider") as HTMLElement;

const renderDashboard = async () => {
  render(
    <AntdApp>
      <Dashboard />
    </AntdApp>,
  );
  await waitFor(() => expect(sider()).not.toBeNull());
  await screen.findByText("view:dashboard");
};

// Open a sidebar group and click one of its items.
const clickMenu = async (group: string, item: string) => {
  const s = within(sider());
  if (!s.queryByText(item)) fireEvent.click(s.getByText(group));
  fireEvent.click(await s.findByText(item));
};

const LEAVE_PROMPT = "This page has changes that are not saved yet. Leave without saving?";

// The newest leave prompt. antd leaves a closed confirm in the DOM under jsdom
// (its close animation never ends), so earlier ones can still be there.
const leaveDialog = async () => {
  const prompts = await screen.findAllByText(LEAVE_PROMPT);
  return within(prompts[prompts.length - 1].closest(".ant-modal") as HTMLElement);
};

beforeEach(() => {
  page.dirtyViews = new Set();
  auth.logout.mockClear();
});

describe("Dashboard menu with unsaved changes", () => {
  it("switches straight away when the page has nothing unsaved", async () => {
    await renderDashboard();
    await clickMenu("Surgical", "Grossing");
    await clickMenu("Surgical", "Specimen Storage");

    expect(await screen.findByText("view:specimen-storage")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("asks before leaving a dirty page, and Stay keeps it", async () => {
    page.dirtyViews = new Set(["grossing"]);
    await renderDashboard();
    await clickMenu("Surgical", "Grossing");
    await screen.findByText("view:grossing");

    await clickMenu("Surgical", "Specimen Storage");
    expect(screen.getAllByText(LEAVE_PROMPT)).toHaveLength(1);
    fireEvent.click((await leaveDialog()).getByRole("button", { name: "Stay" }));

    // Give a navigation the chance to happen, then check it did not.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("view:grossing")).toBeInTheDocument();
    expect(screen.queryByText("view:specimen-storage")).not.toBeInTheDocument();
  });

  it("leaves when the user says so", async () => {
    page.dirtyViews = new Set(["grossing"]);
    await renderDashboard();
    await clickMenu("Surgical", "Grossing");
    await screen.findByText("view:grossing");

    await clickMenu("Surgical", "Specimen Storage");
    fireEvent.click((await leaveDialog()).getByRole("button", { name: "Leave without saving" }));

    expect(await screen.findByText("view:specimen-storage")).toBeInTheDocument();
  });

  it("puts the prompt above the sign-off screens (1050) and page modals (3000)", async () => {
    page.dirtyViews = new Set(["grossing"]);
    await renderDashboard();
    await clickMenu("Surgical", "Grossing");
    await screen.findByText("view:grossing");
    await clickMenu("Surgical", "Specimen Storage");
    await leaveDialog();

    const wrap = document.querySelector(".ant-modal-wrap") as HTMLElement;
    expect(Number(getComputedStyle(wrap).zIndex)).toBeGreaterThan(3000);
  });

  it("asks before Logout drops the edits too", async () => {
    page.dirtyViews = new Set(["grossing"]);
    await renderDashboard();
    await clickMenu("Surgical", "Grossing");
    await screen.findByText("view:grossing");

    fireEvent.click(screen.getByText("Test Admin"));
    fireEvent.click(await screen.findByText("Logout"));
    fireEvent.click((await leaveDialog()).getByRole("button", { name: "Stay" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(auth.logout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Test Admin"));
    fireEvent.click(await screen.findByText("Logout"));
    await waitFor(() => expect(screen.getAllByText(LEAVE_PROMPT)).toHaveLength(2));
    fireEvent.click((await leaveDialog()).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
  });
});

describe("Dashboard menu highlight", () => {
  it("keeps My Worklist highlighted on the report form opened from it", async () => {
    await renderDashboard();
    await clickMenu("Diagnosis", "My Worklist");
    await screen.findByText("view:pathologist-page");

    fireEvent.click(screen.getByRole("button", { name: "open report" }));
    await screen.findByText("view:surgical-report-form");

    const selected = [...sider().querySelectorAll(".ant-menu-item-selected")].map((e) => e.textContent);
    expect(selected).toEqual(["My Worklist"]);
  });
});

/**
 * The side layout's Sider: wide enough that no label is cut off, and one
 * background in dark mode (theme="dark" painted it navy behind a near-black menu).
 */

import { render, waitFor } from "@testing-library/react";
import Dashboard from "./Dashboard";

const theme = vi.hoisted(() => ({ isDarkMode: false }));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../services/userService", () => ({
  default: {
    getCurrentUser: vi.fn().mockResolvedValue({
      id: 1,
      username: "admin",
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
  useTheme: () => ({ isDarkMode: theme.isDarkMode, toggleDarkMode: vi.fn() }),
}));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("./dashboardViewResolver", () => ({ resolveDashboardView: () => null }));
vi.mock("../../components/auth/ChangePasswordModal", () => ({ default: () => null }));
vi.mock("../../components/auth/MfaSettingsModal", () => ({ default: () => null }));
vi.mock("../../components/Layout/UpdateAvailableButton", () => ({ default: () => null }));

const sider = async () => {
  await waitFor(() => expect(document.querySelector(".ant-layout-sider")).not.toBeNull());
  return document.querySelector(".ant-layout-sider") as HTMLElement;
};

describe("Dashboard side layout", () => {
  it.each([false, true])("Sider is 240px and light-themed (dark mode: %s)", async (dark) => {
    theme.isDarkMode = dark;
    render(<Dashboard />);

    const el = await sider();
    expect(el.style.width).toBe("240px");
    expect(el).toHaveClass("ant-layout-sider-light");
    expect(el).not.toHaveClass("ant-layout-sider-dark");
  });
});

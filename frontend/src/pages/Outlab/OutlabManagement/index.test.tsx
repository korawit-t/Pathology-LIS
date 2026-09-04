import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OutlabManagement from "./index";
import HisService from "../../../services/hisService";
import { resetHisConfiguredCache } from "../../../hooks/useHisConfigured";

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../../services/hisService", () => ({ default: { getInfo: vi.fn() } }));

const mockGetInfo = vi.mocked(HisService.getInfo);

vi.mock("./PendingQueueTab", () => ({
  PendingQueueTab: ({ onSent }: { onSent?: () => void }) => (
    <div data-testid="mock-queue">
      <button onClick={onSent}>trigger-sent</button>
    </div>
  ),
}));
vi.mock("./TrackingTab", () => ({
  TrackingTab: ({ refreshTrigger, onReceived }: { refreshTrigger?: number; onReceived?: () => void }) => (
    <div data-testid="mock-tracking">
      refreshTrigger:{refreshTrigger}
      <button onClick={onReceived}>trigger-received-tracking</button>
    </div>
  ),
}));
vi.mock("./CaseViewTab", () => ({
  CaseViewTab: ({ refreshTrigger, onReceived }: { refreshTrigger?: number; onReceived?: () => void }) => (
    <div data-testid="mock-case-view">
      refreshTrigger:{refreshTrigger}
      <button onClick={onReceived}>trigger-received-case-view</button>
    </div>
  ),
}));
vi.mock("./HosxpKeyTab", () => ({
  HosxpKeyTab: ({ refreshTrigger }: { refreshTrigger?: number }) => (
    <div data-testid="mock-hosxp-key">refreshTrigger:{refreshTrigger}</div>
  ),
}));
vi.mock("./TodayPatientsTab", () => ({
  TodayPatientsTab: ({ refreshTrigger }: { refreshTrigger?: number }) => (
    <div data-testid="mock-today">refreshTrigger:{refreshTrigger}</div>
  ),
}));

// antd's Tabs only mounts the active pane by default, so the label span's
// literal JSX whitespace (`<Icon /> Some Label`) shows up as a leading space
// in textContent — trim it.
const activeTabLabel = () => document.querySelector(".ant-tabs-tab-active")?.textContent?.trim();

beforeEach(() => {
  vi.clearAllMocks();
  resetHisConfiguredCache();
  // Default for the existing cases: a site with HOSxP wired up, i.e. every tab.
  mockGetInfo.mockResolvedValue({ configured: true, his_type: "HOSxP" });
});

describe("OutlabManagement wrapper", () => {
  it("renders the title and starts on the Send to Outlab tab", () => {
    render(<OutlabManagement />);
    expect(screen.getByText("Outlab Management")).toBeInTheDocument();
    expect(activeTabLabel()).toBe("Send to Outlab");
  });

  it("switches tabs when clicking the tab bar", () => {
    render(<OutlabManagement />);
    fireEvent.click(screen.getByRole("tab", { name: /By Case/i }));
    expect(activeTabLabel()).toBe("By Case");
  });

  it("jumps to the Tracking tab and bumps refreshTrigger for every tab when a dispatch is sent", () => {
    render(<OutlabManagement />);
    fireEvent.click(screen.getByText("trigger-sent"));

    expect(activeTabLabel()).toBe("Tracking / Receive");
    expect(screen.getByTestId("mock-tracking")).toHaveTextContent("refreshTrigger:1");

    fireEvent.click(screen.getByRole("tab", { name: /By Case/i }));
    expect(screen.getByTestId("mock-case-view")).toHaveTextContent("refreshTrigger:1");

    fireEvent.click(screen.getByRole("tab", { name: /HosXP Key/i }));
    expect(screen.getByTestId("mock-hosxp-key")).toHaveTextContent("refreshTrigger:1");

    fireEvent.click(screen.getByRole("tab", { name: /Today's Patients/i }));
    expect(screen.getByTestId("mock-today")).toHaveTextContent("refreshTrigger:1");
  });

  it("bumps refreshTrigger for every tab without switching the active tab when slides are received", () => {
    render(<OutlabManagement />);
    fireEvent.click(screen.getByRole("tab", { name: /By Case/i }));
    expect(activeTabLabel()).toBe("By Case");

    fireEvent.click(screen.getByText("trigger-received-case-view"));

    expect(activeTabLabel()).toBe("By Case");
    expect(screen.getByTestId("mock-case-view")).toHaveTextContent("refreshTrigger:1");

    fireEvent.click(screen.getByRole("tab", { name: /Tracking \/ Receive/i }));
    expect(screen.getByTestId("mock-tracking")).toHaveTextContent("refreshTrigger:1");
  });
});

describe("deployments without a HIS", () => {
  const tabLabels = () =>
    [...document.querySelectorAll(".ant-tabs-tab")].map((t) => t.textContent?.trim());

  it("drops the two HOSxP-only tabs when no HIS is configured", async () => {
    mockGetInfo.mockResolvedValue({ configured: false, his_type: "Unknown" });
    render(<OutlabManagement />);

    await waitFor(() => expect(tabLabels()).not.toContain("HosXP Key"));
    expect(tabLabels()).not.toContain("Today's Patients");
    // The HIS-independent tabs are untouched.
    expect(tabLabels()).toEqual(["Send to Outlab", "Tracking / Receive", "By Case"]);
  });

  it("keeps every tab when a HIS is configured", async () => {
    render(<OutlabManagement />);

    await waitFor(() => expect(tabLabels()).toContain("HosXP Key"));
    expect(tabLabels()).toContain("Today's Patients");
  });

  it("keeps every tab when the lookup itself fails, rather than hiding working features", async () => {
    mockGetInfo.mockRejectedValue(new Error("network"));
    render(<OutlabManagement />);

    await waitFor(() => expect(tabLabels()).toContain("HosXP Key"));
    expect(tabLabels()).toContain("Today's Patients");
  });
});

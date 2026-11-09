import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OutlabManagement from "./index";
import HisService from "../../../services/hisService";
import { resetHisInfoCache } from "../../../hooks/useHisInfo";
import type { HisInfo } from "../../../services/hisService";

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
  HosxpKeyTab: ({
    refreshTrigger,
    hisName,
    appointmentsAvailable,
  }: { refreshTrigger?: number; hisName?: string; appointmentsAvailable?: boolean }) => (
    <div data-testid="mock-hosxp-key">
      refreshTrigger:{refreshTrigger} hisName:{hisName} appointments:{String(appointmentsAvailable)}
    </div>
  ),
}));

const hisInfo = (overrides: Partial<HisInfo> = {}): HisInfo => ({
  configured: true,
  his_type: "hosxp",
  display_name: "HOSxP",
  features: { patient_search: true, appointments: true, visits_today: true, admission: true },
  ...overrides,
});
const NO_FEATURES = { patient_search: false, appointments: false, visits_today: false, admission: false };
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
  resetHisInfoCache();
  // Default for the existing cases: a site with HOSxP wired up, i.e. every tab.
  mockGetInfo.mockResolvedValue(hisInfo());
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

    // The label reads "HIS Key" until /his/info answers, then "HOSxP Key".
    fireEvent.click(screen.getByRole("tab", { name: /Key/i }));
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
    mockGetInfo.mockResolvedValue(hisInfo({ configured: false, features: NO_FEATURES }));
    render(<OutlabManagement />);

    await waitFor(() => expect(tabLabels()).not.toContain("HIS Key"));
    expect(tabLabels()).not.toContain("HOSxP Key");
    expect(tabLabels()).not.toContain("Today's Patients");
    // The HIS-independent tabs are untouched.
    expect(tabLabels()).toEqual(["Send to Outlab", "Tracking / Receive", "By Case"]);
  });

  it("keeps every tab when a HIS is configured", async () => {
    render(<OutlabManagement />);

    await waitFor(() => expect(tabLabels()).toContain("HOSxP Key"));
    expect(tabLabels()).toContain("Today's Patients");
  });

  it("keeps every tab when the lookup itself fails, rather than hiding working features", async () => {
    mockGetInfo.mockRejectedValue(new Error("network"));
    render(<OutlabManagement />);

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalled());
    expect(tabLabels()).toContain("HIS Key");
    expect(tabLabels()).toContain("Today's Patients");
  });
});

describe("deployments on a HIS other than HOSxP", () => {
  const tabLabels = () =>
    [...document.querySelectorAll(".ant-tabs-tab")].map((t) => t.textContent?.trim());

  it("names the key tab after the connected HIS and drops Today's Patients when it can't say who visited", async () => {
    mockGetInfo.mockResolvedValue(
      hisInfo({
        his_type: "custom",
        display_name: "SSB",
        features: { ...NO_FEATURES, patient_search: true },
      }),
    );
    render(<OutlabManagement />);

    await waitFor(() => expect(tabLabels()).toContain("SSB Key"));
    expect(tabLabels()).not.toContain("Today's Patients");

    // Keying still applies to any HIS; only the appointment lookup goes.
    fireEvent.click(screen.getByRole("tab", { name: /SSB Key/i }));
    expect(screen.getByTestId("mock-hosxp-key")).toHaveTextContent("hisName:SSB");
    expect(screen.getByTestId("mock-hosxp-key")).toHaveTextContent("appointments:false");
  });

  it("keeps every tab against an older backend that only reports `configured`", async () => {
    mockGetInfo.mockResolvedValue({ configured: true, his_type: "HOSxP" } as unknown as HisInfo);
    render(<OutlabManagement />);

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalled());
    await waitFor(() => expect(tabLabels()).toContain("Today's Patients"));
    expect(tabLabels()).toContain("HIS Key");
  });
});

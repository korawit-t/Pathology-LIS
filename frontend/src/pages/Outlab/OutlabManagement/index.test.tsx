import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import OutlabManagement from "./index";

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

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

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SectioningManager from "./SectioningManager";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

// เทสต์นี้สนใจการสลับ view ของ manager ล้วน ๆ ลูกทั้งสามมีเทสต์ของตัวเอง
vi.mock(".", () => ({
  default: ({ onSelectRun }: { onSelectRun: (r: unknown) => void }) => (
    <button onClick={() => onSelectRun({ id: 9, run_no: "SEC-2026-0009" })}>
      pick-run
    </button>
  ),
}));
vi.mock("./components/CreateSectioningRun", () => ({
  default: ({
    onBack,
    onSuccess,
  }: {
    onBack: () => void;
    onSuccess: (r: unknown) => void;
  }) => (
    <div>
      <span>create-form</span>
      <button onClick={onBack}>child-back</button>
      <button onClick={() => onSuccess({ run_no: "SEC-2026-0010" })}>child-save</button>
    </div>
  ),
}));
vi.mock("./components/SectioningDetails", () => ({
  default: ({ run }: { run: { run_no?: string } | null }) => (
    <span>details-of-{run?.run_no}</span>
  ),
}));

const renderManager = () =>
  render(
    <AntdApp>
      <SectioningManager />
    </AntdApp>,
  );

describe("SectioningManager", () => {
  it("starts on the run list with the New Run action available", () => {
    renderManager();
    expect(screen.getByText("pick-run")).toBeInTheDocument();
    expect(screen.getByText("New Sectioning Run")).toBeInTheDocument();
  });

  it("hides the New Run action once a sub-view is open", () => {
    renderManager();
    fireEvent.click(screen.getByText("New Sectioning Run").closest("button") as Element);

    expect(screen.getByText("create-form")).toBeInTheDocument();
    // หัวข้อหน้าเปลี่ยนเป็นชื่อเดียวกัน แต่ปุ่มมุมขวาต้องหายไปแล้ว
    expect(screen.queryByText("New Sectioning Run")?.closest("button")).toBeFalsy();
  });

  it("returns to the list after a run is saved, naming the run", async () => {
    renderManager();
    fireEvent.click(screen.getByText("New Sectioning Run").closest("button") as Element);
    fireEvent.click(screen.getByText("child-save"));

    expect(
      await screen.findByText("Sectioning run SEC-2026-0010 saved successfully"),
    ).toBeInTheDocument();
    expect(screen.getByText("pick-run")).toBeInTheDocument();
  });

  it("opens the details view titled with the run number", () => {
    renderManager();
    fireEvent.click(screen.getByText("pick-run"));

    expect(screen.getByText("details-of-SEC-2026-0009")).toBeInTheDocument();
    expect(
      screen.getByText(/Sectioning Run Details: SEC-2026-0009/),
    ).toBeInTheDocument();
  });

  it("clears the selected run when backing out of details", () => {
    renderManager();
    fireEvent.click(screen.getByText("pick-run"));
    expect(screen.getByText("details-of-SEC-2026-0009")).toBeInTheDocument();

    // ปุ่มย้อนกลับมาจาก PageContainer (onBack) ไม่ใช่ปุ่มในตัว view เอง
    const back = document.querySelector(".anticon-arrow-left")?.closest("button");
    fireEvent.click(back as Element);

    expect(screen.getByText("pick-run")).toBeInTheDocument();
    expect(screen.queryByText(/details-of-/)).toBeNull();
  });

  it("shows no back button while the list is the current view", () => {
    renderManager();
    expect(document.querySelector(".anticon-arrow-left")).toBeNull();
  });
});

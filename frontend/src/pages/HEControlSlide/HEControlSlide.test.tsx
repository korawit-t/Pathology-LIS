import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import HEControlSlidePage from ".";
import HEControlSlideService from "../../services/heControlSlideService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, full_name: "สมชาย ใจดี" } }),
}));
vi.mock("../../services/heControlSlideService", () => ({
  default: { getAll: vi.fn(), create: vi.fn(), printSticker: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const slide = {
  id: 1,
  control_no: "HEC-2026-0001",
  control_date: "2026-09-01",
  performed_by: "สมชาย ใจดี",
  performed_at: "2026-09-01T08:00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(HEControlSlideService.getAll).mockResolvedValue([slide]);
  mocked(HEControlSlideService.create).mockResolvedValue({
    id: 2,
    control_no: "HEC-2026-0002",
  });
  mocked(HEControlSlideService.printSticker).mockResolvedValue(new Blob(["%PDF"]));
  window.URL.createObjectURL = vi.fn(() => "blob:fake");
  window.URL.revokeObjectURL = vi.fn();
  window.open = vi.fn();
});

const renderPage = () =>
  render(
    <AntdApp>
      <HEControlSlidePage />
    </AntdApp>,
  );

describe("HEControlSlide", () => {
  it("shows today's control slide history", async () => {
    renderPage();
    expect(await screen.findByText("HEC-2026-0001")).toBeInTheDocument();
  });

  it("says so when the history cannot be loaded", async () => {
    mocked(HEControlSlideService.getAll).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(
      await screen.findByText("Failed to load control slide history"),
    ).toBeInTheDocument();
  });

  it("records a control slide and names the number it was given", async () => {
    renderPage();
    await screen.findByText("HEC-2026-0001");

    fireEvent.click(screen.getByText("Record Now").closest("button") as Element);

    await waitFor(() => expect(HEControlSlideService.create).toHaveBeenCalled());
    expect(
      await screen.findByText("Control slide HEC-2026-0002 recorded"),
    ).toBeInTheDocument();
  });

  it("reloads the history after recording", async () => {
    renderPage();
    await screen.findByText("HEC-2026-0001");

    fireEvent.click(screen.getByText("Record Now").closest("button") as Element);
    await waitFor(() =>
      expect(mocked(HEControlSlideService.getAll).mock.calls.length).toBe(2),
    );
  });

  it("offers the sticker straight after recording, and prints only on demand", async () => {
    renderPage();
    await screen.findByText("HEC-2026-0001");
    fireEvent.click(screen.getByText("Record Now").closest("button") as Element);

    const dialog = await waitFor(() => {
      const el = document.querySelector(".ant-modal-confirm");
      if (!el) throw new Error("confirm not open");
      return el as HTMLElement;
    });
    expect(dialog.textContent).toContain("Print sticker now?");

    // เลือก Later = ยังไม่พิมพ์ ต้องไม่แอบยิงพิมพ์ให้เอง
    const later = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Later"),
    );
    fireEvent.click(later as Element);
    expect(HEControlSlideService.printSticker).not.toHaveBeenCalled();
  });

  it("prints the sticker for the slide it just recorded, not the one on screen", async () => {
    renderPage();
    await screen.findByText("HEC-2026-0001");
    fireEvent.click(screen.getByText("Record Now").closest("button") as Element);

    const dialog = await waitFor(() => {
      const el = document.querySelector(".ant-modal-confirm");
      if (!el) throw new Error("confirm not open");
      return el as HTMLElement;
    });
    const now = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Print Now"),
    );
    fireEvent.click(now as Element);

    await waitFor(() =>
      expect(HEControlSlideService.printSticker).toHaveBeenCalledWith(2),
    );
  });

  it("reprints an existing slide's sticker from the table", async () => {
    renderPage();
    await screen.findByText("HEC-2026-0001");

    fireEvent.click(screen.getByText("Print").closest("button") as Element);
    await waitFor(() =>
      expect(HEControlSlideService.printSticker).toHaveBeenCalledWith(1),
    );
  });

  it("says so when the sticker cannot be produced", async () => {
    mocked(HEControlSlideService.printSticker).mockRejectedValue(new Error("500"));
    renderPage();
    await screen.findByText("HEC-2026-0001");

    fireEvent.click(screen.getByText("Print").closest("button") as Element);
    expect(await screen.findByText("Failed to print sticker")).toBeInTheDocument();
  });

  it("says so when the slide could not be recorded", async () => {
    mocked(HEControlSlideService.create).mockRejectedValue(new Error("500"));
    renderPage();
    await screen.findByText("HEC-2026-0001");

    fireEvent.click(screen.getByText("Record Now").closest("button") as Element);
    expect(
      await screen.findByText("Failed to record control slide"),
    ).toBeInTheDocument();
  });
});

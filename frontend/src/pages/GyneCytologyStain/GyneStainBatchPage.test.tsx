import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp, Modal } from "antd";
import GyneStainBatchPage from "./GyneStainBatchPage";
import GyneStainService from "../../services/gyneStainService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../Stain/PrintStickerHE/utils/generateHEStickers", () => ({
  executePrint: vi.fn(),
}));
vi.mock("../../services/gyneStainService", () => ({
  default: {
    getRegisteredQueue: vi.fn(),
    createStainRun: vi.fn(),
    printRunStickers: vi.fn(),
  },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const item = (id: number, accession: string) => ({
  id,
  accession_no: accession,
  test_name: "Pap smear",
  patient_name: "นาง สมศรี ใจงาม",
});

beforeEach(() => {
  vi.clearAllMocks();
  // Modal.confirm ของเทสต์ก่อนหน้าอยู่ใน React root ของตัวเอง RTL ไม่ถอนให้
  // และ animation ปิดทำให้ node ค้างข้ามเทสต์ ข้อความบนใบเหมือนกันเป๊ะ
  // เผลอคลิกใบเก่าคือไปเรียก handler ของ test เดิม จึงเก็บกวาดให้เกลี้ยงก่อน
  Modal.destroyAll();
  document
    .querySelectorAll(".ant-modal-root, .ant-modal-wrap")
    .forEach((n) => n.remove());
  mocked(GyneStainService.getRegisteredQueue).mockResolvedValue([
    item(1, "C26-00001"),
    item(2, "C26-00002"),
  ]);
  mocked(GyneStainService.createStainRun).mockResolvedValue({ id: 77 });
  mocked(GyneStainService.printRunStickers).mockResolvedValue(new Blob(["%PDF"]));
  window.URL.createObjectURL = vi.fn(() => "blob:fake");
  window.URL.revokeObjectURL = vi.fn();
  window.open = vi.fn(() => ({ print: vi.fn(), focus: vi.fn() }) as unknown as Window);
});

const renderPage = (onBack = vi.fn()) => {
  render(
    <AntdApp>
      <GyneStainBatchPage onBack={onBack} />
    </AntdApp>,
  );
  return onBack;
};

const scan = (value: string) => {
  const input = screen.getByPlaceholderText(/Scan Accession No/i);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyUp(input, { key: "Enter" });
};

const startStaining = () =>
  fireEvent.click(
    screen.getByText(/Confirm & Start Staining/).closest("button") as Element,
  );

/** Modal.confirm ของเทสต์ก่อนหน้าค้างใน DOM ระหว่าง animation ปิด และข้อความ
 *  เหมือนกันเป๊ะ — ถ้าเผลอไปคลิกใบเก่า handler ที่ถูกเรียกจะเป็นของ test เดิม
 *  จึงรอจนเหลือใบเดียวก่อนเสมอ */
const openConfirm = async () =>
  await waitFor(() => {
    const all = Array.from(document.querySelectorAll(".ant-modal-confirm")).filter(
      (el) => (el.textContent || "").includes("Print all"),
    );
    if (all.length !== 1) throw new Error(`expected 1 confirm, saw ${all.length}`);
    return all[0] as HTMLElement;
  });

describe("GyneStainBatchPage queue", () => {
  it("loads the registered queue on arrival", async () => {
    renderPage();
    expect(await screen.findByText("C26-00001")).toBeInTheDocument();
  });

  it("says so when the queue cannot be loaded", async () => {
    mocked(GyneStainService.getRegisteredQueue).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(
      await screen.findByText("Failed to load registration queue"),
    ).toBeInTheDocument();
  });

  it("moves a scanned slide out of the queue and into the batch", async () => {
    renderPage();
    await screen.findByText("C26-00001");

    scan("C26-00001");

    // ต้องหายจากคิว ไม่งั้นสแกนซ้ำแล้วเข้าไปในรอบเดียวกันสองครั้ง
    await waitFor(() =>
      expect(screen.getAllByText("C26-00001").length).toBe(1),
    );
  });

  it("warns rather than silently ignoring an accession that is not queued", async () => {
    renderPage();
    await screen.findByText("C26-00001");

    scan("C26-99999");
    expect(
      await screen.findByText("Accession not found in queue"),
    ).toBeInTheDocument();
  });

  it("moves the whole queue in one action, leaving it empty", async () => {
    renderPage();
    await screen.findByText("C26-00001");

    fireEvent.click(screen.getByText("Move All").closest("button") as Element);

    await waitFor(() =>
      expect(screen.getByText("Move All").closest("button")).toBeDisabled(),
    );
  });
});

describe("GyneStainBatchPage starting a run", () => {
  it("does nothing when the batch is empty", async () => {
    renderPage();
    await screen.findByText("C26-00001");

    startStaining();
    expect(GyneStainService.createStainRun).not.toHaveBeenCalled();
  });

  it("sends the batched slide ids and reports how many went in", async () => {
    renderPage();
    await screen.findByText("C26-00001");
    fireEvent.click(screen.getByText("Move All").closest("button") as Element);

    startStaining();

    await waitFor(() =>
      expect(GyneStainService.createStainRun).toHaveBeenCalledWith(
        "STAINER-01",
        [1, 2],
        expect.stringContaining("GYNE-"),
      ),
    );
    expect(
      await screen.findByText("Staining batch created (2 items)"),
    ).toBeInTheDocument();
  });

  it("uses the singular when a run holds one slide", async () => {
    renderPage();
    await screen.findByText("C26-00001");
    scan("C26-00001");

    startStaining();
    expect(
      await screen.findByText("Staining batch created (1 item)"),
    ).toBeInTheDocument();
  });

  it("reloads the queue so the batched slides do not come back", async () => {
    renderPage();
    await screen.findByText("C26-00001");
    fireEvent.click(screen.getByText("Move All").closest("button") as Element);

    startStaining();
    await waitFor(() =>
      expect(mocked(GyneStainService.getRegisteredQueue).mock.calls.length).toBe(2),
    );
  });

  it("offers the stickers afterwards and prints only when asked", async () => {
    renderPage();
    await screen.findByText("C26-00001");
    fireEvent.click(screen.getByText("Move All").closest("button") as Element);
    startStaining();

    const dialog = await openConfirm();
    expect(dialog.textContent).toContain("Print all 2 stickers now?");

    const now = Array.from(dialog.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Print Now"),
    );
    fireEvent.click(now as Element);

    await waitFor(() =>
      expect(GyneStainService.printRunStickers).toHaveBeenCalledWith(77),
    );
  });

  it("leaves the batch page when the operator defers printing", async () => {
    const onBack = renderPage();
    await screen.findByText("C26-00001");
    fireEvent.click(screen.getByText("Move All").closest("button") as Element);
    startStaining();

    const dialog = await openConfirm();
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Later"),
      ) as Element,
    );

    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(GyneStainService.printRunStickers).not.toHaveBeenCalled();
  });

  it("says so when the run could not be created", async () => {
    mocked(GyneStainService.createStainRun).mockRejectedValue(new Error("500"));
    renderPage();
    await screen.findByText("C26-00001");
    fireEvent.click(screen.getByText("Move All").closest("button") as Element);

    startStaining();
    expect(await screen.findByText("Failed to start staining")).toBeInTheDocument();
  });
});

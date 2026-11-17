import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import SlideDisposalTab from ".";
import SlideStorageService from "../../../../services/slideStorageService";
import type { SlideStorageDetailResponse } from "../../../../types/slideStorage";

vi.mock("../../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../../../services/slideStorageService", () => ({
  default: {
    getStoredSlides: vi.fn(),
    getDisposedSlides: vi.fn(),
    disposeSlides: vi.fn(),
  },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const slide = (id: number, acc: string) =>
  ({
    id,
    storage_location: "ตู้ 1",
    gyne_stain: { case: { accession_no: acc }, test: { name: "Pap" }, slide_no: 1 },
    run: { stain_category: "Gyne", run_no: "R-1" },
  }) as unknown as SlideStorageDetailResponse;

const page1 = slide(1, "C26-00001");
const page2 = slide(2, "C26-00002");

beforeEach(() => {
  vi.clearAllMocks();
  mocked(SlideStorageService.getStoredSlides).mockImplementation(async (skip: number) => ({
    items: skip === 0 ? [page1] : [page2],
    total: 40,
  }));
  mocked(SlideStorageService.getDisposedSlides).mockResolvedValue({ items: [], total: 0 });
  mocked(SlideStorageService.disposeSlides).mockResolvedValue(undefined);
});

const renderTab = () =>
  render(
    <AntdApp>
      <SlideDisposalTab />
    </AntdApp>,
  );

const activePanel = () =>
  waitFor(() => {
    const el = document.querySelector(".ant-tabs-tabpane-active");
    if (!el) throw new Error("no active tab panel");
    return el as HTMLElement;
  });

const tickRow = async (acc: string) => {
  const panel = await activePanel();
  const row = (await within(panel).findByText(acc)).closest("tr")!;
  fireEvent.click(within(row).getByRole("checkbox"));
};

const goToPage2 = async () => {
  fireEvent.click(within(await activePanel()).getByTitle("2"));
  await waitFor(() =>
    expect(SlideStorageService.getStoredSlides).toHaveBeenCalledWith(20, 20, "", undefined),
  );
};

describe("SlideDisposalTab selection across pages", () => {
  it("disposes slides ticked on every page, and lists all of them first", async () => {
    renderTab();
    await tickRow("C26-00001");
    await goToPage2();
    await tickRow("C26-00002");

    fireEvent.click(await screen.findByRole("button", { name: /ทำลาย \(2\)/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("C26-00001")).toBeInTheDocument();
    expect(within(dialog).getByText("C26-00002")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "ยืนยันทำลาย" }));
    await waitFor(() =>
      expect(SlideStorageService.disposeSlides).toHaveBeenCalledWith([1, 2]),
    );
  });

  it("clears a selection that spans pages", async () => {
    renderTab();
    await tickRow("C26-00001");
    await goToPage2();
    await tickRow("C26-00002");

    fireEvent.click(await screen.findByRole("button", { name: "ล้างที่เลือก" }));

    expect(await screen.findByRole("button", { name: /ทำลาย \(0\)/ })).toBeDisabled();
    expect(screen.getByText("เลือกแล้ว: 0 สไลด์")).toBeInTheDocument();
  });
});

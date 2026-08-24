import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import DisposalBatchTab from "./DisposalBatchTab";
import SpecimenDisposalService from "../../services/specimenDisposalService";
import type { DisposalBatch } from "../../types/specimenDisposal";

vi.mock("../../services/specimenDisposalService", () => ({
  default: {
    getAll: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    openChecklistPdf: vi.fn(),
  },
}));

const makeBatch = (overrides: Partial<DisposalBatch> = {}): DisposalBatch =>
  ({
    id: 7,
    batch_no: "DSP-2026-0007",
    status: "PRINTED",
    retention_days: 90,
    printed_at: "2026-08-24T14:30:00",
    printed_by: { id: 1, username: "korawit", full_name: "กรวิทย์ ทวินกาญจน์" },
    disposer_name: "สมชาย ใจดี",
    verifier_name: "สมหญิง รักงาน",
    approver_name: "ประเสริฐ วงศ์ดี",
    item_count: 2,
    items: [
      {
        id: 1,
        case_id: 11,
        container_snapshot: "B-12",
        accession_no: "S26-00123",
        hn: "0012345",
        patient_name: "นางสมศรี ใจงาม",
      },
      {
        id: 2,
        case_id: 12,
        container_snapshot: "B-13",
        accession_no: "S26-00124",
        hn: "0012346",
        patient_name: "นายวิชัย ศรีสุข",
      },
    ],
    ...overrides,
  }) as DisposalBatch;

const mockList = (batches: DisposalBatch[]) =>
  (SpecimenDisposalService.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: batches,
    total: batches.length,
  });

/** ป้ายสถานะกับตัวกรอง Segmented ใช้คำเดียวกัน จึงต้องถามเฉพาะในตาราง */
const inTable = () => within(document.querySelector(".ant-table") as HTMLElement);
const inFilter = () =>
  within(document.querySelector(".ant-segmented") as HTMLElement);
const inDialog = () =>
  within(document.querySelector(".ant-modal-confirm") as HTMLElement);

const renderTab = (props: Partial<React.ComponentProps<typeof DisposalBatchTab>> = {}) =>
  render(
    <AntdApp>
      <DisposalBatchTab {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockList([makeBatch()]);
});

describe("DisposalBatchTab", () => {
  it("opens on the sheets still waiting to be checked", async () => {
    renderTab();
    await waitFor(() =>
      expect(SpecimenDisposalService.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PRINTED" }),
      ),
    );
    expect(await screen.findByText("DSP-2026-0007")).toBeInTheDocument();
    expect(inTable().getByText("รอตรวจสอบหน้างาน")).toBeInTheDocument();
  });

  it("lists all three signers so the paper can be matched to the record", async () => {
    renderTab();
    expect(await screen.findByText("สมชาย ใจดี")).toBeInTheDocument();
    expect(screen.getByText("สมหญิง รักงาน")).toBeInTheDocument();
    expect(screen.getByText("ประเสริฐ วงศ์ดี")).toBeInTheDocument();
  });

  it("offers confirm and cancel only while the sheet is open", async () => {
    renderTab();
    await screen.findByText("DSP-2026-0007");
    expect(screen.getByRole("button", { name: /ยืนยันทำลาย/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ยกเลิกใบ/ })).toBeInTheDocument();
  });

  it("leaves only reprint on a sheet that is already disposed", async () => {
    mockList([
      makeBatch({
        status: "DISPOSED",
        disposed_at: "2026-08-25T09:00:00",
        disposal_method: "เตาเผาขยะติดเชื้อ",
      }),
    ]);
    renderTab();
    await screen.findByText("DSP-2026-0007");

    expect(inTable().getByText("ทำลายแล้ว")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /พิมพ์ซ้ำ/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ยืนยันทำลาย/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /ยกเลิกใบ/ })).toBeNull();
  });

  it("reprints the same sheet rather than making a new one", async () => {
    renderTab();
    await screen.findByText("DSP-2026-0007");

    fireEvent.click(screen.getByRole("button", { name: /พิมพ์ซ้ำ/ }));
    await waitFor(() =>
      expect(SpecimenDisposalService.openChecklistPdf).toHaveBeenCalledWith(7),
    );
  });

  it("names the disposer in the confirm dialog, then records the disposal", async () => {
    (SpecimenDisposalService.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBatch({ status: "DISPOSED" }),
    );
    const onChanged = vi.fn();
    renderTab({ onChanged });
    await screen.findByText("DSP-2026-0007");

    fireEvent.click(screen.getByRole("button", { name: /ยืนยันทำลาย/ }));

    await screen.findByPlaceholderText("เช่น เตาเผาขยะติดเชื้อ");
    expect(
      inDialog().getAllByText(/ยืนยันการทำลายตามใบ DSP-2026-0007/).length,
    ).toBeGreaterThan(0);
    // ผู้ทิ้งคือชื่อที่จะถูกบันทึกลงเคส คนกดยืนยันต้องเห็นก่อนกด
    expect(inDialog().getByText("สมชาย ใจดี")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("เช่น เตาเผาขยะติดเชื้อ"), {
      target: { value: "เตาเผาขยะติดเชื้อ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันทำลาย" }));

    await waitFor(() =>
      expect(SpecimenDisposalService.confirm).toHaveBeenCalledWith(7, {
        disposal_method: "เตาเผาขยะติดเชื้อ",
        remark: undefined,
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("sends the cancel reason along so the void is explainable", async () => {
    (SpecimenDisposalService.cancel as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBatch({ status: "CANCELLED" }),
    );
    renderTab();
    await screen.findByText("DSP-2026-0007");

    fireEvent.click(screen.getByRole("button", { name: /ยกเลิกใบ/ }));
    await screen.findByPlaceholderText("เหตุผล เช่น พิมพ์ผิดกล่อง");

    fireEvent.change(screen.getByPlaceholderText("เหตุผล เช่น พิมพ์ผิดกล่อง"), {
      target: { value: "พิมพ์ผิดกล่อง" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกใบนี้" }));

    await waitFor(() =>
      expect(SpecimenDisposalService.cancel).toHaveBeenCalledWith(7, "พิมพ์ผิดกล่อง"),
    );
  });

  it("refetches with the chosen status filter", async () => {
    renderTab();
    await screen.findByText("DSP-2026-0007");

    fireEvent.click(inFilter().getByText("ทำลายแล้ว"));
    await waitFor(() =>
      expect(SpecimenDisposalService.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: "DISPOSED" }),
      ),
    );

    fireEvent.click(inFilter().getByText("ทั้งหมด"));
    await waitFor(() =>
      expect(SpecimenDisposalService.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      ),
    );
  });
});

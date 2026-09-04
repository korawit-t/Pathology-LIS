import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import NongyneDisposalBatchTab from "./NongyneDisposalBatchTab";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type { NongyneDisposalBatch } from "../../types/nongyneSpecimenDisposal";

vi.mock("../../services/nongyneSpecimenDisposalService", () => ({
  default: {
    getAll: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    openChecklistPdf: vi.fn(),
  },
}));

const svc = NongyneSpecimenDisposalService as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

const makeBatch = (
  overrides: Partial<NongyneDisposalBatch> = {},
): NongyneDisposalBatch =>
  ({
    id: 7,
    batch_no: "NDSP-2026-0007",
    status: "PRINTED",
    retention_days: 30,
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
        accession_no: "N26-00123",
        hn: "0012345",
        patient_name: "นางสมศรี ใจงาม",
        specimen_type: "Fluid",
        collection_site: "Pleural fluid",
        report_at: "2026-07-01T09:00:00",
        days_since_report: 65,
      },
      {
        id: 2,
        case_id: 12,
        accession_no: "N26-00124",
        hn: "0012346",
        patient_name: "นายวิชัย ศรีสุข",
        specimen_type: "Sputum",
        collection_site: "Sputum",
        report_at: "2026-07-10T09:00:00",
        days_since_report: 56,
      },
    ],
    ...overrides,
  }) as NongyneDisposalBatch;

const mockList = (batches: NongyneDisposalBatch[]) =>
  svc.getAll.mockResolvedValue({ items: batches, total: batches.length });

/** ป้ายสถานะกับตัวกรอง Segmented ใช้คำเดียวกัน จึงต้องถามเฉพาะในตาราง */
const inTable = () => within(document.querySelector(".ant-table") as HTMLElement);
const inFilter = () =>
  within(document.querySelector(".ant-segmented") as HTMLElement);
const inDialog = () =>
  within(document.querySelector(".ant-modal-confirm") as HTMLElement);

const renderTab = (
  props: Partial<React.ComponentProps<typeof NongyneDisposalBatchTab>> = {},
) =>
  render(
    <AntdApp>
      <NongyneDisposalBatchTab {...props} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockList([makeBatch()]);
});

describe("NongyneDisposalBatchTab", () => {
  it("opens on the sheets still waiting to be checked", async () => {
    renderTab();
    await waitFor(() =>
      expect(svc.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PRINTED" }),
      ),
    );
    expect(await inTable().findByText("NDSP-2026-0007")).toBeInTheDocument();
  });

  it("shows the three signers from the printed sheet", async () => {
    renderTab();
    expect(await inTable().findByText("สมชาย ใจดี")).toBeInTheDocument();
    expect(inTable().getByText("สมหญิง รักงาน")).toBeInTheDocument();
    expect(inTable().getByText("ประเสริฐ วงศ์ดี")).toBeInTheDocument();
  });

  it("labels a printed sheet as still needing a walk-round", async () => {
    renderTab();
    expect(await inTable().findByText("รอตรวจสอบหน้างาน")).toBeInTheDocument();
  });

  it("offers confirm and cancel only while the sheet is open", async () => {
    renderTab();
    expect(
      await inTable().findByRole("button", { name: /ยืนยันทำลาย/ }),
    ).toBeInTheDocument();
    expect(
      inTable().getByRole("button", { name: /ยกเลิกใบ/ }),
    ).toBeInTheDocument();
  });

  it("a closed sheet can only be reprinted", async () => {
    mockList([makeBatch({ status: "DISPOSED", disposed_at: "2026-09-01T10:00:00" })]);
    renderTab();
    expect(await inTable().findByText("ทำลายแล้ว")).toBeInTheDocument();
    expect(
      inTable().queryByRole("button", { name: /ยืนยันทำลาย/ }),
    ).not.toBeInTheDocument();
    expect(
      inTable().getByRole("button", { name: /พิมพ์ซ้ำ/ }),
    ).toBeInTheDocument();
  });

  it("reprints the sheet on demand", async () => {
    renderTab();
    fireEvent.click(await inTable().findByRole("button", { name: /พิมพ์ซ้ำ/ }));
    await waitFor(() => expect(svc.openChecklistPdf).toHaveBeenCalledWith(7));
  });

  it("confirming names the person who signed as disposer, not the clicker", async () => {
    svc.confirm.mockResolvedValue(makeBatch({ status: "DISPOSED" }));
    const onChanged = vi.fn();
    renderTab({ onChanged });
    await inTable().findByText("NDSP-2026-0007");

    fireEvent.click(screen.getByRole("button", { name: /ยืนยันทำลาย/ }));
    await screen.findByPlaceholderText("เช่น เตาเผาขยะติดเชื้อ");

    // the dialog title also lands in the accessible name, hence getAllByText
    expect(
      inDialog().getAllByText(/ยืนยันการทำลายตามใบ NDSP-2026-0007/).length,
    ).toBeGreaterThan(0);
    // ผู้ทิ้งคือชื่อที่จะถูกบันทึกลงเคส คนกดยืนยันต้องเห็นก่อนกด
    expect(inDialog().getByText("สมชาย ใจดี")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("เช่น เตาเผาขยะติดเชื้อ"), {
      target: { value: "เตาเผาขยะติดเชื้อ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันทำลาย" }));

    await waitFor(() =>
      expect(svc.confirm).toHaveBeenCalledWith(7, {
        disposal_method: "เตาเผาขยะติดเชื้อ",
        remark: undefined,
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("sends the cancel reason along so the void is explainable", async () => {
    svc.cancel.mockResolvedValue(makeBatch({ status: "CANCELLED" }));
    const onChanged = vi.fn();
    renderTab({ onChanged });
    await inTable().findByText("NDSP-2026-0007");

    fireEvent.click(screen.getByRole("button", { name: /ยกเลิกใบ/ }));
    await screen.findByPlaceholderText("เหตุผล เช่น พิมพ์ผิดรอบ");

    fireEvent.change(screen.getByPlaceholderText("เหตุผล เช่น พิมพ์ผิดรอบ"), {
      target: { value: "พิมพ์ผิดรอบ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกใบนี้" }));

    await waitFor(() => expect(svc.cancel).toHaveBeenCalledWith(7, "พิมพ์ผิดรอบ"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("filtering by status refetches", async () => {
    renderTab();
    await waitFor(() => expect(svc.getAll).toHaveBeenCalled());

    fireEvent.click(inFilter().getByText("ทำลายแล้ว"));
    await waitFor(() =>
      expect(svc.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: "DISPOSED" }),
      ),
    );
  });

  it("groups the row summary by specimen type, since there are no boxes", async () => {
    renderTab();
    expect(await inTable().findByText("2 รายการ")).toBeInTheDocument();
  });
});

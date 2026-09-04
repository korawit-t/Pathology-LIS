import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import NongyneSpecimenDisposal from "./index";
import NongyneSpecimenDisposalService from "../../services/nongyneSpecimenDisposalService";
import type { NongyneDisposalCandidate } from "../../types/nongyneSpecimenDisposal";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/userService", () => ({
  default: { getUsers: vi.fn().mockResolvedValue([]) },
}));

vi.mock("../../services/nongyneSpecimenDisposalService", () => ({
  default: {
    getCandidates: vi.fn(),
    getDisposed: vi.fn(),
    getOpenCount: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    openChecklistPdf: vi.fn(),
  },
}));

const RETENTION = 30;

const makeCandidate = (
  overrides: Partial<NongyneDisposalCandidate> = {},
): NongyneDisposalCandidate =>
  ({
    id: 11,
    accession_no: "N26-00123",
    hn: "0012345",
    status: "published",
    specimen_type: "Fluid",
    collection_site: "Pleural fluid",
    report_at: "2026-07-01T09:00:00",
    is_pending: false,
    pending_reason: null,
    days_since_report: 65,
    is_due: true,
    block_reason: null,
    discard_status: false,
    discard_at: null,
    specimen_disposer: null,
    patient: { id: 3, name: "สมศรี", ln: "ใจงาม", title: { title: "นาง" } },
    ...overrides,
  }) as NongyneDisposalCandidate;

const svc = NongyneSpecimenDisposalService as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

const mockCandidates = (items: NongyneDisposalCandidate[]) =>
  svc.getCandidates.mockResolvedValue({
    items,
    total: items.length,
    retention_days: RETENTION,
  });

/** antd keeps inactive tab panes mounted, so a bare ".ant-table" lookup finds
 *  the first tab's table no matter which tab is showing. */
const inTable = () =>
  within(
    document.querySelector(
      ".ant-tabs-tabpane-active .ant-table",
    ) as HTMLElement,
  );
const inFilter = () =>
  within(document.querySelector(".ant-segmented") as HTMLElement);

const renderPage = () =>
  render(
    <AntdApp>
      <NongyneSpecimenDisposal />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockCandidates([makeCandidate()]);
  svc.getDisposed.mockResolvedValue({ items: [], total: 0, retention_days: RETENTION });
  svc.getOpenCount.mockResolvedValue(2);
  svc.getAll.mockResolvedValue({ items: [], total: 0 });
});

describe("NongyneSpecimenDisposal", () => {
  it("opens on the cases that are actually due", async () => {
    renderPage();
    await waitFor(() =>
      expect(svc.getCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: "due" }),
      ),
    );
    expect(await inTable().findByText("N26-00123")).toBeInTheDocument();
  });

  it("labels the due filter with the retention rule from the server", async () => {
    renderPage();
    await waitFor(() =>
      expect(inFilter().getByText(`ครบกำหนด (≥ ${RETENTION} วัน)`)).toBeInTheDocument(),
    );
  });

  it("shows the day count the server computed, not one it derives itself", async () => {
    renderPage();
    expect(await inTable().findByText("65 วัน")).toBeInTheDocument();
  });

  it("renders the full patient name with title and surname", async () => {
    renderPage();
    expect(await inTable().findByText("นาง สมศรี ใจงาม")).toBeInTheDocument();
  });

  it("switching bucket refetches with that bucket", async () => {
    renderPage();
    await waitFor(() => expect(svc.getCandidates).toHaveBeenCalled());

    fireEvent.click(inFilter().getByText("ค้าง Pending"));
    await waitFor(() =>
      expect(svc.getCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: "blocked" }),
      ),
    );
  });

  it("cannot start a sheet with nothing selected", async () => {
    renderPage();
    const button = await screen.findByRole("button", {
      name: /สร้างใบตรวจสอบก่อนทำลาย \(0\)/,
    });
    expect(button).toBeDisabled();
  });

  it("cases that are not due are read-only — no checkboxes to select them", async () => {
    renderPage();
    await waitFor(() => expect(svc.getCandidates).toHaveBeenCalled());
    expect(inTable().queryAllByRole("checkbox").length).toBeGreaterThan(0);

    fireEvent.click(inFilter().getByText("ยังไม่ครบกำหนด"));
    await waitFor(() =>
      expect(svc.getCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: "not_due" }),
      ),
    );
    await waitFor(() =>
      expect(inTable().queryAllByRole("checkbox")).toHaveLength(0),
    );
  });

  it("selecting a due case enables the sheet button", async () => {
    renderPage();
    await waitFor(() => expect(svc.getCandidates).toHaveBeenCalled());

    const rowCheckbox = inTable().getAllByRole("checkbox").at(-1) as HTMLElement;
    fireEvent.click(rowCheckbox);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /สร้างใบตรวจสอบก่อนทำลาย \(1\)/ }),
      ).toBeEnabled(),
    );
  });

  it("flags a pending case rather than offering it for disposal", async () => {
    mockCandidates([
      makeCandidate({
        is_pending: true,
        pending_reason: "รอ cell block",
        is_due: false,
        block_reason: "ค้าง Pending (รอ cell block)",
      }),
    ]);
    renderPage();
    expect(await inTable().findByText("ค้าง Pending")).toBeInTheDocument();
  });

  it("badges the open sheets waiting to be checked", async () => {
    renderPage();
    const tab = await screen.findByRole("tab", { name: /รอบการทำลาย/ });
    await waitFor(() => expect(within(tab).getByText("2")).toBeInTheDocument());
  });

  it("the disposed tab lists what was already thrown away", async () => {
    svc.getDisposed.mockResolvedValue({
      items: [
        makeCandidate({
          discard_status: true,
          discard_at: "2026-09-01T10:00:00",
          specimen_disposer: { id: 5, username: "somchai", full_name: "สมชาย ใจดี" },
        }),
      ],
      total: 1,
      retention_days: RETENTION,
    });
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /ทำลายแล้ว/ }));
    await waitFor(() => expect(svc.getDisposed).toHaveBeenCalled());
    expect(await inTable().findByText("สมชาย ใจดี")).toBeInTheDocument();
  });
});

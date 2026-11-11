/**
 * IHC TAT dashboard. What matters is that it reads the backend's numbers
 * honestly: medians in working days (a missing median reads as "—", never 0),
 * the distribution drills down to the right requests, and the "not out yet"
 * list flags old requests and filters by stage. Patients are always shown with
 * title and last name.
 */

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import IhcTatDashboard from "./IhcTatDashboard";
import SurgicalReportService from "../../services/surgicalReportService";
import type { IhcOutstandingCase, IhcTatRequest, IhcTatStats } from "../../types/surgicalReport";

vi.mock("../../services/surgicalReportService", () => ({
  default: { getIhcTat: vi.fn(), getIhcOutstanding: vi.fn() },
}));

// recharts needs a real layout box; jsdom reports 0x0 and renders nothing.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const request = (over: Partial<IhcTatRequest>): IhcTatRequest => ({
  case_id: 1,
  accession_no: "S26-00001",
  patient_title: "นาง",
  patient_name: "สมศรี",
  patient_ln: "ใจดี",
  markers: ["CD20", "CD3"],
  slides: 2,
  source: "outlab",
  lab: "สถาบันพยาธิวิทยา",
  ordered_at: "2026-10-01T09:00:00",
  sent_at: "2026-10-02T09:00:00",
  ready_at: "2026-10-14T09:00:00",
  signed_at: "2026-10-15T09:00:00",
  released_at: "2026-10-15T09:00:00",
  total_days: 10,
  outlab_days: 8,
  reading_days: 1,
  approval_days: 0,
  bucket: "t5_10",
  on_time: false,
  ...over,
});

const stats = (over: Partial<IhcTatStats> = {}): IhcTatStats => ({
  summary: {
    requests: 2,
    slides: 3,
    outlab_requests: 1,
    inhouse_requests: 1,
    median_total_days: 6,
    median_outlab_days: 8,
    median_reading_days: null,
    median_approval_days: 1.5,
    target_days: 5,
    on_time_count: 1,
    on_time_pct: 50,
  },
  distribution: { lt3: 1, t3_5: 0, t5_10: 1, gt10: 0 },
  monthly: [{ month: "2026-10", requests: 2, median_total_days: 6, on_time_pct: 50 }],
  by_lab: [{ lab: "สถาบันพยาธิวิทยา", requests: 1, median_outlab_days: 8, max_outlab_days: 8 }],
  requests: [
    request({}),
    request({
      case_id: 2, accession_no: "S26-00002", patient_name: "สมชาย", patient_ln: "รักดี", markers: ["p53"],
      slides: 1, source: "in-house", lab: null, total_days: 2, outlab_days: null, bucket: "lt3", on_time: true,
    }),
  ],
  ...over,
});

const openCase = (over: Partial<IhcOutstandingCase>): IhcOutstandingCase => ({
  case_id: 10,
  accession_no: "S26-00010",
  patient_title: "นาย",
  patient_name: "มานะ",
  patient_ln: "ขยัน",
  markers: [{ name: "Ki-67", status: "sent", is_external: true }],
  stage: "sent",
  ordered_at: "2026-10-20T09:00:00",
  sent_at: "2026-10-21T09:00:00",
  lab: "สถาบันพยาธิวิทยา",
  signed_at: null,
  age_days: 14,
  overdue: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

const renderPage = (s: IhcTatStats, open: IhcOutstandingCase[]) => {
  vi.mocked(SurgicalReportService.getIhcTat).mockResolvedValue(s);
  vi.mocked(SurgicalReportService.getIhcOutstanding).mockResolvedValue(open);
  return render(<IhcTatDashboard />);
};

it("shows the medians in working days, and a missing median as a dash", async () => {
  renderPage(stats(), []);

  // The target comes from Admin → Workflow (ihc_tat_days), via the backend
  expect(await screen.findByText("Within target (≤ 5 d)")).toBeInTheDocument();
  expect(screen.getByText("50%")).toBeInTheDocument();
  expect(screen.getByText("1 / 2 requests")).toBeInTheDocument();
  expect(screen.getByText(/Target: 5 working days/)).toBeInTheDocument();

  expect(await screen.findByText("Median order → out")).toBeInTheDocument();
  expect(screen.getByText("6 d")).toBeInTheDocument();
  expect(screen.getByText("2 requests · 3 slides")).toBeInTheDocument();
  expect(screen.getAllByText("8 d").length).toBeGreaterThan(0);
  // median_reading_days is null: no reading time recorded, not zero
  const readingCard = screen.getByText("Median slide ready → signed").parentElement!;
  expect(within(readingCard).getByText("—")).toBeInTheDocument();
  // ...and the approval wait (sign-off → published) rides along
  expect(within(readingCard).getByText("reading · then approval 1.5 d")).toBeInTheDocument();
  expect(screen.getByText(/published to the clinician/)).toBeInTheDocument();
  expect(screen.getByText("nothing outstanding")).toBeInTheDocument();
});

it("drills a distribution bucket down to its requests, with full patient names", async () => {
  renderPage(stats(), []);

  fireEvent.click(await screen.findByRole("button", { name: "5–10 days: 1 requests" }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("S26-00001")).toBeInTheDocument();
  expect(within(dialog).getByText("นาง สมศรี ใจดี")).toBeInTheDocument();
  expect(within(dialog).queryByText("S26-00002")).not.toBeInTheDocument();
  expect(within(dialog).getByText("Late")).toBeInTheDocument();
  // An empty bucket isn't clickable
  expect(screen.queryByRole("button", { name: "3–5 days: 0 requests" })).not.toBeInTheDocument();
});

it("flags old outstanding requests and filters them by stage", async () => {
  renderPage(stats(), [
    openCase({}),
    openCase({
      case_id: 11, accession_no: "S26-00011", patient_name: "ปิติ", patient_ln: "ยินดี",
      markers: [{ name: "ER", status: "stained", is_external: true }], stage: "stained",
      sent_at: null, lab: null, age_days: 3, overdue: false,
    }),
    openCase({
      case_id: 12, accession_no: "S26-00012", patient_name: "ชูใจ", patient_ln: "มีสุข",
      markers: [{ name: "PR", status: "signed", is_external: true }], stage: "signed",
      sent_at: null, lab: null, signed_at: "2026-11-02T09:00:00", age_days: 4, overdue: false,
    }),
  ]);

  expect(await screen.findByText("3 cases")).toBeInTheDocument();
  // Signed off but not published yet: still not out to the clinician
  expect(screen.getByText("Signed, awaiting approval")).toBeInTheDocument();
  expect(screen.getByText("signed 02/11/2026")).toBeInTheDocument();
  expect(screen.getByText("1 past target (5 d) · oldest 14 d")).toBeInTheDocument();
  expect(screen.getByText("นาย มานะ ขยัน")).toBeInTheDocument();
  expect(screen.getByText("14 d").closest(".ant-typography")).toHaveClass("ant-typography-danger");
  expect(screen.getByText("3 d").closest(".ant-typography")).not.toHaveClass("ant-typography-danger");
  expect(screen.getByText("สถาบันพยาธิวิทยา · sent 21/10/2026")).toBeInTheDocument();

  fireEvent.click(screen.getByText("Ready to read (1)"));

  await waitFor(() => expect(screen.queryByText("S26-00010")).not.toBeInTheDocument());
  expect(screen.getByText("S26-00011")).toBeInTheDocument();
});

it("reloads both views for the picked period", async () => {
  renderPage(stats(), []);
  await waitFor(() => expect(SurgicalReportService.getIhcTat).toHaveBeenCalledTimes(1));
  expect(SurgicalReportService.getIhcOutstanding).toHaveBeenCalledTimes(1);

  const refresh = screen.getByRole("button", { name: /Refresh/ });
  await waitFor(() => expect(refresh).not.toHaveClass("ant-btn-loading"));
  fireEvent.click(refresh);

  await waitFor(() => expect(SurgicalReportService.getIhcTat).toHaveBeenCalledTimes(2));
  expect(SurgicalReportService.getIhcOutstanding).toHaveBeenCalledTimes(2);
});

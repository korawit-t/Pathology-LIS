/**
 * The print queue is the one page whose PDFs go straight to paper, so every
 * case type must ask the backend for the report *with* its footer barcode.
 *
 * Gyne and non-gyne silently printed without one for a long time: the backend
 * flag and the template block simply did not exist for them, and once they did
 * the remaining way to regress is for a call site here to stop passing it.
 * These assert the argument rather than the rendered PDF for that reason.
 */

import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import PrintReportQueue from "./PrintReportQueue";
import SurgicalReportService from "../../services/surgicalReportService";
import GyneReportService from "../../services/gyneReportService";
import NongyneReportService from "../../services/nongyneReportService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

const makeRow = (id: number, accession: string) => ({
  items: [
    {
      id,
      accession_no: accession,
      patient_title: "นางสาว",
      patient_name: "Somsri",
      patient_ln: "Jaidee",
      patient_hn: "HN001",
      patient_age: 42,
      patient_gender: "Female",
      is_print: false,
      published_at: "2026-08-17T09:00:00",
    },
  ],
  total: 1,
});

vi.mock("../../services/surgicalReportService", () => ({
  default: {
    getAllReports: vi.fn(),
    getReportPdf: vi.fn(),
    updatePrintStatus: vi.fn(),
    getBarcodePdf: vi.fn(),
  },
}));
vi.mock("../../services/gyneReportService", () => ({
  default: {
    getAllReports: vi.fn(),
    getReportPdf: vi.fn(),
    updatePrintStatus: vi.fn(),
    getBarcodePdf: vi.fn(),
  },
}));
vi.mock("../../services/nongyneReportService", () => ({
  default: {
    getAllReports: vi.fn(),
    getReportPdf: vi.fn(),
    updatePrintStatus: vi.fn(),
    getBarcodePdf: vi.fn(),
  },
}));

vi.mock("../../components/ReportPreviewModal", () => ({
  default: () => <div data-testid="mock-report-preview" />,
}));

const services = {
  Surgical: { service: SurgicalReportService, id: 1, accession: "S26-02047" },
  "Gyne Cyto": { service: GyneReportService, id: 2, accession: "C26-00123" },
  "NonGyne Cyto": { service: NongyneReportService, id: 3, accession: "N26-00456" },
} as const;

type TabName = keyof typeof services;

const renderQueue = () => render(
  <AntdApp>
    <PrintReportQueue />
  </AntdApp>,
);

/** Switch to `tab` (surgical is already open) and click its row's PDF button. */
const openPdfOn = async (tab: TabName) => {
  const { accession } = services[tab];
  if (tab !== "Surgical") {
    fireEvent.click(within(screen.getByRole("tablist")).getByText(tab));
  }
  await waitFor(() => expect(screen.getByText(accession)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /PDF/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:test");
  globalThis.URL.revokeObjectURL = vi.fn();
  for (const { service, id, accession } of Object.values(services)) {
    (service.getAllReports as ReturnType<typeof vi.fn>).mockResolvedValue(makeRow(id, accession));
    (service.getReportPdf as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob(["%PDF"]));
  }
});

describe("PrintReportQueue ordering", () => {
  it.each(Object.keys(services) as TabName[])(
    "asks the backend to put %s reports still awaiting print first",
    async (tab) => {
      renderQueue();
      const { service, accession } = services[tab];
      if (tab !== "Surgical") {
        fireEvent.click(within(screen.getByRole("tablist")).getByText(tab));
      }
      await waitFor(() => expect(screen.getByText(accession)).toBeInTheDocument());

      // last arg is unprinted_first — without it a printed report can outrank a
      // pending one and push it off the first pages
      expect(service.getAllReports).toHaveBeenCalledWith(1, 10, "", "published", undefined, true);
    },
  );
});

describe("PrintReportQueue barcode requests", () => {
  it.each(Object.keys(services) as TabName[])(
    "asks for the %s report with its footer barcode",
    async (tab) => {
      renderQueue();
      await openPdfOn(tab);

      const { service, id } = services[tab];
      await waitFor(() => expect(service.getReportPdf).toHaveBeenCalledWith(id, true));
    },
  );

  it("does not fetch another case type's report when a tab is opened", async () => {
    renderQueue();
    await openPdfOn("NonGyne Cyto");

    await waitFor(() => expect(NongyneReportService.getReportPdf).toHaveBeenCalled());
    expect(SurgicalReportService.getReportPdf).not.toHaveBeenCalled();
    expect(GyneReportService.getReportPdf).not.toHaveBeenCalled();
  });
});

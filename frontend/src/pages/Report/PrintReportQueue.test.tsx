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
import { MolecularCaseService } from "../../services/molecularCaseService";

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

// Molecular is the odd one out: it has no report table, so the queue reads
// CASES and picks between two PDF endpoints depending on whether an out-lab
// file was uploaded. Mocked separately for that reason.
vi.mock("../../services/molecularCaseService", () => ({
  MolecularCaseService: {
    getPrintQueue: vi.fn(),
    getOutlabPdfBlob: vi.fn(),
    getResultPdfBlob: vi.fn(),
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
  mocked(MolecularCaseService.getPrintQueue).mockResolvedValue(makeMolecularQueue());
  mocked(MolecularCaseService.getOutlabPdfBlob).mockResolvedValue(new Blob(["%PDF"]));
  mocked(MolecularCaseService.getResultPdfBlob).mockResolvedValue(new Blob(["%PDF"]));
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


/** Molecular queue rows are cases, so they carry `hn`/`reported_at` rather than
 *  the report shape's `patient_hn`/`published_at`, and `patient_name` is already
 *  the full title+name+surname string. */
const makeMolecularQueue = (hasOutlabPdf = false) => ({
  items: [
    {
      id: 4,
      accession_no: "M26-00789",
      patient_name: "นางสาว Somsri Jaidee",
      hn: "HN004",
      patient_gender: "Female",
      patient_age_display: "42 ปี",
      test_name: "EGFR Mutation Analysis",
      status: "reported",
      is_outlab: hasOutlabPdf,
      is_print: false,
      is_cancelled: false,
      ap_test_id: 1,
      registrar_id: 1,
      reported_at: "2026-08-17T09:00:00",
      outlab_pdf_path: hasOutlabPdf ? "/storage/outlab/result.pdf" : null,
    },
  ],
  total: 1,
  page: 1,
  size: 10,
});

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const openMolecularTab = async () => {
  fireEvent.click(within(screen.getByRole("tablist")).getByText("Molecular"));
  await waitFor(() => expect(screen.getByText("M26-00789")).toBeInTheDocument());
};

/** The row itself — "Molecular" and "Mark Printed" both also appear outside it
 *  (the tab label, the bulk toolbar), so row-level assertions must be scoped. */
const molecularRow = () => screen.getByText("M26-00789").closest("tr") as HTMLElement;

describe("PrintReportQueue Molecular tab", () => {
  it("asks the backend to put cases still awaiting print first", async () => {
    renderQueue();
    await openMolecularTab();

    expect(MolecularCaseService.getPrintQueue).toHaveBeenCalledWith({
      page: 1,
      size: 10,
      search: undefined,
      unprinted_first: true,
    });
  });

  it("asks for the out-lab PDF with its footer barcode when one was uploaded", async () => {
    mocked(MolecularCaseService.getPrintQueue).mockResolvedValue(makeMolecularQueue(true));
    renderQueue();
    await openMolecularTab();
    fireEvent.click(within(molecularRow()).getByRole("button", { name: /PDF/i }));

    await waitFor(() =>
      expect(MolecularCaseService.getOutlabPdfBlob).toHaveBeenCalledWith(4, true),
    );
    expect(MolecularCaseService.getResultPdfBlob).not.toHaveBeenCalled();
  });

  it("falls back to the in-house result PDF, also with its barcode", async () => {
    renderQueue();
    await openMolecularTab();
    fireEvent.click(within(molecularRow()).getByRole("button", { name: /PDF/i }));

    await waitFor(() =>
      expect(MolecularCaseService.getResultPdfBlob).toHaveBeenCalledWith(4, true),
    );
    expect(MolecularCaseService.getOutlabPdfBlob).not.toHaveBeenCalled();
  });

  it("marks print status against the molecular endpoint, not a report one", async () => {
    mocked(MolecularCaseService.updatePrintStatus).mockResolvedValue({});
    renderQueue();
    await openMolecularTab();

    fireEvent.click(within(molecularRow()).getByRole("button", { name: /Mark Printed/i }));
    fireEvent.click(await screen.findByRole("button", { name: "ใช่" }));

    await waitFor(() =>
      expect(MolecularCaseService.updatePrintStatus).toHaveBeenCalledWith(4, true),
    );
    expect(SurgicalReportService.updatePrintStatus).not.toHaveBeenCalled();
    expect(NongyneReportService.updatePrintStatus).not.toHaveBeenCalled();
  });

  it("renders the case row using the case-shaped fields", async () => {
    renderQueue();
    await openMolecularTab();

    const row = within(molecularRow());
    expect(row.getByText("นางสาว Somsri Jaidee")).toBeInTheDocument();
    expect(row.getByText(/HN004/)).toBeInTheDocument();
    expect(row.getByText(/Female/)).toBeInTheDocument();
    expect(row.getByText("Molecular")).toBeInTheDocument();
    expect(row.getByText("Pending Print")).toBeInTheDocument();
  });
});

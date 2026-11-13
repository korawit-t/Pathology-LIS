/**
 * The Non-Gyne worklists drew their cells with Tailwind classes this project
 * does not have, so they looked unlike the Gyne tab next to them. They now use
 * the same cells as Gyne (nongyneWorklistCells).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import PathologistNongyneWorklist from "./PathologistNongyneWorklist";
import NongyneCytoWorklist from "./NongyneCytoWorklist";

const rows = vi.hoisted(() => [
  {
    id: 11,
    accession_no: "N26-00045",
    registered_at: "2026-11-12T00:33:00",
    patient: { title: { title: "นาง" }, name: "สมศรี", ln: "ใจดี" },
    hospital: { name: "โรงพยาบาลตัวอย่าง" },
    hn: "6512345",
    specimen_type: "Pleural fluid",
    collection_site: "Right pleura",
    status: "published",
    is_screened: true,
    is_reported: true,
    cytotechnologist: { id: 2, full_name: "CT Somchai" },
    pathologist_id: 1,
  },
]);

vi.mock("../../services/userService", () => ({
  default: { getCurrentUser: vi.fn().mockResolvedValue({ id: 1, roles: ["pathologist"] }) },
}));
vi.mock("../../services/systemSettingService", () => ({
  default: { getSettings: vi.fn().mockResolvedValue({ non_gyne_tat_days: 5 }) },
}));
vi.mock("../../services/holidayService", () => ({
  default: { getHolidayDateList: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../services/nongyneCytoCaseService", () => ({
  default: { getAll: vi.fn().mockResolvedValue({ items: rows, total: rows.length }) },
}));
vi.mock("../../services/nongyneReportService", () => ({
  default: { getPendingCosignWorklist: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
}));

const headers = () => [...document.querySelectorAll(".ant-table-thead th")].map((th) => th.textContent?.trim()).filter(Boolean);

const TAILWIND = ["font-medium", "text-xs", "text-gray-500", "text-gray-400", "rounded-full", "bg-white", "bg-indigo-600"];
const tailwindLeft = () => TAILWIND.filter((cls) => document.querySelector(`.${cls}`));

describe("My Worklist > Non-Gyne Cytology tab", () => {
  it("has Gyne's columns, borders and filter description", async () => {
    render(<PathologistNongyneWorklist onSelectCase={vi.fn()} standAlone={false} />);
    await screen.findByText("N26-00045");

    expect(headers()).toEqual([
      "Accession No.",
      "Registered At",
      "Patient",
      "Specimen",
      "Cytotechnologist",
      "TAT / PROGRESS",
      "Status",
    ]);
    expect(document.querySelector(".ant-table-bordered")).not.toBeNull();
    expect(screen.getByText("All cases assigned to you")).toBeInTheDocument();
  });

  it("draws the row the way Gyne does", async () => {
    render(<PathologistNongyneWorklist onSelectCase={vi.fn()} standAlone={false} />);
    await screen.findByText("N26-00045");

    expect(screen.getByText("12/11/2026 00:33")).toBeInTheDocument();
    expect(screen.getByText("CT Somchai")).toBeInTheDocument();
    expect(screen.getByText("Published").closest(".ant-tag")).toHaveClass("ant-tag-green");
    expect(tailwindLeft()).toEqual([]);
  });
});

describe("Non-Gyne Cytology > Worklist (cytotechnologist)", () => {
  it("shows a published case as Published, not Screened, without Tailwind classes", async () => {
    render(<NongyneCytoWorklist onSelectCase={vi.fn()} standAlone={false} />);
    await waitFor(() => expect(screen.getByText("N26-00045")).toBeInTheDocument());

    // In the rows: the filter bar has a "Screened" tab of its own.
    const body = within(document.querySelector(".ant-table-tbody") as HTMLElement);
    expect(body.getByText("Published")).toBeInTheDocument();
    expect(body.queryByText("Screened")).not.toBeInTheDocument();
    expect(screen.getByText("12/11/2026 00:33")).toBeInTheDocument();
    expect(tailwindLeft()).toEqual([]);
  });
});

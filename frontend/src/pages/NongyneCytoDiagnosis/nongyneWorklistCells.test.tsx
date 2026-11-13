import { render, screen } from "@testing-library/react";
import type { NongyneCytologyCase } from "../../types/nongyne";
import {
  displayStatus,
  formatRegisteredAt,
  renderPatientCell,
  renderSpecimenCell,
  renderStatusCell,
} from "./nongyneWorklistCells";

const row = (over: Partial<NongyneCytologyCase> = {}) =>
  ({
    id: 1,
    accession_no: "N26-00045",
    hn: "6512345",
    patient: { title: { title: "นาง" }, name: "สมศรี", ln: "ใจดี" },
    hospital: { name: "โรงพยาบาลตัวอย่าง" },
    specimen_type: "Pleural fluid",
    collection_site: "Right pleura",
    status: "stained",
    ...over,
  }) as unknown as NongyneCytologyCase;

describe("displayStatus", () => {
  it("shows Screened while the case is still being worked", () => {
    expect(displayStatus(row({ status: "stained", is_screened: true }))).toBe("screened");
  });

  // The cytotechnologist worklist used to show "Screened" for these.
  it.each(["published", "reported", "completed", "cancelled", "pending_approval"])(
    "keeps the final status %s even when the case was screened",
    (status) => {
      expect(displayStatus(row({ status, is_screened: true }))).toBe(status);
    },
  );
});

describe("renderStatusCell", () => {
  it.each([
    ["published", "Published", "ant-tag-green"],
    ["reported", "Reported", "ant-tag-green"],
    ["stained", "Stained", "ant-tag-cyan"],
  ])("draws %s as Gyne does: %s in %s", (status, label, cls) => {
    render(renderStatusCell(row({ status })));
    expect(screen.getByText(label).closest(".ant-tag")).toHaveClass(cls);
  });

  it("shows the out-lab consult badge only when asked (pathologist view)", () => {
    const consulting = row({ is_out_lab_consult: true, consult_status: "processing" } as Partial<NongyneCytologyCase>);
    const { unmount } = render(renderStatusCell(consulting, { consultBadge: true }));
    expect(screen.getByText("CONSULT: SENT")).toBeInTheDocument();
    unmount();

    render(renderStatusCell(consulting));
    expect(screen.queryByText("CONSULT: SENT")).not.toBeInTheDocument();
  });
});

describe("renderPatientCell", () => {
  it("prints hospital and HN smaller and greyer than the name", () => {
    render(renderPatientCell(row()));
    expect(screen.getByText("นาง สมศรี ใจดี")).toHaveStyle({ fontWeight: "500" });
    expect(screen.getByText("โรงพยาบาลตัวอย่าง")).toHaveStyle({ fontSize: "12px" });
    expect(screen.getByText("HN: 6512345")).toHaveStyle({ fontSize: "11px" });
  });

  it("falls back to a dash when the hospital is missing", () => {
    render(renderPatientCell(row({ hospital: undefined })));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("renderSpecimenCell", () => {
  it("tags the specimen and puts the site under it in small text", () => {
    render(renderSpecimenCell(row()));
    expect(screen.getByText("Pleural fluid").closest(".ant-tag")).toHaveClass("ant-tag-blue");
    expect(screen.getByText("Right pleura")).toHaveStyle({ fontSize: "12px" });
  });
});

describe("formatRegisteredAt", () => {
  it("is one line like Gyne and Surgical", () => {
    expect(formatRegisteredAt("2026-11-12T00:33:00")).toBe("12/11/2026 00:33");
    expect(formatRegisteredAt(null)).toBe("-");
  });
});

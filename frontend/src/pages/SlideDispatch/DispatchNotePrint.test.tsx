import React from "react";
import { render, screen, within } from "@testing-library/react";
import { DispatchNotePrint, totalSlides } from "./DispatchNotePrint";

const renderNote = (scannedCases: React.ComponentProps<typeof DispatchNotePrint>["scannedCases"]) =>
  render(<DispatchNotePrint scannedCases={scannedCases} pathologistName="พญ.อรทัย" />);

const rowFor = (accessionNo: string) =>
  screen.getByText(accessionNo).closest("tr") as HTMLElement;

describe("totalSlides", () => {
  it("sums every case's slide count", () => {
    expect(totalSlides([{ slide_count: 3 }, { slide_count: 2 }])).toBe(5);
  });

  it("is unknown when any case's count is unknown", () => {
    expect(totalSlides([{ slide_count: 3 }, { slide_count: null }])).toBeNull();
    expect(totalSlides([{ slide_count: 3 }, {}])).toBeNull();
  });
});

describe("DispatchNotePrint", () => {
  it("prints each case's slide count and the total", () => {
    renderNote([
      {
        id: 1,
        accession_no: "S26-00002",
        slide_count: 4,
        specimens: [{ blocks: [{ block_code: "A1" }, { block_code: "A2" }] }],
      },
      { id: 2, nongyne_cyto_case: { accession_no: "N26-00001" }, slide_count: 2 },
    ]);

    expect(within(rowFor("S26-00002")).getByText("4")).toBeInTheDocument();
    expect(within(rowFor("N26-00001")).getByText("2")).toBeInTheDocument();

    const footer = screen.getByText("Total: 2 case(s)").closest("tr") as HTMLElement;
    expect(within(footer).getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Total Slides:").closest(".ant-col")).toHaveTextContent("Total Slides: 6");
  });

  it("shows a dash for notes saved before slide counts were recorded", () => {
    renderNote([{ id: 1, accession_no: "S26-00003", slide_count: null }]);

    expect(within(rowFor("S26-00003")).getAllByText("-").length).toBeGreaterThan(0);
    const footer = screen.getByText("Total: 1 case(s)").closest("tr") as HTMLElement;
    expect(within(footer).getByText("-")).toBeInTheDocument();
  });
});

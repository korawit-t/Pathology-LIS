import { render, screen } from "@testing-library/react";
import { renderConsultBadge } from "./consultBadge";

describe("renderConsultBadge", () => {
  it("shows nothing for a case never flagged for consult", () => {
    expect(renderConsultBadge({})).toBeNull();
  });

  it("shows PENDING DISPATCH when flagged but not yet dispatched", () => {
    render(<>{renderConsultBadge({ is_out_lab_consult: true, consult_status: "pending" })}</>);
    expect(screen.getByText("CONSULT: PENDING DISPATCH")).toBeInTheDocument();
  });

  it("shows SENT when dispatched with no PDF yet", () => {
    render(<>{renderConsultBadge({ is_out_lab_consult: true, consult_status: "processing" })}</>);
    expect(screen.getByText("CONSULT: SENT")).toBeInTheDocument();
  });

  it("shows READY TO SIGN when dispatched with a PDF uploaded", () => {
    render(
      <>
        {renderConsultBadge({
          is_out_lab_consult: true,
          consult_status: "processing",
          consult_pdf_path: "/uploads/consults/consult.pdf",
        })}
      </>,
    );
    expect(screen.getByText("CONSULT: READY TO SIGN")).toBeInTheDocument();
  });

  it("shows nothing once the round is received (already resolved)", () => {
    expect(
      renderConsultBadge({ is_out_lab_consult: true, consult_status: "received" }),
    ).toBeNull();
  });
});

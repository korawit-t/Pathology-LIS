import { render, screen } from "@testing-library/react";
import MyConsultCases from "./MyConsultCases";
import { consultRound } from "../../../services/outlabConsultService";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import SurgicalCaseService from "../../../services/surgicalCaseService";

vi.mock("../../../services/surgicalCaseService", () => ({
  default: { getCases: vi.fn() },
}));

describe("consultRound", () => {
  it("takes the round off the consult number", () => {
    expect(consultRound("S26-02890-C1")).toBe("C1");
    expect(consultRound("S26-02890-C12")).toBe("C12");
  });

  it("is null when the case has no round", () => {
    expect(consultRound(null)).toBeNull();
    expect(consultRound(undefined)).toBeNull();
    expect(consultRound("S26-02890")).toBeNull();
  });
});

describe("MyConsultCases", () => {
  it("shows the round beside the status, leaving the accession as it is", async () => {
    vi.mocked(SurgicalCaseService.getCases).mockResolvedValue({
      items: [
        {
          id: 1,
          accession_no: "S26-02890",
          hn: "123",
          status: "signed out",
          consult_status: "processing",
          consult_no: "S26-02890-C2",
          patient: { name: "Somsri", ln: "Jaidee", title: { title: "Ms." } },
        },
      ],
      total: 1,
    } as never);

    render(
      <ThemeProvider>
        <MyConsultCases pathologistId={7} />
      </ThemeProvider>,
    );

    expect(await screen.findByText("S26-02890")).toBeInTheDocument();
    expect(screen.getByText("C2")).toBeInTheDocument();
    expect(screen.getByText("processing")).toBeInTheDocument();
    expect(screen.queryByText("S26-02890-C2")).not.toBeInTheDocument(); // only in the tooltip
  });
});

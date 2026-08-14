import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "../../../contexts/ThemeContext";
import InternalHosxpKeyTab from "./InternalHosxpKeyTab";
import SurgicalBlockStainService from "../../../services/surgicalBlockStainService";
import SurgicalCaseService from "../../../services/surgicalCaseService";

vi.mock("../../../services/surgicalBlockStainService", () => ({
  default: { toggleStainHosxpKeyed: vi.fn() },
}));
vi.mock("../../../services/surgicalCaseService", () => ({
  default: { getCases: vi.fn() },
}));

const stain = (overrides = {}) => ({
  id: 1,
  status: "stained",
  is_recut: false,
  is_hosxp_keyed: false,
  test: { name: "AFB", category: "Histochem", is_external: false },
  ...overrides,
});

const blocks = (stains) => [
  { accession_no: "S26-00001", specimen_label: "A", block_no: 1, stains },
];

const renderTab = (stains, props = {}) =>
  render(
    <ThemeProvider>
      <InternalHosxpKeyTab blocks={blocks(stains)} onRefresh={vi.fn()} {...props} />
    </ThemeProvider>,
  );

const mockGetCases = vi.mocked(SurgicalCaseService.getCases);
const mockToggle = vi.mocked(SurgicalBlockStainService.toggleStainHosxpKeyed);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCases.mockResolvedValue({
    items: [{ hn: "HN-001", patient: { title: { title: "นาย" }, name: "สมชาย", ln: "ใจดี" } }],
    total: 1,
  } as Awaited<ReturnType<typeof SurgicalCaseService.getCases>>);
  mockToggle.mockResolvedValue({});
});

describe("InternalHosxpKeyTab — which stains are listed", () => {
  it("lists in-house stains regardless of status, including pending ones", async () => {
    renderTab([
      stain({ id: 1, status: "pending", test: { name: "AFB", category: "Histochem", is_external: false } }),
      stain({ id: 2, status: "stained", test: { name: "GMS", category: "Special Stain", is_external: false } }),
    ]);

    expect(await screen.findByText("AFB")).toBeInTheDocument();
    expect(screen.getByText("GMS")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("excludes recuts, H&E and outsourced stains", async () => {
    renderTab([
      stain({ id: 1, test: { name: "AFB", category: "Histochem", is_external: false } }),
      stain({ id: 2, is_recut: true, test: { name: "H&E", category: "Histochem", is_external: false } }),
      stain({ id: 3, test: { name: "H&E", category: "Histochem", is_external: false } }),
      stain({ id: 4, test: { name: "CK7", category: "IHC", is_external: true } }),
    ]);

    expect(await screen.findByText("AFB")).toBeInTheDocument();
    expect(screen.queryByText("H&E")).not.toBeInTheDocument();
    expect(screen.queryByText("CK7")).not.toBeInTheDocument();
    expect(screen.getByText("All (1)")).toBeInTheDocument();
  });

  it("resolves HN and patient name from the accession number", async () => {
    renderTab([stain()]);

    expect(await screen.findByText("HN-001")).toBeInTheDocument();
    expect(screen.getByText("นาย สมชาย ใจดี")).toBeInTheDocument();
  });
});

// Two gotchas: the All/Pending/Keyed filter buttons also contain the word
// "Key" (so scope to the table body), and antd's icon contributes to the
// accessible name — the button reads as "check-circleKey", not "Key".
const rowButton = (name: RegExp) =>
  within(document.querySelector(".ant-table-tbody") as HTMLElement).getByRole("button", {
    name,
  });

describe("InternalHosxpKeyTab — keying", () => {
  it("keys a stain and flips the button to Keyed", async () => {
    renderTab([stain({ id: 7 })]);
    await screen.findByText("AFB");

    fireEvent.click(rowButton(/Key$/));

    await waitFor(() =>
      expect(SurgicalBlockStainService.toggleStainHosxpKeyed).toHaveBeenCalledWith(7, true),
    );
    await waitFor(() => expect(rowButton(/Keyed$/)).toBeInTheDocument());
  });

  it("unkeys an already-keyed stain", async () => {
    renderTab([stain({ id: 7, is_hosxp_keyed: true })]);
    await screen.findByText("AFB");

    fireEvent.click(rowButton(/Keyed$/));

    await waitFor(() =>
      expect(SurgicalBlockStainService.toggleStainHosxpKeyed).toHaveBeenCalledWith(7, false),
    );
  });

  it("rolls the button back when the request fails", async () => {
    mockToggle.mockRejectedValue(new Error("boom"));
    renderTab([stain({ id: 7 })]);
    await screen.findByText("AFB");

    fireEvent.click(rowButton(/Key$/));

    expect(await screen.findByText("Failed to update HosXP flag")).toBeInTheDocument();
    expect(rowButton(/Key$/)).toBeInTheDocument();
  });

  it("bulk-keys the selected rows", async () => {
    renderTab([stain({ id: 1 }), stain({ id: 2, test: { name: "GMS", category: "Histochem", is_external: false } })]);
    await screen.findByText("AFB");

    // header checkbox selects all selectable rows
    fireEvent.click(document.querySelector(".ant-table-thead input[type=checkbox]"));
    fireEvent.click(await screen.findByRole("button", { name: /Key Selected \(2\)/i }));

    await waitFor(() =>
      expect(SurgicalBlockStainService.toggleStainHosxpKeyed).toHaveBeenCalledTimes(2),
    );
    expect(SurgicalBlockStainService.toggleStainHosxpKeyed).toHaveBeenCalledWith(1, true);
    expect(SurgicalBlockStainService.toggleStainHosxpKeyed).toHaveBeenCalledWith(2, true);
  });
});

describe("InternalHosxpKeyTab — filters", () => {
  it("splits rows between Pending and Keyed", async () => {
    renderTab([
      stain({ id: 1, is_hosxp_keyed: false }),
      stain({ id: 2, is_hosxp_keyed: true, test: { name: "GMS", category: "Histochem", is_external: false } }),
    ]);
    await screen.findByText("AFB");

    expect(screen.getByText("All (2)")).toBeInTheDocument();
    expect(screen.getByText("Pending (1)")).toBeInTheDocument();
    expect(screen.getByText("Keyed (1)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Pending (1)"));
    expect(screen.getByText("AFB")).toBeInTheDocument();
    expect(screen.queryByText("GMS")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Keyed (1)"));
    expect(screen.getByText("GMS")).toBeInTheDocument();
    expect(screen.queryByText("AFB")).not.toBeInTheDocument();
  });

  it("searches across accession, HN, patient and stain name", async () => {
    renderTab([
      stain({ id: 1 }),
      stain({ id: 2, test: { name: "GMS", category: "Histochem", is_external: false } }),
    ]);
    await screen.findByText("AFB");

    fireEvent.change(screen.getByPlaceholderText(/Search by Accession No./i), {
      target: { value: "gms" },
    });

    expect(screen.getByText("GMS")).toBeInTheDocument();
    expect(screen.queryByText("AFB")).not.toBeInTheDocument();
  });

  it("renders an empty state when nothing is keyable", async () => {
    renderTab([stain({ id: 1, is_recut: true })]);

    expect(await screen.findByText("No internal stains to key")).toBeInTheDocument();
  });
});

describe("InternalHosxpKeyTab — category tag", () => {
  it("labels both Histochem and 'Special Stain' as SS", async () => {
    renderTab([
      stain({ id: 1, test: { name: "AFB", category: "Histochem", is_external: false } }),
      stain({ id: 2, test: { name: "GMS", category: "Special Stain", is_external: false } }),
    ]);
    await screen.findByText("AFB");

    // `.ant-table-row` skips antd's hidden measure row, which is tbody's first <tr>.
    const rows = document.querySelectorAll(".ant-table-tbody .ant-table-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("SS")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("SS")).toBeInTheDocument();
  });
});

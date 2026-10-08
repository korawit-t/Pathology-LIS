import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import CreateSlideStorageBatch from ".";
import SlideStorageService from "../../../../services/slideStorageService";

vi.mock("../../../../services/slideStorageService", () => ({
  default: { getPendingSlidesTree: vi.fn(), createStorageBatch: vi.fn() },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/** One case, one block, two stains cut from it — so both share a QR payload. */
const PENDING_TREE = [
  {
    key: "case-1",
    id: 1,
    code: "S26-00123",
    isCase: true,
    children: [
      {
        key: 11,
        id: 11,
        code: "S26-00123 A1 (H&E #1)",
        isCase: false,
        barcodes: ["S26-00123A01", "S26-00123A1"],
      },
      {
        key: 12,
        id: 12,
        code: "S26-00123 A1 (CK7 #2)",
        isCase: false,
        barcodes: ["S26-00123A01", "S26-00123A1"],
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("user", JSON.stringify({ id: 7, full_name: "Tech" }));
  mocked(SlideStorageService.getPendingSlidesTree).mockResolvedValue(PENDING_TREE);
});

const renderBatch = () =>
  render(
    <AntdApp>
      <CreateSlideStorageBatch
        onBack={vi.fn()}
        onSuccess={vi.fn()}
        stainCategory="HE"
      />
    </AntdApp>,
  );

const scan = async (value: string) => {
  const input = await screen.findByPlaceholderText(/Scan slide barcode/i);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyUp(input, { key: "Enter" });
};

describe("CreateSlideStorageBatch scanning", () => {
  it("finds the slide from the payload its sticker prints", async () => {
    // The QR holds accession + padded block code run together, which never
    // appears inside the readable row label — the bug this guards.
    renderBatch();
    await scan("S26-00123A01");

    expect(await screen.findByText("S26-00123 A1 (H&E #1)")).toBeInTheDocument();
  });

  it("still finds a slide from an older sticker's unpadded block code", async () => {
    renderBatch();
    await scan("S26-00123A1");

    expect(await screen.findByText("S26-00123 A1 (H&E #1)")).toBeInTheDocument();
  });

  it("ignores the case and separators a scanner emits", async () => {
    renderBatch();
    await scan(" s26 00123 a01 ");

    expect(await screen.findByText("S26-00123 A1 (H&E #1)")).toBeInTheDocument();
  });

  it("takes the next slide of a block when its QR is scanned again", async () => {
    // One QR covers every slide cut from a block, so filing both stains means
    // scanning the same code twice — the second must not be a duplicate.
    renderBatch();
    await scan("S26-00123A01");
    expect(await screen.findByText("S26-00123 A1 (H&E #1)")).toBeInTheDocument();

    await scan("S26-00123A01");
    expect(await screen.findByText("S26-00123 A1 (CK7 #2)")).toBeInTheDocument();
    expect(screen.getByText("Slides (2)")).toBeInTheDocument();
  });

  it("says the slide is already listed once the block is fully filed", async () => {
    renderBatch();
    await scan("S26-00123A01");
    await scan("S26-00123A01");
    await scan("S26-00123A01");

    expect(
      await screen.findByText("This slide is already in the scan list"),
    ).toBeInTheDocument();
  });

  it("accepts a hand-typed accession no", async () => {
    renderBatch();
    await scan("S26-00123");

    expect(await screen.findByText("S26-00123 A1 (H&E #1)")).toBeInTheDocument();
  });

  it("refuses a partial code that matches more than one case", async () => {
    // Mis-filing a slide under a neighbouring accession is worse than asking.
    mocked(SlideStorageService.getPendingSlidesTree).mockResolvedValue([
      ...PENDING_TREE,
      {
        key: "case-2",
        id: 2,
        code: "S26-00124",
        isCase: true,
        children: [
          {
            key: 21,
            id: 21,
            code: "S26-00124 A1 (H&E #1)",
            isCase: false,
            barcodes: ["S26-00124A01", "S26-00124A1"],
          },
        ],
      },
    ]);
    renderBatch();
    await scan("S26-0012");

    expect(await screen.findByText(/matches 2 cases/i)).toBeInTheDocument();
    expect(screen.getByText("Slides (0)")).toBeInTheDocument();
  });

  it("reports a slide that is not in the pending queue", async () => {
    renderBatch();
    await scan("S26-99999A01");

    expect(
      await screen.findByText("Slide not found in pending storage queue"),
    ).toBeInTheDocument();
  });

  it("sends the scanned stain ids on save", async () => {
    mocked(SlideStorageService.createStorageBatch).mockResolvedValue({ id: 1 });
    renderBatch();
    await scan("S26-00123A01");
    await screen.findByText("S26-00123 A1 (H&E #1)");

    fireEvent.click(screen.getByRole("button", { name: /Finish|Save|Confirm/i }));

    await waitFor(() =>
      expect(SlideStorageService.createStorageBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          stain_category: "HE",
          items: [{ stain_id: 11, storage_location: "" }],
        }),
      ),
    );
  });
});

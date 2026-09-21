import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Form } from "antd";
import { ThemeProvider } from "../../../../contexts/ThemeContext";
import SpecimenIntegratedWorkblock from "./SpecimenIntegratedWorkblock";
import GrossImageService from "../../../../services/grossImageService";
import type { SurgicalCase, SurgicalSpecimen } from "../../../../types/surgical";
import type { GrossImage } from "../../../../types/image";

const { mockApiGet } = vi.hoisted(() => ({ mockApiGet: vi.fn() }));
vi.mock("../../../../services/httpClient", () => ({
  default: { get: mockApiGet, defaults: { baseURL: "" } },
  API_BASE_URL: "",
}));
vi.mock("../../../../services/grossImageService", () => ({
  default: { getImagesBySpecimenId: vi.fn(), updateImage: vi.fn() },
}));
vi.mock("../../../../services/surgicalSpecimenService", () => ({ default: {} }));
// Heavy siblings with their own data loading — irrelevant to the gross tab.
vi.mock("./SurgicalDiagnosisEditor", () => ({ default: () => null }));
vi.mock("./BlockGridView/BlockGridView", () => ({ default: () => null }));
vi.mock("../../../Gross/components/BlockTableForm", () => ({ default: () => null }));

const mockGetImages = GrossImageService.getImagesBySpecimenId as ReturnType<typeof vi.fn>;

const specimen = {
  id: 7,
  case_id: 1,
  specimen_label: "A",
  specimen_name: "Appendix",
} as SurgicalSpecimen;

const surgicalCase = { id: 1, accession_no: "S26-00001", specimens: [specimen] } as unknown as SurgicalCase;

const makeImage = (id: number): GrossImage => ({
  id,
  specimen_id: 7,
  image_url: `/storage/gross_images/7/${id}.jpg`,
  original_filename: `${id}.jpg`,
  order: id,
  uploaded_at: "2026-09-21T00:00:00Z",
  show_in_report: true,
});

const renderWorkblock = () =>
  render(
    <ThemeProvider>
      <Form>
        <SpecimenIntegratedWorkblock
          specimen={specimen}
          surgicalCase={surgicalCase}
          isLocked={false}
          hasOriginalSigned={false}
          pathologists={[]}
          microImages={[]}
          onOpenMicroCapture={vi.fn()}
          onEditMicroImage={vi.fn()}
          onRefreshMicroImages={vi.fn()}
        />
      </Form>
    </ThemeProvider>,
  );

const grossImagesTab = () => screen.getByText("GROSS IMAGES").closest(".ant-tabs-tab") as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  mockApiGet.mockResolvedValue({ data: new Blob(["img"], { type: "image/jpeg" }) });
  let n = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:fake-${++n}`);
});

describe("SpecimenIntegratedWorkblock — gross images tab", () => {
  it("shows the image count on the tab label before the tab is opened", async () => {
    mockGetImages.mockResolvedValue([makeImage(1), makeImage(2), makeImage(3)]);
    renderWorkblock();

    await waitFor(() =>
      expect(grossImagesTab().querySelector(".ant-badge")).toHaveTextContent("3"),
    );
    expect(mockGetImages).toHaveBeenCalledWith(7);
    // Still on the description tab — the count must not depend on mounting the pane.
    expect(screen.queryByAltText("1.jpg")).not.toBeInTheDocument();
  });

  it("shows no badge when the specimen has no gross images", async () => {
    mockGetImages.mockResolvedValue([]);
    renderWorkblock();

    await waitFor(() => expect(mockGetImages).toHaveBeenCalled());
    fireEvent.click(screen.getByText("GROSS IMAGES"));
    await screen.findByText("No gross images");
    expect(grossImagesTab().querySelector(".ant-badge-count")).toBeNull();
  });

  it("opens a full-size preview when a thumbnail is clicked", async () => {
    mockGetImages.mockResolvedValue([makeImage(1), makeImage(2)]);
    renderWorkblock();

    await waitFor(() =>
      expect(grossImagesTab().querySelector(".ant-badge")).toHaveTextContent("2"),
    );
    fireEvent.click(screen.getByText("GROSS IMAGES"));
    const thumb = await screen.findByAltText("1.jpg");

    fireEvent.click(thumb);

    await waitFor(() =>
      expect(document.querySelector(".ant-image-preview")).toBeInTheDocument(),
    );
    expect(document.querySelector(".ant-image-preview img")).toHaveAttribute("src", "blob:fake-1");
  });
});

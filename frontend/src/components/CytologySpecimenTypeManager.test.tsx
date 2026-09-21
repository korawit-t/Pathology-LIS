import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import CytologySpecimenTypeManager from "./CytologySpecimenTypeManager";
import SpecimenTemplateService, {
  SpecimenCategory,
  SpecimenTemplate,
} from "../services/specimenTemplateService";

vi.mock("../services/specimenTemplateService");

const makeType = (overrides: Partial<SpecimenTemplate> = {}): SpecimenTemplate => ({
  id: 1,
  name: "Fluid",
  category: "nongyne_cyto",
  default_slide_count: 1,
  requires_slide_count: false,
  requires_volume: false,
  slides_only: false,
  sort_order: 0,
  ...overrides,
});

const mockedGetTemplates = SpecimenTemplateService.getTemplates as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateTemplate = SpecimenTemplateService.updateTemplate as unknown as ReturnType<typeof vi.fn>;

const openNongyneTab = async () => {
  fireEvent.click(await screen.findByRole("tab", { name: "Non-Gyne Cytology" }));
};

describe("CytologySpecimenTypeManager — slides only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetTemplates.mockImplementation(async (category: SpecimenCategory) =>
      category === "nongyne_cyto"
        ? [
            makeType({ id: 1, name: "Fluid", requires_volume: true }),
            makeType({ id: 2, name: "FNA", requires_slide_count: true, slides_only: true }),
          ]
        : [],
    );
    mockedUpdateTemplate.mockResolvedValue(makeType());
  });

  it("marks only the slides-only type as not stored", async () => {
    render(<CytologySpecimenTypeManager />);
    await openNongyneTab();

    const fnaRow = (await screen.findByText("FNA")).closest("tr") as HTMLElement;
    const fluidRow = screen.getByText("Fluid").closest("tr") as HTMLElement;
    expect(within(fnaRow).getByText("Not stored")).toBeInTheDocument();
    expect(within(fluidRow).queryByText("Not stored")).not.toBeInTheDocument();
  });

  it("saves the slides-only checkbox when editing a type", async () => {
    render(<CytologySpecimenTypeManager />);
    await openNongyneTab();

    const fluidRow = (await screen.findByText("Fluid")).closest("tr") as HTMLElement;
    fireEvent.click(fluidRow.querySelector(".anticon-edit")?.closest("button") as HTMLButtonElement);

    const modal = await screen.findByRole("dialog");
    const checkbox = within(modal).getByRole("checkbox", { name: /slides only/i });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedUpdateTemplate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ slides_only: true, category: "nongyne_cyto" }),
      ),
    );
  });

  it("does not offer the checkbox for gyne types", async () => {
    mockedGetTemplates.mockResolvedValue([makeType({ category: "gyne_cyto", name: "Conventional" })]);
    render(<CytologySpecimenTypeManager />);

    const row = (await screen.findByText("Conventional")).closest("tr") as HTMLElement;
    fireEvent.click(row.querySelector(".anticon-edit")?.closest("button") as HTMLButtonElement);

    const modal = await screen.findByRole("dialog");
    expect(within(modal).queryByRole("checkbox", { name: /slides only/i })).not.toBeInTheDocument();
  });
});

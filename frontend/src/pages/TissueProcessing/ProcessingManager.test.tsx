/**
 * Surgical > Tissue Processing and Histology > Process Out used to open the
 * same page with nothing to tell them apart. Process Out now lists only the
 * runs still in the processor and leaves loading a new run to Surgical.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import ProcessingManager from "./index";
import TissueProcessingService from "../../services/tissueProcessingService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/tissueProcessingService", () => ({
  default: { getRuns: vi.fn(), getRunById: vi.fn() },
}));
vi.mock("./components/TissueProcessingOutModal/TissueProcessingOutModal", () => ({
  default: () => null,
}));
vi.mock("./components/ProcessingRunList/EditProcessingRunModal", () => ({
  default: () => null,
}));
vi.mock("./components/CreateProcessingRun/CreateProcessingRun", () => ({
  default: () => null,
}));

const getRuns = TissueProcessingService.getRuns as ReturnType<typeof vi.fn>;

const renderPage = (currentView?: string) =>
  render(
    <AntdApp>
      <ProcessingManager currentView={currentView} />
    </AntdApp>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getRuns.mockResolvedValue([]);
});

describe("ProcessingManager", () => {
  it("Tissue Processing lists every run and can create one", async () => {
    renderPage("sur:tissue-processing");

    await waitFor(() => expect(getRuns).toHaveBeenCalledWith(undefined));
    expect(screen.getByText("Tissue Processing History")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create New Run/ })).toBeInTheDocument();
  });

  it("Process Out lists only the runs still in the processor", async () => {
    renderPage("his:process-out");

    await waitFor(() => expect(getRuns).toHaveBeenCalledWith({ status: "processing" }));
    expect(screen.getByText("Process Out")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create New Run/ })).not.toBeInTheDocument();
    expect(await screen.findByText("No runs in the processor")).toBeInTheDocument();
  });
});

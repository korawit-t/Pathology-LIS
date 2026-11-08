import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { Form } from "antd";
import PatientSearchField from "./PatientSearchField";
import HisService from "../../services/hisService";
import type { HisInfo } from "../../services/hisService";
import { resetHisInfoCache } from "../../hooks/useHisInfo";

vi.mock("../../services/hisService", () => ({ default: { getInfo: vi.fn() } }));

const mockGetInfo = vi.mocked(HisService.getInfo);

const NO_FEATURES = { patient_search: false, appointments: false, visits_today: false, admission: false };

const hisInfo = (overrides: Partial<HisInfo> = {}): HisInfo => ({
  configured: true,
  his_type: "hosxp",
  display_name: "HOSxP",
  features: { patient_search: true, appointments: true, visits_today: true, admission: true },
  ...overrides,
});

const renderField = () =>
  render(
    <Form>
      <PatientSearchField
        patients={[]}
        titles={[]}
        hospitals={[]}
        isSearching={false}
        onSearch={() => {}}
        onNewPatient={() => {}}
        onHisSearch={() => {}}
        onSelectHN={() => {}}
      />
    </Form>,
  );

// The button's text is the HIS name, which varies by site, so find it by its
// icon rather than by a fixed label.
const hisButton = () => document.querySelector(".anticon-cloud-download")?.closest("button") ?? null;

beforeEach(() => {
  vi.clearAllMocks();
  resetHisInfoCache();
});

/**
 * This field is shared by all four case-type registration forms (surgical,
 * gyne, non-gyne, molecular), so what the button says and whether it shows
 * here is what every "Register New Specimen" form gets.
 */
describe("PatientSearchField HIS button", () => {
  it("is labelled with the connected HIS", async () => {
    mockGetInfo.mockResolvedValue(hisInfo());
    renderField();

    await waitFor(() => expect(hisButton()).toHaveTextContent("HOSxP"));
  });

  it("uses the site's own HIS name on a non-HOSxP deployment", async () => {
    mockGetInfo.mockResolvedValue(
      hisInfo({ his_type: "custom", display_name: "SSB", features: { ...NO_FEATURES, patient_search: true } }),
    );
    renderField();

    await waitFor(() => expect(hisButton()).toHaveTextContent("SSB"));
    expect(hisButton()).not.toHaveTextContent("HOSxP");
  });

  it("is hidden when no HIS is configured", async () => {
    mockGetInfo.mockResolvedValue(hisInfo({ configured: false, features: NO_FEATURES }));
    const { container } = renderField();

    await waitFor(() => expect(hisButton()).not.toBeInTheDocument());
    // Only the HIS button goes — the neighbouring add-patient control (an
    // icon-only Button, hence the icon query rather than a role name) stays.
    expect(container.querySelector(".anticon-user-add")).toBeInTheDocument();
  });

  it("is hidden when the HIS is connected but can't search patients yet", async () => {
    // e.g. HIS_TYPE=custom before the hospital has written its SQL files.
    mockGetInfo.mockResolvedValue(hisInfo({ his_type: "custom", display_name: "HIS", features: NO_FEATURES }));
    renderField();

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalled());
    await waitFor(() => expect(hisButton()).not.toBeInTheDocument());
  });

  it("is shown with a generic label when the lookup fails, rather than hiding a working feature", async () => {
    mockGetInfo.mockRejectedValue(new Error("network"));
    renderField();

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalled());
    await waitFor(() => expect(hisButton()).toHaveTextContent("HIS"));
  });

  it("stays visible against an older backend that only reports `configured`", async () => {
    mockGetInfo.mockResolvedValue({ configured: true, his_type: "HOSxP" } as unknown as HisInfo);
    renderField();

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalled());
    await waitFor(() => expect(hisButton()).toBeInTheDocument());
  });

  it("asks the backend only once no matter how many fields mount", async () => {
    mockGetInfo.mockResolvedValue(hisInfo());
    renderField();
    renderField();
    renderField();

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalledTimes(1));
  });

  it("starts with the known name on later mounts instead of flashing the generic label", async () => {
    mockGetInfo.mockResolvedValue(hisInfo({ display_name: "SSB" }));
    const first = renderField();
    await waitFor(() => expect(hisButton()).toHaveTextContent("SSB"));
    first.unmount();

    renderField();
    // Synchronous: no waitFor — the first render must already say SSB.
    expect(hisButton()).toHaveTextContent("SSB");
  });
});

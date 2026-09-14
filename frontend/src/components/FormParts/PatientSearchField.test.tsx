import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { Form } from "antd";
import PatientSearchField from "./PatientSearchField";
import HisService from "../../services/hisService";
import { resetHisConfiguredCache } from "../../hooks/useHisConfigured";

vi.mock("../../services/hisService", () => ({ default: { getInfo: vi.fn() } }));

const mockGetInfo = vi.mocked(HisService.getInfo);

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

const hisButton = () => screen.queryByRole("button", { name: /HIS/i });

beforeEach(() => {
  vi.clearAllMocks();
  resetHisConfiguredCache();
});

/**
 * This field is shared by all four case-type registration forms (surgical,
 * gyne, non-gyne, molecular), so gating the button here is what makes the
 * "Pull from HIS" affordance disappear across the whole app on a site that
 * runs no HIS.
 */
describe("PatientSearchField HIS button", () => {
  it("is shown when a HIS is configured", async () => {
    mockGetInfo.mockResolvedValue({ configured: true, his_type: "HOSxP" });
    renderField();

    await waitFor(() => expect(hisButton()).toBeInTheDocument());
  });

  it("is hidden when no HIS is configured", async () => {
    mockGetInfo.mockResolvedValue({ configured: false, his_type: "Unknown" });
    const { container } = renderField();

    await waitFor(() => expect(hisButton()).not.toBeInTheDocument());
    // Only the HIS button goes — the neighbouring add-patient control (an
    // icon-only Button, hence the icon query rather than a role name) stays.
    expect(container.querySelector(".anticon-user-add")).toBeInTheDocument();
  });

  it("is shown when the lookup fails, rather than hiding a working feature", async () => {
    mockGetInfo.mockRejectedValue(new Error("network"));
    renderField();

    await waitFor(() => expect(hisButton()).toBeInTheDocument());
  });

  it("asks the backend only once no matter how many fields mount", async () => {
    mockGetInfo.mockResolvedValue({ configured: true, his_type: "HOSxP" });
    renderField();
    renderField();
    renderField();

    await waitFor(() => expect(mockGetInfo).toHaveBeenCalledTimes(1));
  });
});

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HisPatientSearchModal from "./HisPatientSearchModal";
import HisService from "../../../services/hisService";
import type { HisInfo } from "../../../services/hisService";
import { resetHisInfoCache } from "../../../hooks/useHisInfo";

vi.mock("../../../services/hisService", () => ({
  default: { getInfo: vi.fn(), searchPatients: vi.fn() },
}));

const mockGetInfo = vi.mocked(HisService.getInfo);

const ssb: HisInfo = {
  configured: true,
  his_type: "custom",
  display_name: "SSB",
  features: { patient_search: true, appointments: false, visits_today: false, admission: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetHisInfoCache();
});

describe("HisPatientSearchModal", () => {
  it("names the HIS it is searching in the title and empty state", async () => {
    mockGetInfo.mockResolvedValue(ssb);
    render(<HisPatientSearchModal open onCancel={() => {}} onSelect={() => {}} />);

    expect(await screen.findByText("ค้นหาข้อมูลผู้ป่วยจากระบบ SSB")).toBeInTheDocument();
    expect(screen.getByText("กรุณากดค้นหาเพื่อดึงข้อมูลจาก SSB")).toBeInTheDocument();
  });

  it("says which HIS had no results", async () => {
    mockGetInfo.mockResolvedValue(ssb);
    vi.mocked(HisService.searchPatients).mockResolvedValue([]);
    render(<HisPatientSearchModal open onCancel={() => {}} onSelect={() => {}} />);
    await screen.findByText("ค้นหาข้อมูลผู้ป่วยจากระบบ SSB");

    fireEvent.click(screen.getByText("ค้นหา").closest("button")!);

    await waitFor(() => expect(HisService.searchPatients).toHaveBeenCalled());
    expect((await screen.findAllByText("ไม่พบข้อมูลในระบบ SSB")).length).toBeGreaterThan(0);
  });
});

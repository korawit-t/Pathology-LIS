import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import HospitalResultPage from "./HospitalResultPage";
import SurgicalCaseService from "../../services/surgicalCaseService";

const mockUseAuth = vi.fn();
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));

vi.mock("../../services/surgicalCaseService", () => ({
  default: { listHospitalCases: vi.fn(), getHospitalUnreadCount: vi.fn() },
}));

// ตารางประวัติของแต่ละชนิดเคสมีเทสต์ของตัวเอง ที่นี่สนใจแค่ว่าถูกส่ง hospital_id อะไรไป
vi.mock("../Report/components/SurgicalReportHistory", () => ({
  default: ({ hospital_id }: { hospital_id?: number }) => (
    <span>surgical-history-{String(hospital_id)}</span>
  ),
}));
vi.mock("../Report/components/GyneReportHistory", () => ({
  default: () => <span>gyne-history</span>,
}));
vi.mock("../Report/components/NonGyneReportHistory", () => ({
  default: () => <span>nongyne-history</span>,
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const asUser = (over: Record<string, unknown> = {}) => ({
  user: { id: 5, username: "rp-a", roles: ["hospital"], hospital_ids: [1], hospital_names: ["รพ.ก"], ...over },
  logout: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue(asUser());
  mocked(SurgicalCaseService.listHospitalCases).mockResolvedValue({ total: 0, items: [] });
  mocked(SurgicalCaseService.getHospitalUnreadCount).mockResolvedValue(0);
});

const renderPage = () =>
  render(
    <AntdApp>
      <HospitalResultPage />
    </AntdApp>,
  );

describe("HospitalResultPage", () => {
  it("derives In Progress from the difference between all and published", async () => {
    mocked(SurgicalCaseService.listHospitalCases)
      .mockResolvedValueOnce({ total: 10, items: [] })
      .mockResolvedValueOnce({ total: 4, items: [] });
    mocked(SurgicalCaseService.getHospitalUnreadCount).mockResolvedValue(3);
    renderPage();

    const inProgress = await screen.findByText("In Progress");
    const card = inProgress.closest(".ant-card") as HTMLElement;
    expect(within(card).getByText("6")).toBeInTheDocument();
  });

  it("tells a hospital account with no linked hospital what is wrong", async () => {
    // 403 จาก backend แปลว่า user นี้ยังไม่ผูกกับ รพ. ไหนเลย ไม่ใช่ระบบล่ม
    mocked(SurgicalCaseService.listHospitalCases).mockRejectedValue({
      response: { status: 403 },
    });
    renderPage();

    expect(
      await screen.findByText(/not linked to any hospital/i),
    ).toBeInTheDocument();
  });

  it("does not blame the hospital link for an ordinary server error", async () => {
    mocked(SurgicalCaseService.listHospitalCases).mockRejectedValue({
      response: { status: 500 },
    });
    renderPage();

    await waitFor(() => expect(SurgicalCaseService.listHospitalCases).toHaveBeenCalled());
    expect(screen.queryByText(/not linked to any hospital/i)).toBeNull();
  });

  it("names the hospital and offers no picker when only one is linked", async () => {
    renderPage();
    expect(await screen.findByText("รพ.ก")).toBeInTheDocument();
    expect(screen.queryByText("All assigned hospitals")).toBeNull();
  });

  it("offers a picker when the account covers more than one hospital", async () => {
    mockUseAuth.mockReturnValue(
      asUser({ hospital_ids: [1, 2], hospital_names: ["รพ.ก", "รพ.ข"] }),
    );
    renderPage();

    expect(await screen.findByText("All assigned hospitals")).toBeInTheDocument();
    // ชื่อเดียวจะไม่ถูกโชว์เป็นหัวเรื่อง เพราะครอบมากกว่าหนึ่งแห่ง
    expect(screen.getByText("surgical-history-undefined")).toBeInTheDocument();
  });

  it("falls back to the hospital id when a name is missing", async () => {
    mockUseAuth.mockReturnValue(
      asUser({ hospital_ids: [1, 7], hospital_names: ["รพ.ก"] }),
    );
    renderPage();

    fireEvent.mouseDown(
      document.querySelector(".ant-select-content") as Element,
    );
    expect(await screen.findByTitle("Hospital #7")).toBeInTheDocument();
  });

  it("switches the history tab between case types", async () => {
    renderPage();
    await screen.findByText(/surgical-history-/);

    fireEvent.click(screen.getByText("Gyne Cytology"));
    expect(await screen.findByText("gyne-history")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Non-Gyne Cytology"));
    expect(await screen.findByText("nongyne-history")).toBeInTheDocument();
  });
});

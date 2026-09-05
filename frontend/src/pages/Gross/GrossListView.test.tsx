import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntdApp } from "antd";
import GrossListView from "./GrossListView";
import GrossExaminationService from "../../services/grossExaminationService";
import SurgicalSpecimenService from "../../services/surgicalSpecimenService";

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
vi.mock("../../services/grossExaminationService", () => ({
  default: { getCases: vi.fn() },
}));
vi.mock("../../services/surgicalSpecimenService", () => ({
  default: {
    getSpecimensNeedingAdditionalSections: vi.fn(),
    clearAdditionalSections: vi.fn(),
  },
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const kase = (over: Record<string, unknown> = {}) => ({
  id: 1,
  accession_no: "S26-00001",
  status: "registered",
  hn: "0012345",
  patient: { title: { title: "นาง" }, name: "สมศรี", ln: "ใจงาม" },
  specimens: [{ id: 11, specimen_label: "A", specimen_name: "Skin" }],
  registered_at: "2026-09-01T09:00:00",
  ...over,
});

/** getCases ถูกใช้ทั้งดึงรายการและนับ badge — ตอบตามสถานะที่ขอ */
const casesByStatus = (rows: Record<string, unknown[]>) =>
  vi.fn(async (_skip: number, _limit: number, _search: string, status?: string[]) => {
    const key = status?.[0] ?? "all";
    const items = rows[key] ?? rows.all ?? [];
    return { items, total: items.length };
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocked(GrossExaminationService.getCases).mockImplementation(
    casesByStatus({ registered: [kase()], "in progress": [], all: [kase()] }),
  );
  mocked(SurgicalSpecimenService.getSpecimensNeedingAdditionalSections).mockResolvedValue([]);
  mocked(SurgicalSpecimenService.clearAdditionalSections).mockResolvedValue({});
});

const renderList = (props = {}) => {
  const onEditClick = vi.fn();
  render(
    <AntdApp>
      <GrossListView
        hospitals={[{ id: 1, name: "รพ.ก" }]}
        onEditClick={onEditClick}
        refreshToken={0}
        {...props}
      />
    </AntdApp>,
  );
  return onEditClick;
};

describe("GrossListView worklist", () => {
  it("opens on the registered queue rather than every case", async () => {
    renderList();
    await screen.findByText("S26-00001");

    const statuses = mocked(GrossExaminationService.getCases).mock.calls.map(
      ([, , , st]) => st,
    );
    expect(statuses).toContainEqual(["registered"]);
  });

  it("badges the segments with their own counts", async () => {
    mocked(GrossExaminationService.getCases).mockImplementation(
      casesByStatus({
        registered: [kase(), kase({ id: 2, accession_no: "S26-00002" })],
        "in progress": [kase({ id: 3, accession_no: "S26-00003" })],
      }),
    );
    renderList();

    const seg = await waitFor(() => {
      const el = document.querySelector(".ant-segmented");
      if (!el || !(el.textContent || "").match(/Registered\s*2/)) {
        throw new Error("counts not in yet: " + el?.textContent);
      }
      return el as HTMLElement;
    });
    expect(seg.textContent).toMatch(/In Progress\s*1/);
  });

  it("switches the queue to in-progress work", async () => {
    renderList();
    await screen.findByText("S26-00001");

    fireEvent.click(screen.getByText("In Progress"));

    await waitFor(() => {
      const last = mocked(GrossExaminationService.getCases).mock.calls.at(-1);
      expect(last?.[3]).toEqual(["in progress"]);
    });
  });

  it("drops the status filter entirely on the All segment", async () => {
    // "All" ต้องไม่ส่ง status ไปเลย ไม่ใช่ส่งลิสต์ว่างซึ่ง backend อาจแปลว่าไม่มีเคส
    renderList();
    await screen.findByText("S26-00001");

    fireEvent.click(screen.getByText("All"));

    await waitFor(() => {
      const last = mocked(GrossExaminationService.getCases).mock.calls.at(-1);
      expect(last?.[3]).toBeUndefined();
    });
  });

  it("reports a failed load rather than an empty worklist", async () => {
    mocked(GrossExaminationService.getCases).mockRejectedValue(new Error("boom"));
    renderList();
    expect(await screen.findByText("โหลดข้อมูลไม่สำเร็จ")).toBeInTheDocument();
  });

  it("still lists cases when the badge counts cannot be fetched", async () => {
    // นับ badge ล้มไม่ควรทำให้คิวทั้งหน้าใช้ไม่ได้
    let call = 0;
    mocked(GrossExaminationService.getCases).mockImplementation(async () => {
      call += 1;
      if (call <= 2) throw new Error("count failed");
      return { items: [kase()], total: 1 };
    });
    renderList();
    expect(await screen.findByText("S26-00001")).toBeInTheDocument();
  });

  it("hands the case to the edit view", async () => {
    const onEditClick = renderList();
    await screen.findByText("S26-00001");

    // ตารางนี้เปิดเคสด้วยการคลิกทั้งแถว ไม่มีปุ่มแยกในคอลัมน์
    fireEvent.click(screen.getByText("S26-00001").closest("tr") as Element);
    expect(onEditClick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it("reloads when a case is saved from the edit view", async () => {
    const { rerender } = render(
      <AntdApp>
        <GrossListView hospitals={[]} onEditClick={vi.fn()} refreshToken={0} />
      </AntdApp>,
    );
    await screen.findByText("S26-00001");
    const before = mocked(GrossExaminationService.getCases).mock.calls.length;

    rerender(
      <AntdApp>
        <GrossListView hospitals={[]} onEditClick={vi.fn()} refreshToken={1} />
      </AntdApp>,
    );

    await waitFor(() =>
      expect(mocked(GrossExaminationService.getCases).mock.calls.length).toBeGreaterThan(before),
    );
  });
});

describe("GrossListView additional sections", () => {
  const specimen = {
    id: 21,
    specimen_label: "B",
    specimen_name: "Colon",
    case: { accession_no: "S26-00007" },
  };

  it("lists specimens the pathologist asked for more sections on", async () => {
    mocked(SurgicalSpecimenService.getSpecimensNeedingAdditionalSections).mockResolvedValue([
      specimen,
    ]);
    renderList();

    fireEvent.click(await screen.findByText(/Additional Sections/i));
    expect(await screen.findByText("S26-00007")).toBeInTheDocument();
  });

  it("clears the request and reloads once the sections are cut", async () => {
    mocked(SurgicalSpecimenService.getSpecimensNeedingAdditionalSections).mockResolvedValue([
      specimen,
    ]);
    renderList();
    fireEvent.click(await screen.findByText(/Additional Sections/i));
    await screen.findByText("S26-00007");

    fireEvent.click(screen.getByText("Mark Done").closest("button") as Element);
    // ปุ่มอยู่ใน Popconfirm — ต้องยืนยันอีกชั้นก่อนถึงจะยิงจริง
    fireEvent.click(await screen.findByText("Done"));

    await waitFor(() =>
      expect(SurgicalSpecimenService.clearAdditionalSections).toHaveBeenCalledWith(21),
    );
    expect(await screen.findByText("Marked done: B — Colon")).toBeInTheDocument();
  });

  it("says so when the request could not be cleared", async () => {
    mocked(SurgicalSpecimenService.getSpecimensNeedingAdditionalSections).mockResolvedValue([
      specimen,
    ]);
    mocked(SurgicalSpecimenService.clearAdditionalSections).mockRejectedValue(new Error("500"));
    renderList();
    fireEvent.click(await screen.findByText(/Additional Sections/i));
    await screen.findByText("S26-00007");

    fireEvent.click(screen.getByText("Mark Done").closest("button") as Element);
    // ปุ่มอยู่ใน Popconfirm — ต้องยืนยันอีกชั้นก่อนถึงจะยิงจริง
    fireEvent.click(await screen.findByText("Done"));

    expect(await screen.findByText("Failed to mark done")).toBeInTheDocument();
  });
});

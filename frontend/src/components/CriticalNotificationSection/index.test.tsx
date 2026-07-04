import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CriticalNotificationSection from "./index";
import CriticalNotificationService, {
  CriticalNotificationRecord,
} from "../../services/criticalNotificationService";
import NotificationChannelService, {
  NotificationChannel,
} from "../../services/notificationChannelService";

vi.mock("../../services/criticalNotificationService", () => ({
  default: {
    getByCaseId: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("../../services/notificationChannelService", () => ({
  default: {
    getChannels: vi.fn(),
  },
}));

const mockGetByCaseId = CriticalNotificationService.getByCaseId as ReturnType<typeof vi.fn>;
const mockCreate = CriticalNotificationService.create as ReturnType<typeof vi.fn>;
const mockGetChannels = NotificationChannelService.getChannels as ReturnType<typeof vi.fn>;

const emptyList = { total: 0, items: [] };

const makeRecord = (overrides: Partial<CriticalNotificationRecord> = {}): CriticalNotificationRecord => ({
  id: 1,
  case_id: 10,
  case_type: "SURGICAL",
  notification_type: "malignancy",
  notified_at: "2026-01-01T10:00:00.000Z",
  recipient_name: "Dr. Smith",
  created_at: "2026-01-01T10:00:00.000Z",
  ...overrides,
});

const makeChannel = (overrides: Partial<NotificationChannel> = {}): NotificationChannel => ({
  id: 1,
  platform: "line",
  name: "LINE OA",
  credentials: {},
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("CriticalNotificationSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByCaseId.mockResolvedValue(emptyList);
    mockGetChannels.mockResolvedValue([]);
  });

  it("renders the section header", async () => {
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() => expect(mockGetByCaseId).toHaveBeenCalled());
    expect(screen.getByText("Critical & Malignancy Notifications")).toBeInTheDocument();
  });

  it("calls getByCaseId with correct caseId and caseType on mount", async () => {
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(mockGetByCaseId).toHaveBeenCalledWith(10, "SURGICAL"),
    );
  });

  it("does not call getByCaseId when caseId is 0", async () => {
    render(<CriticalNotificationSection caseId={0} caseType="SURGICAL" />);
    await waitFor(() => expect(mockGetChannels).toHaveBeenCalled());
    expect(mockGetByCaseId).not.toHaveBeenCalled();
  });

  it("shows เพิ่มบันทึกการแจ้ง button after loading", async () => {
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i })).toBeInTheDocument(),
    );
  });

  it("shows form when เพิ่มบันทึกการแจ้ง button is clicked", async () => {
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i }));
    expect(screen.getByText("ประเภท")).toBeInTheDocument();
    expect(screen.getByText("วัน/เวลาที่แจ้ง")).toBeInTheDocument();
  });

  it("hides form and resets when ยกเลิก is clicked", async () => {
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i }));
    fireEvent.click(screen.getByRole("button", { name: /ยกเลิก/i }));
    expect(screen.queryByText("ประเภท")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i })).toBeInTheDocument();
  });

  it("renders existing records in the table", async () => {
    mockGetByCaseId.mockResolvedValue({ total: 1, items: [makeRecord()] });
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() => expect(screen.getByText("Dr. Smith")).toBeInTheDocument());
    expect(screen.getByText("Malignancy")).toBeInTheDocument();
  });

  it("shows notified_by full_name in table", async () => {
    const record = makeRecord({
      notified_by: { id: 5, full_name: "Dr. Jones", username: "drjones" },
    });
    mockGetByCaseId.mockResolvedValue({ total: 1, items: [record] });
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() => expect(screen.getByText("Dr. Jones")).toBeInTheDocument());
  });

  it("falls back to username when full_name is missing", async () => {
    const record = makeRecord({
      notified_by: { id: 5, full_name: undefined, username: "drjones" },
    });
    mockGetByCaseId.mockResolvedValue({ total: 1, items: [record] });
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() => expect(screen.getByText("drjones")).toBeInTheDocument());
  });

  it("hides channel field when no active channels", async () => {
    mockGetChannels.mockResolvedValue([]);
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i }));
    expect(
      screen.queryByText("แจ้งผ่านช่องทาง (Notification Channels)"),
    ).not.toBeInTheDocument();
  });

  it("shows channel field when active channels exist", async () => {
    mockGetChannels.mockResolvedValue([makeChannel()]);
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i }));
    await waitFor(() =>
      expect(
        screen.getByText("แจ้งผ่านช่องทาง (Notification Channels)"),
      ).toBeInTheDocument(),
    );
  });

  it("handles getByCaseId error silently (no crash)", async () => {
    mockGetByCaseId.mockRejectedValue(new Error("Network error"));
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /เพิ่มบันทึกการแจ้ง/i })).toBeInTheDocument(),
    );
  });

  it("shows note column with em dash when note is empty", async () => {
    mockGetByCaseId.mockResolvedValue({ total: 1, items: [makeRecord({ note: undefined })] });
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() => expect(screen.getByText("Dr. Smith")).toBeInTheDocument());
    // Multiple "—" are expected (note column + notified_by column when user absent)
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("appends recipient_role in parentheses when present", async () => {
    const record = makeRecord({ recipient_name: "Dr. Smith", recipient_role: "แพทย์" });
    mockGetByCaseId.mockResolvedValue({ total: 1, items: [record] });
    render(<CriticalNotificationSection caseId={10} caseType="SURGICAL" />);
    await waitFor(() =>
      expect(screen.getByText("Dr. Smith (แพทย์)")).toBeInTheDocument(),
    );
  });
});

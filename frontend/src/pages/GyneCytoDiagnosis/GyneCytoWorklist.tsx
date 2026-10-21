import React, { useEffect, useState, useMemo } from "react";
import {
  Button,
  Table,
  Tag,
  Typography,
  message,
  Segmented,
  Input,
  Badge,
  Tooltip,
  Modal,
  Space,
  Progress,
} from "antd";
import {
  ReloadOutlined,
  ExclamationCircleFilled,
  CheckCircleFilled,
  ClockCircleOutlined,
  SyncOutlined,
  FileDoneOutlined,
  QuestionCircleOutlined,
  FormOutlined,
  ExperimentOutlined,
  AuditOutlined,
  SafetyCertificateOutlined,
  InboxOutlined,
  LinkOutlined,
  FireFilled,
  HistoryOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import PageContainer from "../../components/Layout/PageContainer";
import GyneCytologyCaseService from "../../services/gyneCytoCaseService";
import UserService from "../../services/userService";
import SystemSettingService from "../../services/systemSettingService";
import HolidayService from "../../services/holidayService";
import { GyneCytologyCase } from "../../types/gyne-cytology";
import type { SystemSetting } from "../../types/system";
import AccessionTag from "../../components/AccessionTag";
import logger from "../../utils/logger";
import { calculateTATProgress } from "../../utils/tatUtils";
import { renderConsultBadge } from "../../utils/consultBadge";

const { Text } = Typography;

interface GyneCytoWorklistProps {
  onSelectCase: (id: number) => void;
  standAlone?: boolean;
  refreshTrigger?: number;
}

const STATUS_CONFIG: Record<
  string,
  { color: string; label: string; icon?: React.ReactNode }
> = {
  registered: {
    color: "default",
    label: "Registered",
    icon: <ClockCircleOutlined />,
  },
  stained: { color: "cyan", label: "Stained", icon: <SyncOutlined /> },
  screened: {
    color: "geekblue",
    label: "Screened",
    icon: <SyncOutlined spin />,
  },
  pending_review: {
    color: "purple",
    label: "Pending Review",
    icon: <ExclamationCircleFilled />,
  },
  pending_approval: {
    color: "gold",
    label: "Pending Approval",
    icon: <ClockCircleOutlined />,
  },
  reported: { color: "green", label: "Reported", icon: <CheckCircleFilled /> },
  revised: {
    color: "volcano",
    label: "Revised",
    icon: <ExclamationCircleFilled />,
  },
  published: { color: "green", label: "Published", icon: <FileDoneOutlined /> },
  cancelled: { color: "red", label: "Cancelled" },
};

// The QC Review tab is two disjoint piles — cases where I'm the pathologist,
// and cases registered with no pathologist at all, which otherwise reach
// nobody's worklist. The tab's badge is their sum.
type QcReviewScope = "mine" | "unassigned";
const QC_REVIEW_SUB_TABS: Record<QcReviewScope, string> = {
  mine: "qc_review_mine",
  unassigned: "qc_review_unassigned",
};

const CYTO_TABS = [
  { label: "All", value: "all" },
  { label: "Pending Report", value: "stained" },
  { label: "Sign Required", value: "co_sign" },
  { label: "Awaiting Co-sign", value: "awaiting_cosign" },
  { label: "QC Slide Queue", value: "qc_slide_queue" },
  { label: "Express", value: "express" },
];

const PATHO_TABS = [
  { label: "All", value: "all" },
  { label: "Pending Report", value: "stained" },
  { label: "QC Review", value: "qc_review" },
  { label: "Sign Required", value: "co_sign" },
  { label: "Awaiting Co-sign", value: "awaiting_cosign" },
  { label: "Express", value: "express" },
];

const GyneCytoWorklist: React.FC<GyneCytoWorklistProps> = ({
  onSelectCase,
  standAlone = true,
  refreshTrigger,
}) => {
  const [cases, setCases] = useState<GyneCytologyCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [settings, setSettings] = useState<SystemSetting | null>(null);
  const [qcSlideCount, setQcSlideCount] = useState(0);
  const [qcReviewScope, setQcReviewScope] = useState<QcReviewScope>("mine");
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [holidays, setHolidays] = useState<string[]>([]);
  // Case ids that belong to the "Pending Report" bucket (stained + co_sign +
  // awaiting_cosign) — used to pin those cases to the top of the "All" tab.
  const [pendingReportIds, setPendingReportIds] = useState<Set<number>>(new Set());

  const isPathologist = useMemo(
    () =>
      currentUser?.roles?.some(
        (r: string) => r === "pathologist" || r === "senior_pathologist",
      ),
    [currentUser],
  );

  const qcEnabled = settings?.enable_gyne_qc_system ?? false;
  const nilmN = settings?.nilm_review_every_n ?? 10;

  const tabOptions = useMemo(
    () => (isPathologist ? PATHO_TABS : CYTO_TABS),
    [isPathologist],
  );

  const workflowSteps = useMemo(
    () => [
      {
        title: "Register Specimen",
        icon: <FormOutlined />,
        description:
          "Staff registers the specimen. The system auto-generates the Accession Number and assigns a cytotechnologist (CT) and pathologist — Status: Registered",
      },
      {
        title: "Staining and Slide Preparation",
        icon: <ExperimentOutlined />,
        description:
          "Cytotechnologist (CT) stains the batch of slides on the list — status changes to: Stained",
      },
      {
        title: "Read Slides and Record Results (Screening)",
        icon: <AuditOutlined />,
        description: (
          <div>
            <div>
              CT opens the case in <b>My Queue</b> → reads the slide →
              records the diagnosis and submits the result
            </div>
            <div
              style={{
                marginTop: 6,
                paddingLeft: 12,
                borderLeft: "3px solid #d9d9d9",
              }}
            >
              <div>
                <Tag color="blue">Normal (NILM)</Tag>
                <div style={{ marginLeft: 8, marginTop: 2 }}>
                  {qcEnabled ? (
                    <>
                      — the system counts cases; every <b>{nilmN}</b> cases is randomly selected for QC →{" "}
                      <Tag color="purple">Pending Review</Tag>
                      <br />— other cases →{" "}
                      <Tag color="green">Published</Tag> immediately
                    </>
                  ) : (
                    <>
                      — <Tag color="green">Published</Tag> immediately (QC system is off)
                    </>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <Tag color="orange">Abnormal</Tag>{" "}
                every case must always be reviewed by a pathologist →{" "}
                <Tag color="purple">Pending Review</Tag>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "QC Review by Pathologist",
        icon: <SafetyCertificateOutlined />,
        description: (
          <div>
            <div>
              Pathologist opens the case from the <b>QC Review</b> page → reviews the CT's result
            </div>
            <div
              style={{
                marginTop: 6,
                paddingLeft: 12,
                borderLeft: "3px solid #d9d9d9",
              }}
            >
              <div>
                <Tag color="success">Agree</Tag> agrees with the CT's result →{" "}
                <Tag color="green">Published</Tag> immediately
              </div>
              <div style={{ marginTop: 6 }}>
                <Tag color="error">Disagree</Tag> disagrees →
                records the discrepancy → CT revises and resubmits the result
              </div>
            </div>
          </div>
        ),
      },
    ],
    [qcEnabled, nilmN],
  );

  // Set default tab once user role is known
  useEffect(() => {
    if (!currentUser || activeTab !== null) return;
    setActiveTab("all");
  }, [currentUser, activeTab]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await UserService.getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        logger.error("Failed to load user", error);
      }
    };
    const fetchSettings = async () => {
      try {
        const s = await SystemSettingService.getSettings();
        setSettings(s);
      } catch {
        // use default (approval enabled)
      }
    };
    fetchUser();
    fetchSettings();
    HolidayService.getHolidayDateList().then(setHolidays).catch(() => {});
  }, []);

  const buildTabParams = (
    tab: string,
    userId: number,
  ): Record<string, unknown> => {
    if (tab === "stained") {
      return {
        status: "stained",
        assigned_user_id: userId,
        exclude_signed_by: userId,
      };
    }
    if (tab === "awaiting_cosign") {
      return {
        signed_by: userId,
        assigned_user_id: userId,
        exclude_status: "published",
      };
    }
    if (tab === "submitted") {
      return { status: "screened", assigned_user_id: userId };
    }
    if (tab === "qc_slide_queue") {
      return { status: "pending_review", assigned_user_id: userId };
    }
    if (tab === QC_REVIEW_SUB_TABS.mine) {
      return { status: "pending_review", pathologist_id: userId };
    }
    if (tab === QC_REVIEW_SUB_TABS.unassigned) {
      return { status: "pending_review", pathologist_unassigned: true };
    }
    if (tab === "co_sign") {
      return { signer_id: userId, exclude_status: "published" };
    }
    if (tab === "express") {
      return { assigned_user_id: userId, is_express: true };
    }
    // "all" → cases assigned to current user only, including published
    return { assigned_user_id: userId };
  };

  const loadQcSlideCount = async (userId: number) => {
    try {
      const data = await GyneCytologyCaseService.getAll({
        status: "pending_review",
        assigned_user_id: userId,
        limit: 1,
      });
      setQcSlideCount(data.total);
    } catch {
      // non-critical
    }
  };

  // "stained" (Pending Report) is a merged view of stained + co_sign + awaiting_cosign
  const PENDING_REPORT_SUB_TABS = ["stained", "co_sign", "awaiting_cosign"];

  const loadAllTabCounts = async (userId: number, tabs: typeof tabOptions) => {
    try {
      const entries = await Promise.all(
        tabs.map(async (t): Promise<[string, number][]> => {
          if (t.value === "qc_review") {
            // The two piles never overlap (pathologist_id is either me or
            // NULL), so their sum is exact. Each pile's own count is kept
            // too, for the sub-filter inside the tab.
            const [mine, unassigned] = await Promise.all(
              [QC_REVIEW_SUB_TABS.mine, QC_REVIEW_SUB_TABS.unassigned].map(
                (sub) =>
                  GyneCytologyCaseService.getAll({
                    ...buildTabParams(sub, userId),
                    limit: 1,
                  }),
              ),
            );
            return [
              [t.value, mine.total + unassigned.total],
              [QC_REVIEW_SUB_TABS.mine, mine.total],
              [QC_REVIEW_SUB_TABS.unassigned, unassigned.total],
            ];
          }
          if (t.value === "stained") {
            const subTotals = await Promise.all(
              PENDING_REPORT_SUB_TABS.map((sub) =>
                GyneCytologyCaseService.getAll({
                  ...buildTabParams(sub, userId),
                  limit: 1,
                }),
              ),
            );
            return [[t.value, subTotals.reduce((sum, d) => sum + d.total, 0)]];
          }
          const data = await GyneCytologyCaseService.getAll({
            ...buildTabParams(t.value, userId),
            limit: 1,
          });
          return [[t.value, data.total]];
        }),
      );
      setTabCounts(Object.fromEntries(entries.flat()));
    } catch {
      // non-critical
    }
  };

  // Fetch the full id set behind "Pending Report" (not just its count) so the
  // "All" tab can pin those cases to the top regardless of accession number.
  const loadPendingReportIds = async (userId: number) => {
    try {
      const results = await Promise.all(
        PENDING_REPORT_SUB_TABS.map((sub) =>
          GyneCytologyCaseService.getAll({
            ...buildTabParams(sub, userId),
            limit: 500,
          }),
        ),
      );
      const ids = new Set<number>();
      results.forEach((r) => r.items.forEach((c: GyneCytologyCase) => ids.add(c.id)));
      setPendingReportIds(ids);
    } catch {
      // non-critical
    }
  };

  // Load counts for every tab as soon as the worklist opens, not only the active one
  useEffect(() => {
    if (currentUser) {
      loadAllTabCounts(currentUser.id, tabOptions);
      loadPendingReportIds(currentUser.id);
      if (!isPathologist) loadQcSlideCount(currentUser.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, isPathologist]);

  useEffect(() => {
    if (currentUser && activeTab !== null) {
      loadCases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, activeTab, searchText, qcReviewScope]);

  useEffect(() => {
    if (refreshTrigger && currentUser && activeTab !== null) {
      loadCases();
      loadAllTabCounts(currentUser.id, tabOptions);
      loadPendingReportIds(currentUser.id);
      if (!isPathologist) loadQcSlideCount(currentUser.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Keep the active tab's badge in sync with the exact total once loaded
  useEffect(() => {
    if (activeTab === "qc_review") {
      // The table only holds one pile, so update that pile and re-sum
      setTabCounts((prev) => {
        const next = { ...prev, [QC_REVIEW_SUB_TABS[qcReviewScope]]: total };
        next.qc_review =
          (next[QC_REVIEW_SUB_TABS.mine] ?? 0) +
          (next[QC_REVIEW_SUB_TABS.unassigned] ?? 0);
        return next;
      });
    } else if (activeTab) {
      setTabCounts((prev) => ({ ...prev, [activeTab]: total }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, total]);

  const loadCases = async () => {
    if (!currentUser || activeTab === null) return;
    try {
      setLoading(true);
      const searchParam = searchText.trim() ? { search: searchText.trim() } : {};

      if (activeTab === "stained") {
        // Pending Report = union of stained + co_sign + awaiting_cosign
        const results = await Promise.all(
          PENDING_REPORT_SUB_TABS.map((sub) =>
            GyneCytologyCaseService.getAll({
              limit: 50,
              ...buildTabParams(sub, currentUser.id),
              ...searchParam,
            }),
          ),
        );
        const merged = new Map<number, GyneCytologyCase>();
        results.forEach((r) =>
          r.items.forEach((c: GyneCytologyCase) => merged.set(c.id, c)),
        );
        const mergedItems = Array.from(merged.values());
        setCases(mergedItems);
        setTotal(mergedItems.length);
        return;
      }

      const tabKey =
        activeTab === "qc_review" ? QC_REVIEW_SUB_TABS[qcReviewScope] : activeTab;
      const params: Record<string, unknown> = {
        limit: 50,
        ...buildTabParams(tabKey, currentUser.id),
        ...searchParam,
      };

      const data = await GyneCytologyCaseService.getAll(params);
      setCases(data.items);
      setTotal(data.total);
    } catch {
      message.error("Failed to load case data");
    } finally {
      setLoading(false);
    }
  };

  const commonColumns = [
    {
      title: "Accession No.",
      dataIndex: "accession_no",
      key: "accession_no",
      width: 160,
      sorter: (a: GyneCytologyCase, b: GyneCytologyCase) => {
        // Pin "Pending Report" cases to the top of the "All" tab. The Table
        // applies this comparator client-side to the whole page (that's how
        // defaultSortOrder + a function sorter behave), so the priority has
        // to live in the comparator itself, not just in fetch order.
        const aPriority = pendingReportIds.has(a.id) ? 0 : 1;
        const bPriority = pendingReportIds.has(b.id) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.accession_no || "").localeCompare(b.accession_no || "");
      },
      defaultSortOrder: "ascend" as const,
      render: (text: string, record: GyneCytologyCase) => (
        <Space size={4}>
          <AccessionTag value={text} />
          {record.is_express && (
            <Tooltip title="Express / Urgent">
              <FireFilled style={{ color: "#ff4d4f", fontSize: 12 }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Registered At",
      dataIndex: "registered_at",
      key: "registered_at_col",
      width: 150,
      render: (value: string) =>
        value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Patient",
      key: "patient",
      render: (_: unknown, record: GyneCytologyCase) => (
        <div>
          <div style={{ fontWeight: 500, lineHeight: "20px" }}>
            {[
              record.patient?.title?.title,
              record.patient?.name,
              record.patient?.ln,
            ]
              .filter(Boolean)
              .join(" ")}
          </div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            {record.hospital?.name || "—"}
          </div>
          <div style={{ fontSize: 11, color: "#bfbfbf" }}>HN: {record.hn}</div>
        </div>
      ),
    },
    {
      title: "Specimen",
      dataIndex: "specimen_type",
      key: "specimen_type",
      width: 120,
      render: (type: string) =>
        type ? (
          <Tag color="blue" style={{ borderRadius: 4 }}>
            {type}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  const ctColumn = {
    title: "Pathologist",
    key: "pathologist",
    width: 170,
    render: (_: unknown, record: GyneCytologyCase) =>
      record.pathologist?.full_name ? (
        <Text style={{ fontSize: 13 }}>{record.pathologist.full_name}</Text>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Unassigned
        </Text>
      ),
  };

  const pathoColumn = {
    title: "Cytotechnologist",
    key: "cytotechnologist",
    width: 170,
    render: (_: unknown, record: GyneCytologyCase) =>
      record.cytotechnologist?.full_name ? (
        <Text style={{ fontSize: 13 }}>
          {record.cytotechnologist.full_name}
        </Text>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>
          —
        </Text>
      ),
  };

  const dateColumn = {
    title: (
      <Space size={4}>
        TAT / PROGRESS
        <Tooltip title={`SLA: Gyne ${settings?.gyne_tat_days ?? "—"} days`}>
          <HistoryOutlined style={{ color: "#8c8c8c", cursor: "help" }} />
        </Tooltip>
      </Space>
    ),
    dataIndex: "registered_at",
    key: "registered_at",
    width: 200,
    render: (value: string, record: GyneCytologyCase) => {
      const s = record.status?.toLowerCase();
      // Out-lab cases never go through the normal reported/published flow —
      // the case is done once the out-lab result PDF is uploaded instead.
      const isOutlabDone = record.is_out_lab && !!record.out_lab_result_pdf_path;
      const isTerminal = isOutlabDone || s === "reported" || s === "published" || s === "cancelled";
      if (isTerminal) {
        return <CheckCircleFilled style={{ color: "#52c41a", fontSize: 20 }} />;
      }

      const tat = calculateTATProgress(
        value,
        "gyne",
        settings,
        record.is_express,
        holidays,
      );
      if (!tat) {
        return (
          <Tooltip title={value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-"}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {value ? dayjs(value).format("DD/MM/YY") : "-"}
            </Text>
          </Tooltip>
        );
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 160 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: 500, color: tat.isOverdue ? "#f5222d" : "inherit" }}>
              {tat.displayTime}
            </Text>
            <Text type="secondary" style={{ fontSize: 10 }}>{tat.percent}%</Text>
          </div>
          <Progress
            percent={tat.percent}
            showInfo={false}
            strokeColor={tat.statusColor}
            size={[160, 6]}

            status={tat.isOverdue ? "exception" : "active"}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Due:{" "}
              <Text strong={tat.isOverdue} style={{ fontSize: 11, color: tat.isOverdue ? "#f5222d" : "#595959" }}>
                {tat.dueDate ? dayjs(tat.dueDate).format("DD/MM/YYYY") : "-"}
              </Text>
            </Text>
            {tat.isOverdue && (
              <Text style={{ fontSize: 10, color: "#f5222d", fontWeight: "bold" }}>OVERDUE</Text>
            )}
          </div>
        </div>
      );
    },
  };

  const statusColumn = {
    title: "Status",
    dataIndex: "status",
    key: "status",
    width: 160,
    render: (status: string, record: GyneCytologyCase) => {
      const isOutlabDone = record.is_out_lab && !!record.out_lab_result_pdf_path;
      const cfg = isOutlabDone
        ? { color: "cyan", label: "Out-Lab Result" }
        : STATUS_CONFIG[status] ?? {
            color: "default",
            label: status?.toUpperCase() ?? "—",
          };
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tag
            color={cfg.color}
            icon={"icon" in cfg ? cfg.icon : undefined}
            style={{ borderRadius: 20, padding: "2px 10px", margin: 0 }}
          >
            {cfg.label}
          </Tag>
          {record.needs_review && (
            <Tooltip title={`QC Review: ${record.review_reason ?? ""}`}>
              <ExclamationCircleFilled
                style={{ color: "#722ed1", fontSize: 14 }}
              />
            </Tooltip>
          )}
          {record.has_correlation && (
            <Tag
              color="blue"
              icon={<LinkOutlined />}
              style={{ fontSize: 11, marginTop: 2 }}
            >
              Correlated
            </Tag>
          )}
          {renderConsultBadge(record)}
        </div>
      );
    },
  };

  const qcSlideQueueColumns = [
    ...commonColumns,
    dateColumn,
    {
      title: "Review Reason",
      key: "review_reason",
      width: 150,
      render: (_: unknown, record: GyneCytologyCase) => {
        const reasonLabel: Record<string, string> = {
          random_10pct: "Random 10%",
          abnormal: "Abnormal",
          manual: "Manual",
        };
        return record.review_reason ? (
          <Tag
            color="purple"
            icon={<ExclamationCircleFilled />}
            style={{ borderRadius: 20 }}
          >
            {reasonLabel[record.review_reason] ?? record.review_reason}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: "Action Required",
      key: "action_required",
      width: 200,
      render: () => (
        <Tag
          color="volcano"
          icon={<InboxOutlined />}
          style={{ borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}
        >
          Collect Slide for Pathologist
        </Tag>
      ),
    },
  ];

  const QC_REASON_TAG: Record<string, { color: string; label: string }> = {
    abnormal: { color: "red", label: "Abnormal" },
    random_10pct: { color: "blue", label: `Random NILM ${nilmN}%` },
    manual: { color: "purple", label: "Manual" },
  };

  const qcReviewColumns = [
    // The accession column's own sorter pins Pending Report cases for the
    // "All" tab; here the queue order comes from the Sent for Review column.
    { ...commonColumns[0], sorter: undefined, defaultSortOrder: undefined },
    ...commonColumns.slice(1),
    pathoColumn,
    {
      title: "Review Reason",
      key: "review_reason",
      width: 160,
      render: (_: unknown, record: GyneCytologyCase) => {
        const cfg = record.review_reason
          ? QC_REASON_TAG[record.review_reason] ?? {
              color: "default",
              label: record.review_reason,
            }
          : null;
        return cfg ? (
          <Tag color={cfg.color} style={{ borderRadius: 20 }}>
            {cfg.label}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: "Sent for Review",
      dataIndex: "report_at",
      key: "report_at",
      width: 160,
      // Abnormal first (a missed HSIL matters more than a random NILM
      // re-read), then whoever has waited longest.
      sorter: (a: GyneCytologyCase, b: GyneCytologyCase) => {
        const aPriority = a.review_reason === "abnormal" ? 0 : 1;
        const bPriority = b.review_reason === "abnormal" ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.report_at || "").localeCompare(b.report_at || "");
      },
      defaultSortOrder: "ascend" as const,
      render: (value: string | null) => {
        if (!value) return <Text type="secondary">—</Text>;
        const days = dayjs().startOf("day").diff(dayjs(value).startOf("day"), "day");
        return (
          <div>
            <div style={{ fontSize: 13 }}>{dayjs(value).format("DD/MM/YYYY HH:mm")}</div>
            <Text type={days > 0 ? "warning" : "secondary"} style={{ fontSize: 11 }}>
              {days > 0 ? `Waiting ${days} day${days > 1 ? "s" : ""}` : "Today"}
            </Text>
          </div>
        );
      },
    },
    dateColumn,
  ];

  const qcReviewScopeOptions = (
    [
      { label: "Mine", value: "mine" },
      { label: "Unassigned", value: "unassigned" },
    ] as const
  ).map((o) => {
    const count = tabCounts[QC_REVIEW_SUB_TABS[o.value]] ?? 0;
    return {
      label: (
        <span>
          {o.label}
          {count > 0 && (
            <Badge
              count={count}
              size="small"
              color="#722ed1"
              style={{ marginLeft: 6 }}
            />
          )}
        </span>
      ),
      value: o.value,
    };
  });

  const columns =
    activeTab === "qc_slide_queue"
      ? qcSlideQueueColumns
      : activeTab === "qc_review"
        ? qcReviewColumns
        : [
          ...commonColumns,
          isPathologist ? pathoColumn : ctColumn,
          dateColumn,
          statusColumn,
        ];

  const segmentedOptions = tabOptions.map((t) => {
    // QC Slide Queue always shows its badge so CT notices it even when on another tab
    if (t.value === "qc_slide_queue" && qcSlideCount > 0) {
      return {
        label: (
          <span>
            <InboxOutlined style={{ marginRight: 4, color: "#722ed1" }} />
            {t.label}{" "}
            <Badge
              count={qcSlideCount}
              size="small"
              color="#722ed1"
              style={{ marginLeft: 4 }}
            />
          </span>
        ),
        value: t.value,
      };
    }
    const count = tabCounts[t.value] ?? 0;
    // QC Review stands out the same way QC Slide Queue does for the CT —
    // these cases are held back from the patient until a pathologist acts.
    if (t.value === "qc_review" && count > 0) {
      return {
        label: (
          <span>
            <AuditOutlined style={{ marginRight: 4, color: "#722ed1" }} />
            {t.label}{" "}
            <Badge
              count={count}
              size="small"
              color="#722ed1"
              style={{ marginLeft: 4 }}
            />
          </span>
        ),
        value: t.value,
      };
    }
    return {
      label:
        count > 0 ? (
          <span>
            {t.label}{" "}
            <Badge
              count={count}
              size="small"
              color="gold"
              style={{ marginLeft: 4 }}
            />
          </span>
        ) : (
          t.label
        ),
      value: t.value,
    };
  });

  const TAB_DESCRIPTIONS: Record<string, string> = {
    stained:
      "Combined cases requiring action: Stained not yet submitted + awaiting your Sign + awaiting Co-sign from someone else",
    co_sign: "Cases someone else has already signed, awaiting your signature to complete",
    awaiting_cosign: "Cases you have already signed, but awaiting another person's signature to complete",
    qc_slide_queue: "Slides randomly selected for QC or with abnormal results, awaiting collection for the Pathologist",
    qc_review:
      "Cases a cytotechnologist sent for QC (abnormal, or a random NILM) — not released until a pathologist agrees or disagrees. Unassigned = registered with no pathologist, shared by every pathologist",
    express: "Urgent (Express/Urgent) cases assigned to you",
    all: "All cases assigned to you",
  };

  const content = (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {activeTab !== null && (
          <Segmented
            options={segmentedOptions}
            value={activeTab}
            onChange={(value) => {
              setActiveTab(value as string);
              setSearchText("");
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <Input.Search
            key={activeTab}
            placeholder="Search Accession / Patient"
            style={{ width: 260 }}
            allowClear
            enterButton
            defaultValue={searchText}
            onSearch={(val) => setSearchText(val)}
          />
        </div>
      </div>

      {activeTab && TAB_DESCRIPTIONS[activeTab] && (
        <div style={{ marginBottom: 12, paddingLeft: 2 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {TAB_DESCRIPTIONS[activeTab]}
          </Text>
        </div>
      )}

      {activeTab === "qc_review" && (
        <div style={{ marginBottom: 12 }}>
          <Segmented
            options={qcReviewScopeOptions}
            value={qcReviewScope}
            onChange={(value) => setQcReviewScope(value as QcReviewScope)}
          />
        </div>
      )}

      <Table
        // antd keeps its sort state across column changes, so the accession
        // sort from the other tabs would override QC Review's
        // defaultSortOrder. Remounting starts that tab from its own sort.
        key={activeTab === "qc_review" ? "qc_review" : "worklist"}
        columns={columns}
        dataSource={cases}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => onSelectCase(record.id),
          style: { cursor: "pointer" },
        })}
        pagination={{
          total,
          pageSize: 50,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
        size="middle"
        bordered
        rowClassName={() => "gyne-worklist-row"}
      />
    </div>
  );

  const workflowGuideModal = (
    <Modal
      title={
        <span>
          <QuestionCircleOutlined
            style={{ marginRight: 8, color: "#1677ff" }}
          />
          Workflow — Gyne Cytology
        </span>
      }
      open={guideOpen}
      onCancel={() => setGuideOpen(false)}
      footer={null}
      width={640}
    >
      <div style={{ marginTop: 8 }}>
        {workflowSteps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "#e6f4ff",
                  border: "2px solid #1677ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#1677ff",
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                {s.icon}
              </div>
              {i < workflowSteps.length - 1 && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    background: "#d9d9d9",
                    marginTop: 4,
                  }}
                />
              )}
            </div>
            <div style={{ paddingTop: 6, paddingBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
              <div style={{ color: "#595959", fontSize: 13 }}>
                {s.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );

  if (!standAlone)
    return (
      <>
        {content}
        {workflowGuideModal}
      </>
    );

  return (
    <PageContainer
      title="Gyne Cytology Worklist"
      subTitle={`${total} case${total !== 1 ? "s" : ""}`}
      extra={
        <Space>
          <Button
            icon={<QuestionCircleOutlined />}
            onClick={() => setGuideOpen(true)}
          >
            Workflow Guide
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadCases}
            loading={loading}
          >
            Refresh
          </Button>
        </Space>
      }
      withCard
    >
      {content}
      {workflowGuideModal}
    </PageContainer>
  );
};

export default GyneCytoWorklist;

import React, { useState, useEffect, useCallback } from "react";
import { Input, Space, Button, Tag, Segmented, message } from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import MolecularCaseTable from "../../MolecularCase/MolecularCaseTable";
import {
  MolecularCaseService,
  MolecularCaseResponse,
  MolecularCaseCountParams,
} from "../../../services/molecularCaseService";
import logger from "../../../utils/logger";

type BucketKey = "pdf_received" | "in_house" | "external";

/** The not-yet-finalized Molecular cases, split the way a pathologist works
 *  them: PDF Received can be signed out now, In-house waits on our own result,
 *  and External Lab cannot be signed out until the PDF arrives. Disjoint —
 *  the backend's "pending" leaves out the pdf_received cases. */
const BUCKETS: { value: BucketKey; label: string; params: MolecularCaseCountParams }[] = [
  { value: "pdf_received", label: "PDF Received", params: { status: "pdf_received" } },
  { value: "in_house", label: "In-house", params: { status: "pending", is_outlab: false } },
  { value: "external", label: "Awaiting External Lab", params: { status: "pending", is_outlab: true } },
];

/** What the tab badge counts: the buckets this pathologist can act on now.
 *  External-lab cases are left out — they are waiting on somebody else. */
const BADGE_BUCKETS: BucketKey[] = ["pdf_received", "in_house"];

/** Whose cases the tab lists: this pathologist's, plus the ones nobody has
 *  been named on, so an unassigned case still lands on someone's worklist. */
export const buildMyMolecularParams = (pathologistId: number) => ({
  assist_pathologist_id: pathologistId,
  include_unassigned: true,
});

const countBucket = (pathologistId: number, key: BucketKey) =>
  MolecularCaseService.count({
    ...buildMyMolecularParams(pathologistId),
    ...BUCKETS.find((b) => b.value === key)!.params,
  });

/** The Molecular tab's badge, counted without mounting the panel — antd
 *  renders a tab pane lazily, so a badge fed only by `onCountChange` reads 0
 *  until the tab is opened. Built from the same params as the panel's own
 *  queries so the two cannot drift. */
export const countMyMolecularBadge = async (pathologistId: number): Promise<number> => {
  const counts = await Promise.all(BADGE_BUCKETS.map((key) => countBucket(pathologistId, key)));
  return counts.reduce((a, b) => a + b, 0);
};

interface Props {
  pathologistId?: number;
  onSelectCase?: (id: number) => void;
  onCountChange?: (count: number) => void;
  /** Bumped by the page's own Refresh button. */
  refreshTrigger?: number;
}

const MyMolecularCases: React.FC<Props> = ({ pathologistId, onSelectCase, onCountChange, refreshTrigger }) => {
  const [bucket, setBucket] = useState<BucketKey>("pdf_received");
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState<MolecularCaseResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<BucketKey, number>>({ pdf_received: 0, in_house: 0, external: 0 });

  const fetchCases = useCallback(async () => {
    if (!pathologistId) return;
    setLoading(true);
    try {
      setCases(
        await MolecularCaseService.getAll({
          ...buildMyMolecularParams(pathologistId),
          ...BUCKETS.find((b) => b.value === bucket)!.params,
          search: search || undefined,
          limit: 200,
        }),
      );
    } catch {
      message.error("Failed to load Molecular cases");
    } finally {
      setLoading(false);
    }
  }, [pathologistId, bucket, search]);

  // Counts ignore the search box on purpose: they label the sub-filters and
  // feed the tab badge, and neither should change while the user types.
  const fetchCounts = useCallback(async () => {
    if (!pathologistId) return;
    try {
      const values = await Promise.all(BUCKETS.map((b) => countBucket(pathologistId, b.value)));
      const next = Object.fromEntries(BUCKETS.map((b, i) => [b.value, values[i]])) as Record<BucketKey, number>;
      setCounts(next);
      onCountChange?.(BADGE_BUCKETS.reduce((sum, key) => sum + next[key], 0));
    } catch (err) {
      logger.error("Failed to count Molecular cases:", err);
    }
  }, [pathologistId, onCountChange]);

  // refreshTrigger is listed so the page's Refresh button re-runs both.
  useEffect(() => {
    fetchCases();
  }, [fetchCases, refreshTrigger]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts, refreshTrigger]);

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Segmented
            options={BUCKETS.map((b) => ({ value: b.value, label: `${b.label} (${counts[b.value]})` }))}
            value={bucket}
            onChange={(v) => setBucket(v as BucketKey)}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search accession, HN, patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchCases();
              fetchCounts();
            }}
            loading={loading}
          >
            Refresh
          </Button>
        </Space>
        <Tag color="orange" style={{ padding: "4px 10px" }}>
          {counts.pdf_received + counts.in_house} awaiting sign-out
        </Tag>
      </div>

      <MolecularCaseTable
        dataSource={cases}
        loading={loading}
        onSelectCase={(id) => onSelectCase?.(id)}
        showAssistPathologist
      />
    </>
  );
};

export default MyMolecularCases;

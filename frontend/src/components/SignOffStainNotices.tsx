import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, message } from "antd";
import { CheckSquareOutlined, ExperimentOutlined } from "@ant-design/icons";
import type { SignOffStain } from "../types/stains";

/**
 * The stain notices on a pathologist's sign-off page (surgical
 * FinalizeReportPage, NongyneSignOffPage).
 *
 * Sign-off is the "result is out" cut-off for IHC / special stains (backend
 * app/crud/stain_signoff.py), so the page has to say what signing will record:
 * - "awaiting review" — ready to read, not yet reported: a sign-off as
 *   complete records these as reported; a provisional one only records the
 *   ones marked reviewed.
 * - "not back yet" — no sign-off records these; the Addendum that carries
 *   them will. Information only — it doesn't block signing.
 *
 * The list comes from the case type's sign-off endpoint, which applies the
 * same filter the backend stamps with.
 */
interface SignOffStainNoticesProps {
  open: boolean;
  caseId?: number;
  /** "No, Pending" (provisional) is selected */
  isPending: boolean;
  fetchStains: (caseId: number) => Promise<SignOffStain[]>;
  markReviewed: (stainId: number) => Promise<unknown>;
  /** Surgical IHC can be at an outlab; non-gyne has no outlab step. */
  hasOutlab?: boolean;
}

const stainLabel = (s: SignOffStain) => [s.block_code, s.test_name].filter(Boolean).join(" — ");

const SignOffStainNotices: React.FC<SignOffStainNoticesProps> = ({
  open,
  caseId,
  isPending,
  fetchStains,
  markReviewed,
  hasOutlab = true,
}) => {
  const [stains, setStains] = useState<SignOffStain[]>([]);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!open || !caseId) { setStains([]); return; }
    fetchStains(caseId).then(setStains).catch(() => setStains([]));
    // Callers pass a service method (a stable reference), so this only runs
    // when the page opens or the case changes.
  }, [open, caseId, fetchStains]);

  const unreviewed = useMemo(() => stains.filter((s) => s.status === "stained" && !s.reported_at), [stains]);
  const notBack = useMemo(() => stains.filter((s) => s.status === "pending" || s.status === "sent"), [stains]);

  const notBackLabel = (s: SignOffStain): string => {
    if (s.status === "sent") return "at outlab";
    return hasOutlab && s.is_external ? "not sent yet" : "not stained yet";
  };

  const handleMarkAllReviewed = async () => {
    setMarking(true);
    try {
      const ids = new Set(unreviewed.map((s) => s.stain_id));
      await Promise.all([...ids].map((id) => markReviewed(id)));
      message.success(`${ids.size} stain(s) marked as reviewed`);
      setStains((prev) => prev.map((s) => (ids.has(s.stain_id) ? { ...s, status: "completed" } : s)));
    } catch {
      message.error("Failed to mark stains as reviewed");
    } finally {
      setMarking(false);
    }
  };

  return (
    <>
      {unreviewed.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ExperimentOutlined />}
          style={{ marginBottom: 16 }}
          message={`${unreviewed.length} stain${unreviewed.length > 1 ? "s" : ""} awaiting review`}
          description={
            <div>
              <div style={{ marginBottom: 8, fontSize: 12, color: "#595959" }}>
                {unreviewed.map((s) => (
                  <span key={s.stain_id} style={{ marginRight: 8 }}>
                    {stainLabel(s)}{hasOutlab && s.is_external ? " (Outlab)" : ""}
                  </span>
                ))}
              </div>
              <div style={{ marginBottom: 8, fontSize: 12, color: "#595959" }}>
                {isPending
                  ? "These stay open while the report is pending — use Mark All as Reviewed for any already in this report."
                  : "Signing off as complete records these as reported."}
              </div>
              <Button size="small" icon={<CheckSquareOutlined />} loading={marking} onClick={handleMarkAllReviewed} style={{ color: "#52c41a", borderColor: "#52c41a" }}>
                Mark All as Reviewed
              </Button>
            </div>
          }
        />
      )}

      {notBack.length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<ExperimentOutlined />}
          style={{ marginBottom: 16 }}
          message={`${notBack.length} stain${notBack.length > 1 ? "s" : ""} not back yet`}
          description={
            <div>
              <div style={{ marginBottom: 8, fontSize: 12, color: "#595959" }}>
                {notBack.map((s) => (
                  <span key={s.stain_id} style={{ marginRight: 8 }}>
                    {stainLabel(s)} ({notBackLabel(s)})
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#595959" }}>
                {isPending
                  ? "These stay open until a later sign-off carries them."
                  : 'These stay open until an Addendum carries them — toggle "No, Pending" if this report is waiting for them.'}
              </div>
            </div>
          }
        />
      )}
    </>
  );
};

export default SignOffStainNotices;

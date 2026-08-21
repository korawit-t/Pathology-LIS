import { useState, useEffect, useCallback, useMemo } from "react";
import { App } from "antd";
import type { FormInstance } from "antd";
import GyneCaseImageService, {
  GyneCaseImage,
} from "../../../services/gyneCaseImageService";
import GyneDiagnosisService from "../../../services/gyneDiagnosisService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import NotificationRuleService from "../../../services/notificationRuleService";
import UserService from "../../../services/userService";
import SystemSettingService from "../../../services/systemSettingService";
import type { User } from "../../../types/user";
import type { SystemSetting } from "../../../types/system";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";
import type {
  GyneDiagnosisResponse,
  GyneDiagnosisUpdate,
  GyneDiagnosisCategory,
  GyneSpecimenAdequacy,
} from "../../../types/gyne-diagnosis";
import logger from "../../../utils/logger";

type GyneSigner = {
  user_id: number;
  role: string;
  signed_at?: string | null;
};

export function useGyneDiagnosisData(
  caseId: string | number | undefined,
  form: FormInstance,
  // Which hat the current user is wearing on THIS page. An account can hold
  // both roles (a pathologist who also screens), and the roles array alone
  // can't say which workflow they're in right now — but the page can, because
  // the dashboard already routed them here by role. The backend reads this
  // signer role to decide whether the sign-out counts as the QC review, so a
  // wrong value here either exempts a screening or drags a pathologist's own
  // readouts into the QC pool. "auto" keeps the legacy roles-array guess.
  signerRole: "primary" | "cytotechnologist" | "auto" = "auto",
) {
  const { message, notification } = App.useApp();

  const [caseData, setCaseData] = useState<GyneCytologyCase | null>(null);
  const [diagnosis, setDiagnosis] = useState<GyneDiagnosisResponse | null>(null);
  const [images, setImages] = useState<GyneCaseImage[]>([]);
  const [descMap, setDescMap] = useState<Record<number, string>>({});
  const [categories, setCategories] = useState<GyneDiagnosisCategory[]>([]);
  const [adequacies, setAdequacies] = useState<GyneSpecimenAdequacy[]>([]);
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [completingReview, setCompletingReview] = useState(false);

  const fetchImages = useCallback(() => {
    if (!caseId) return;
    GyneCaseImageService.getImages(Number(caseId))
      .then((imgs) => {
        setImages(imgs);
        setDescMap(
          Object.fromEntries(imgs.map((i) => [i.id, i.description ?? ""])),
        );
      })
      .catch((e) => logger.error(e));
  }, [caseId]);

  const saveDesc = useCallback(
    async (imgId: number) => {
      await GyneCaseImageService.update(imgId, {
        description: descMap[imgId] ?? "",
      });
    },
    [descMap],
  );

  const fetchMasterData = useCallback(async () => {
    try {
      setLoadingMaster(true);
      const [cats, adeqs] = await Promise.all([
        GyneDiagnosisService.getDiagnosisCategories(),
        GyneDiagnosisService.getSpecimenAdequacies(),
      ]);
      setCategories(cats);
      setAdequacies(adeqs);
    } catch {
      message.error("Failed to load master data.");
    } finally {
      setLoadingMaster(false);
    }
  }, [message]);

  const fetchDiagnosis = useCallback(async () => {
    if (!caseId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await GyneDiagnosisService.getCurrentDiagnosis(
        Number(caseId),
      );
      setDiagnosis(data);
      form.setFieldsValue(data);
    } catch (err: any) {
      if (err.response?.status !== 404)
        message.error("Failed to load diagnosis data.");
      setDiagnosis(null);
    } finally {
      setLoading(false);
    }
  }, [caseId, form, message]);

  // Load pathologists & cytotechnologists
  useEffect(() => {
    const fetchPathologists = async () => {
      try {
        const [paths, cytos] = await Promise.all([
          UserService.getUsers({ role: "pathologist" }),
          UserService.getUsers({ role: "cytotechnologist" }),
        ]);
        const allUsers = [...paths, ...cytos];
        setPathologists(
          Array.from(new Map(allUsers.map((u) => [u.id, u])).values()),
        );
      } catch (err) {
        logger.error("Failed to load staff", err);
      }
    };
    fetchPathologists();
  }, []);

  const fetchCaseData = useCallback(async () => {
    if (!caseId) return;
    try {
      const data = await GyneCytologyCaseService.getById(Number(caseId));
      setCaseData(data);
    } catch (e) {
      logger.error(e);
    }
  }, [caseId]);

  // Load case data
  useEffect(() => {
    fetchCaseData();
  }, [fetchCaseData]);

  // Load active report ID
  useEffect(() => {
    if (!caseId) return;
    GyneDiagnosisService.getReportsByCase(Number(caseId))
      .then((reports: any[]) => {
        const active = reports.find((r) =>
          ["pending_approval", "published"].includes(r.status),
        );
        setActiveReportId(active?.id ?? null);
      })
      .catch((e) => logger.error(e));
  }, [caseId, caseData?.status]);

  // Load master data + diagnosis + images
  useEffect(() => {
    fetchMasterData();
    fetchDiagnosis();
    fetchImages();
  }, [fetchMasterData, fetchDiagnosis]);

  // Load system settings + current user
  useEffect(() => {
    const initData = async () => {
      try {
        const [settings, user] = await Promise.all([
          SystemSettingService.getSettings(),
          UserService.getCurrentUser(),
        ]);
        setSystemSettings(settings);
        setCurrentUser(user);
      } catch (err) {
        logger.error("Failed to load init data", err);
      }
    };
    initData();
  }, []);

  const mainCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  );
  const adequacyOptions = useMemo(
    () => adequacies.filter((a) => a.group_type === "ADEQUACY"),
    [adequacies],
  );
  const zoneOptions = useMemo(
    () => adequacies.filter((a) => a.group_type === "ZONE"),
    [adequacies],
  );
  const qualityOptions = useMemo(
    () => adequacies.filter((a) => a.group_type === "QUALITY"),
    [adequacies],
  );

  const defaultSigners = useMemo(() => {
    if (!currentUser) return [];

    const currentUserRole =
      signerRole !== "auto"
        ? signerRole
        : currentUser.roles?.some((r) => r === "cytotechnologist")
          ? "cytotechnologist"
          : "primary";

    const signers: { user_id: number; role: string; signed_at: null }[] = [
      { user_id: currentUser.id, role: currentUserRole, signed_at: null },
    ];

    const cytoId =
      caseData?.cytotechnologist?.id ?? caseData?.cytotechnologist_id;
    const pathoId = caseData?.pathologist?.id ?? caseData?.pathologist_id;

    if (pathoId && pathoId !== currentUser.id) {
      signers.push({ user_id: pathoId, role: "primary", signed_at: null });
    }
    if (cytoId && cytoId !== currentUser.id) {
      signers.push({
        user_id: cytoId,
        role: "cytotechnologist",
        signed_at: null,
      });
    }

    return signers;
  }, [caseData, currentUser, signerRole]);

  // Shared by saveDraft/persistDraftForPreview: normalizes each signer's
  // signed_at to null (rather than undefined) before it's sent to the API.
  const sanitizeSigners = useCallback((values: GyneDiagnosisUpdate) => {
    if (values.signers) {
      values.signers = values.signers.map((s) => ({
        ...s,
        signed_at: s.signed_at || null,
      }));
    }
    return values;
  }, []);

  // Draft save for the main form: dispatches to reviseReport / updateDiagnosis
  // / createInitial depending on whether a diagnosis exists and whether we're
  // in revision mode. No try/catch/message here — the caller keeps its own,
  // so each call site's existing success/error UX is unaffected.
  const saveDraft = useCallback(
    async (values: GyneDiagnosisUpdate, opts: { isRevision: boolean }) => {
      for (const key of Object.keys(values)) {
        if ((values as Record<string, unknown>)[key] === undefined)
          (values as Record<string, unknown>)[key] = null;
      }
      sanitizeSigners(values);

      if (diagnosis && opts.isRevision) {
        values.signers = (values.signers || []).map((s) => ({
          ...s,
          signed_at: null,
        }));
        await GyneDiagnosisService.reviseReport(diagnosis.id, values);
        return { mode: "revise" as const };
      } else if (diagnosis) {
        await GyneDiagnosisService.updateDiagnosis(diagnosis.id, values);
        return { mode: "update" as const };
      } else {
        await GyneDiagnosisService.createInitial({
          ...values,
          case_id: Number(caseId),
        });
        return { mode: "create" as const };
      }
    },
    [caseId, diagnosis, sanitizeSigners],
  );

  // Narrower persistence used only by the Preview PDF action: unlike
  // saveDraft, it deliberately does nothing while in revision mode (the
  // preview reflects the last-saved server state, not the in-progress
  // revision draft) — preserved as-is, not unified with saveDraft.
  const persistDraftForPreview = useCallback(
    async (values: GyneDiagnosisUpdate, isRevision: boolean) => {
      if (diagnosis && !isRevision) {
        sanitizeSigners(values);
        await GyneDiagnosisService.updateDiagnosis(diagnosis.id, values);
      }
    },
    [diagnosis, sanitizeSigners],
  );

  // Sign-off / finalize: builds the updated signers array (require-all-sign,
  // pathologist-review-routing, or normal branch), persists slide/stain
  // quality + diagnosis signers, and conditionally publishes the report.
  const finalize = useCallback(
    async (
      sq: string | null = null,
      stq: string | null = null,
      comment: string | null = null,
      outLab: { reason: string } | undefined,
      opts: {
        forceEdit: boolean;
        requiresPathologistReview: boolean;
        // Which signer-stamping branch to take — separate from
        // requiresPathologistReview (which still always reaches
        // publishReport unchanged). True only for the cytotech
        // "send to pathologist" flow, where only the submitter's own
        // signature should be stamped; a pathologist finalizing their own
        // abnormal-category case must still stamp every signer.
        signOnlyCurrentUser: boolean;
      },
    ) => {
      if (!caseId || !currentUser) return;
      try {
        setFinalizing(true);
        const signers: GyneSigner[] = form.getFieldValue("signers") || [];
        const isRequireAllSign = systemSettings?.require_all_gyne_sign ?? false;
        const now = new Date().toISOString();
        let updatedSigners: GyneSigner[] = [...signers];
        let allSigned = true;

        if (isRequireAllSign) {
          let userFound = false;
          updatedSigners = updatedSigners.map((s) => {
            if (Number(s.user_id) === Number(currentUser?.id)) {
              userFound = true;
              if (!s.signed_at) return { ...s, signed_at: now };
            } else if (opts.forceEdit) {
              return { ...s, signed_at: null };
            }
            return s;
          });
          if (!userFound) {
            message.warning(
              "You are not in the signers list. Please add yourself before finalizing.",
            );
            setFinalizing(false);
            return;
          }
          allSigned = updatedSigners.every((s) => !!s.signed_at);
        } else if (opts.signOnlyCurrentUser) {
          updatedSigners = updatedSigners.map((s) =>
            Number(s.user_id) === Number(currentUser?.id)
              ? { ...s, signed_at: s.signed_at || now }
              : s,
          );
          allSigned = true;
        } else {
          updatedSigners = updatedSigners.map((s) => ({
            ...s,
            signed_at: s.signed_at || now,
          }));
          allSigned = true;
        }

        form.setFieldValue("signers", updatedSigners);
        await GyneCytologyCaseService.update(Number(caseId), {
          slide_quality: sq ?? undefined,
          stain_quality: stq ?? undefined,
          quality_comment: comment?.trim() || undefined,
        });
        if (diagnosis) {
          await GyneDiagnosisService.updateDiagnosis(diagnosis.id, {
            signers: updatedSigners,
          });
          setDiagnosis({ ...diagnosis, signers: updatedSigners });
        }

        if (allSigned) {
          const result = await GyneDiagnosisService.publishReport(
            Number(caseId),
            updatedSigners,
            opts.requiresPathologistReview,
            outLab ? true : undefined,
            outLab?.reason,
          );
          if (outLab) {
            message.success("Report signed off — flagged for Out-Lab Consult");
          } else if (result.status === "published") {
            notification.success({
              title: "NILM — Report Published",
              description:
                "Report has been published directly. No pathologist review required.",
              placement: "topRight",
            });
          } else {
            notification.warning({
              title: "Awaiting Pathologist Review",
              description:
                "This case has been randomly selected for QC — please collect the slide and send for review before publishing.",
              placement: "topRight",
              duration: 0,
            });
          }
        } else {
          message.success("Signed. Waiting for other co-signers.");
        }

        fetchDiagnosis();
      } catch (err) {
        logger.error(err);
        message.error("Failed to finalize report.");
      } finally {
        setFinalizing(false);
      }
    },
    [caseId, currentUser, systemSettings, form, diagnosis, fetchDiagnosis, message, notification],
  );

  // QC agree/disagree, surfaced via GyneQCReviewSection on the pathologist's
  // page (this hook's caller renders it read-only).
  const completeReview = useCallback(
    async (
      result: "agree" | "disagree",
      note?: string,
      level?: "minor" | "major" | null,
      outLab?: { reason: string },
    ) => {
      if (!caseId) return null;
      try {
        setCompletingReview(true);
        await GyneDiagnosisService.completeReview(
          Number(caseId),
          result,
          note,
          level ?? undefined,
          outLab ? true : undefined,
          outLab?.reason,
        );
        message.success(
          outLab
            ? "Agreed & published — flagged for Out-Lab Consult"
            : result === "agree"
              ? "Agreed — case published."
              : "Discordance recorded — case returned to cytotechnologist.",
        );
        const updated = await GyneCytologyCaseService.getById(Number(caseId));
        setCaseData(updated);
        return result;
      } catch {
        message.error("Failed to complete review.");
        return null;
      } finally {
        setCompletingReview(false);
      }
    },
    [caseId, message],
  );

  const toggleOutLabConsult = useCallback(
    async (checked: boolean) => {
      if (!caseId) return;
      try {
        await GyneCytologyCaseService.update(Number(caseId), {
          is_out_lab_consult: checked,
        });
        setCaseData((prev) =>
          prev ? { ...prev, is_out_lab_consult: checked } : prev,
        );
        message.success("Out-Lab Consult status updated.");
        if (checked) {
          NotificationRuleService.triggerEvent("outlab_consult", {
            id_case: caseData?.accession_no ?? String(caseId),
            accession_no: caseData?.accession_no ?? "",
            sender: currentUser?.full_name ?? "-",
            lab_name: "-",
          }).catch(() => {});
        }
      } catch {
        message.error("Failed to update Out-Lab Consult status.");
      }
    },
    [caseId, caseData?.accession_no, currentUser?.full_name, message],
  );

  return {
    caseData,
    setCaseData,
    diagnosis,
    setDiagnosis,
    images,
    descMap,
    setDescMap,
    categories,
    pathologists,
    currentUser,
    systemSettings,
    loading,
    setLoading,
    loadingMaster,
    activeReportId,
    mainCategories,
    adequacyOptions,
    zoneOptions,
    qualityOptions,
    defaultSigners,
    fetchDiagnosis,
    fetchCaseData,
    fetchImages,
    saveDesc,
    submitting,
    setSubmitting,
    finalizing,
    completingReview,
    saveDraft,
    persistDraftForPreview,
    finalize,
    completeReview,
    toggleOutLabConsult,
  };
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { message } from "antd";
import type { FormInstance } from "antd";
import NongyneCaseImageService, {
  NongyneCaseImage,
} from "../../../services/nongyneCaseImageService";
import NongyneDiagnosisService from "../../../services/nongyneDiagnosisService";
import NongyneCytologyCaseService from "../../../services/nongyneCytoCaseService";
import NongyneReportService from "../../../services/nongyneReportService";
import UserService from "../../../services/userService";
import type { User } from "../../../types/user";
import type { NongyneCytologyCase } from "../../../types/nongyne";
import type {
  NongyneDiagnosisResponse,
  NongyneDiagnosisUpdate,
} from "../../../types/nongyneDiagnosis";
import logger from "../../../utils/logger";

/**
 * Form values for the page's single antd <Form>: the case-level fields
 * (saved via NongyneCytologyCaseService.update) plus everything
 * NongyneDiagnosisUpdate covers (saved via NongyneDiagnosisService) — the
 * form mixes both onto one <Form>, so onFinish/handlePreviewPdf/saveDraft
 * all receive the union.
 */
export type NongyneOnFinishValues = NongyneDiagnosisUpdate & {
  clinical_history?: string | null;
  specimen_type?: string;
  collection_site?: string | null;
  received_volume_ml?: string | null;
  has_malignancy?: boolean;
  has_critical?: boolean;
};

/**
 * Case-scoped data lifecycle for the Nongyne diagnosis/sign-out page —
 * mirrors GyneCytoDiagnosis/hooks/useGyneDiagnosisData.ts's split (hook =
 * what does this case currently look like, component = what is the user
 * doing to it right now), not its exact shape: Nongyne has no diagnosis
 * category/adequacy/quality taxonomy, so there's no equivalent of Gyne's
 * categories/adequacyOptions/systemSettings here. Also owns the save-draft
 * and finalize/sign-off business logic (saveDraft, finalize) so both call
 * sites (onFinish, handlePreviewPdf, handleFinalize, handleOutLabConsult in
 * the page) share one persistence path instead of drifting independently.
 */
export function useNongyneDiagnosisData(
  caseId: string | number | undefined,
  form: FormInstance,
) {
  const [caseData, setCaseData] = useState<NongyneCytologyCase | null>(null);
  const [diagnosis, setDiagnosis] = useState<NongyneDiagnosisResponse | null>(null);
  const [images, setImages] = useState<NongyneCaseImage[]>([]);
  const [descMap, setDescMap] = useState<Record<number, string>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);

  const fetchImages = useCallback(() => {
    if (!caseId) return;
    NongyneCaseImageService.getImages(Number(caseId))
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
      await NongyneCaseImageService.update(imgId, {
        description: descMap[imgId] ?? "",
      });
    },
    [descMap],
  );

  // Bare re-fetch — deliberately does NOT touch the form. Also used as
  // ConsultPdfPanel's onRefresh; filling the form here would silently
  // overwrite in-progress, unsaved clinical_history/specimen_type edits
  // whenever a consult PDF is uploaded/deleted (this page's Form mixes
  // case-level and diagnosis-level fields in one <Form>, unlike Gyne's).
  const fetchCaseData = useCallback(() => {
    if (!caseId) return;
    NongyneCytologyCaseService.getById(Number(caseId))
      .then(setCaseData)
      .catch((e) => logger.error(e));
  }, [caseId]);

  const fetchDiagnosis = useCallback(
    async (skipFormFill = false) => {
      if (!caseId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await NongyneDiagnosisService.getByCaseId(Number(caseId));
        if (data?.length > 0) {
          setDiagnosis(data[0]);
          if (!skipFormFill) form.setFieldsValue(data[0]);
        } else {
          setDiagnosis(null);
        }
      } catch {
        message.error("Failed to load diagnosis data.");
      } finally {
        setLoading(false);
      }
    },
    [caseId, form],
  );

  // Case + all users + current user, loaded together, plus filling the
  // case-level form fields. Disclosed, deliberate: UserService.getUsers()
  // stays unfiltered here (fetches every user), not narrowed to
  // pathologist/cytotechnologist roles the way Gyne's hook does — no
  // motivation to change that behavior as part of this extraction.
  useEffect(() => {
    if (!caseId) return;
    Promise.all([
      NongyneCytologyCaseService.getById(Number(caseId)),
      UserService.getUsers(),
      UserService.getCurrentUser(),
    ])
      .then(([caseRes, users, me]) => {
        setCaseData(caseRes);
        setAllUsers(users);
        setCurrentUser(me);
        form.setFieldsValue({
          clinical_history: caseRes.clinical_history,
          specimen_type: caseRes.specimen_type,
          collection_site: caseRes.collection_site,
          received_volume_ml: caseRes.received_volume_ml,
          has_malignancy: caseRes.has_malignancy ?? false,
          has_critical: caseRes.has_critical ?? false,
        });
      })
      .catch((e) => logger.error(e));
  }, [caseId, form]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  useEffect(() => {
    fetchDiagnosis();
  }, [fetchDiagnosis]);

  // Fixed: dependency array now includes caseData?.status (matching Gyne's
  // already-correct equivalent) — was [caseId] only, so activeReportId
  // (gates the Request Consult UI) never refreshed after a sign-off
  // updated caseData.status within the same mount.
  useEffect(() => {
    if (!caseId) return;
    NongyneReportService.getReportsByCase(Number(caseId))
      .then((reports) => {
        const active = reports.find((r) =>
          ["pending_approval", "published"].includes(r.status),
        );
        setActiveReportId(active?.id ?? null);
      })
      .catch((e) => logger.error(e));
  }, [caseId, caseData?.status]);

  const defaultSigners = useMemo(() => {
    const signers: {
      user_id: number;
      role: string;
      signed_at: string | null;
    }[] = [];
    const cytoId = caseData?.cytotechnologist?.id || caseData?.cytotechnologist_id;
    const pathoId = caseData?.pathologist?.id || caseData?.pathologist_id;
    if (cytoId)
      signers.push({ user_id: cytoId, role: "cytotechnologist", signed_at: null });
    if (pathoId)
      signers.push({ user_id: pathoId, role: "primary", signed_at: null });
    return signers;
  }, [caseData]);

  // Shared persistence primitive for the page's Save Draft and Preview PDF
  // actions: splits case-level fields from diagnosis-level fields, updates
  // the case, then creates or updates the diagnosis (with the addendum
  // diagnosis_order/entry_type branch). No try/catch/message here — each
  // caller keeps its own, so its existing success/error UX is unaffected.
  const saveDraft = useCallback(
    async (
      values: NongyneOnFinishValues,
      opts: { isAddendumMode: boolean; prevDiagnosis: NongyneDiagnosisResponse | null },
    ) => {
      const {
        clinical_history,
        specimen_type,
        collection_site,
        received_volume_ml,
        has_malignancy,
        has_critical,
        signers,
        ...diagnosisValues
      } = values;

      await NongyneCytologyCaseService.update(Number(caseId), {
        clinical_history: clinical_history ?? null,
        specimen_type,
        collection_site: collection_site ?? null,
        received_volume_ml: received_volume_ml ?? null,
        has_malignancy: has_malignancy ?? false,
        has_critical: has_critical ?? false,
      });
      setCaseData((prev) =>
        prev
          ? {
              ...prev,
              clinical_history,
              specimen_type,
              collection_site,
              received_volume_ml,
              has_malignancy,
              has_critical,
            }
          : prev,
      );

      const isCreate = !diagnosis || opts.isAddendumMode;
      if (diagnosis && !opts.isAddendumMode) {
        await NongyneDiagnosisService.update(diagnosis.id, { ...diagnosisValues, signers });
      } else {
        await NongyneDiagnosisService.create({
          ...diagnosisValues,
          case_id: Number(caseId),
          ...(opts.isAddendumMode && opts.prevDiagnosis
            ? {
                diagnosis_order: (opts.prevDiagnosis.diagnosis_order ?? 1) + 1,
                entry_type: "Addendum",
              }
            : {}),
        });
      }
      return { isCreate };
    },
    [caseId, diagnosis],
  );

  // Sign-off: stamps the current user's signer entry, persists slide/stain
  // quality + clinical history, marks the diagnosis signed, and publishes
  // the report (handling the pending/out-lab branches). Returns
  // true/false rather than navigating — the page still owns "go back after
  // a short delay" since that's a UI-navigation concern, not business logic.
  const finalize = useCallback(
    async (
      currentUserId: number | undefined,
      slideQuality: string | null,
      stainQuality: string | null,
      isCasePending: boolean,
      pendingReason: string,
      outLab?: { reason: string },
    ) => {
      if (!diagnosis || !caseId) return false;
      try {
        setSubmitting(true);
        const clinical_history = form.getFieldValue("clinical_history");
        const now = new Date().toISOString();

        const rawSigners: {
          user_id: number;
          role: string;
          signed_at: string | null;
        }[] = form.getFieldValue("signers") || [];
        const updatedSigners = rawSigners.map((s) =>
          Number(s.user_id) === Number(currentUserId)
            ? { ...s, signed_at: now }
            : s,
        );
        form.setFieldValue("signers", updatedSigners);

        await NongyneCytologyCaseService.update(Number(caseId), {
          clinical_history: clinical_history ?? null,
          slide_quality: slideQuality ?? undefined,
          stain_quality: stainQuality ?? undefined,
        });
        setCaseData((prev) =>
          prev
            ? {
                ...prev,
                clinical_history: clinical_history ?? null,
                slide_quality: slideQuality ?? undefined,
                stain_quality: stainQuality ?? undefined,
              }
            : prev,
        );

        await NongyneDiagnosisService.update(diagnosis.id, { status: "signed" });

        const publishedReport = (await NongyneReportService.publishReport(
          Number(caseId),
          updatedSigners,
          isCasePending,
          isCasePending ? pendingReason : undefined,
          outLab ? true : undefined,
          outLab?.reason,
        )) as { id: number; status: string };

        if (outLab) {
          message.success("Report signed off — flagged for Out-Lab Consult");
        } else if (publishedReport.status === "published") {
          message.success("Report finalized and published.");
        } else {
          message.success("Report submitted for approval.");
        }

        await fetchDiagnosis();
        return true;
      } catch (err) {
        logger.error(err);
        message.error("Failed to finalize report.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [diagnosis, caseId, form, fetchDiagnosis],
  );

  return {
    caseData,
    setCaseData,
    diagnosis,
    setDiagnosis,
    images,
    descMap,
    setDescMap,
    allUsers,
    currentUser,
    loading,
    setLoading,
    submitting,
    setSubmitting,
    activeReportId,
    defaultSigners,
    fetchDiagnosis,
    fetchCaseData,
    fetchImages,
    saveDesc,
    saveDraft,
    finalize,
  };
}

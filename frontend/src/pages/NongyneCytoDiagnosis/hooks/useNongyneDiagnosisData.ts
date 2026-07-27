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
import type { NongyneDiagnosisResponse } from "../../../types/nongyneDiagnosis";
import logger from "../../../utils/logger";

/**
 * Case-scoped data lifecycle for the Nongyne diagnosis/sign-out page —
 * mirrors GyneCytoDiagnosis/hooks/useGyneDiagnosisData.ts's split (hook =
 * what does this case currently look like, component = what is the user
 * doing to it right now), not its exact shape: Nongyne has no diagnosis
 * category/adequacy/quality taxonomy, so there's no equivalent of Gyne's
 * categories/adequacyOptions/systemSettings here.
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
    activeReportId,
    defaultSigners,
    fetchDiagnosis,
    fetchCaseData,
    fetchImages,
    saveDesc,
  };
}

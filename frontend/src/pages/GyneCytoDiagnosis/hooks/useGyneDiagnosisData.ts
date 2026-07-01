import { useState, useEffect, useCallback, useMemo } from "react";
import { App } from "antd";
import type { FormInstance } from "antd";
import GyneCaseImageService, {
  GyneCaseImage,
} from "../../../services/gyneCaseImageService";
import GyneDiagnosisService from "../../../services/gyneDiagnosisService";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import UserService from "../../../services/userService";
import SystemSettingService from "../../../services/systemSettingService";
import type { User } from "../../../types/user";
import type { SystemSetting } from "../../../types/system";
import type { GyneCytologyCase } from "../../../types/gyne-cytology";
import type {
  GyneDiagnosisResponse,
  GyneDiagnosisCategory,
  GyneSpecimenAdequacy,
} from "../../../types/gyne-diagnosis";
import logger from "../../../utils/logger";

export function useGyneDiagnosisData(
  caseId: string | number | undefined,
  form: FormInstance,
) {
  const { message } = App.useApp();

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

    const isCyto = currentUser.roles?.some((r) => r === "cytotechnologist");
    const currentUserRole = isCyto ? "cytotechnologist" : "pathologist";

    const signers: { user_id: number; role: string; signed_at: null }[] = [
      { user_id: currentUser.id, role: currentUserRole, signed_at: null },
    ];

    const cytoId =
      caseData?.cytotechnologist?.id ?? caseData?.cytotechnologist_id;
    const pathoId = caseData?.pathologist?.id ?? caseData?.pathologist_id;

    if (pathoId && pathoId !== currentUser.id) {
      signers.push({ user_id: pathoId, role: "pathologist", signed_at: null });
    }
    if (cytoId && cytoId !== currentUser.id) {
      signers.push({
        user_id: cytoId,
        role: "cytotechnologist",
        signed_at: null,
      });
    }

    return signers;
  }, [caseData, currentUser]);

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
  };
}

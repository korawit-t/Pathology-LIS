import { useState, useEffect, useCallback } from "react";
import { FormInstance, message, Form, Modal } from "antd";
import SurgicalDiagnosisService from "../../../services/surgicalDiagnosisService";
import SurgicalSpecimenService from "../../../services/surgicalSpecimenService";
import UserService from "../../../services/userService";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import { SurgicalCase, SurgicalSpecimen } from "../../../types/surgical";
import { SurgicalDiagnosis } from "../../../types/surgicalDiagnosis";
import { SurgicalReport } from "../../../types/surgicalReport";
import SurgicalReportService from "../../../services/surgicalReportService";
import SystemSettingService from "../../../services/systemSettingService";
import { prepareBulkSavePayload } from "../utils/prepareBulkSavePayload";
import { User } from "../../../types/user";
import { SystemSetting } from "../../../types/system";
import dayjs from "dayjs";
import logger from "../../../utils/logger";

export const useSurgicalReport = (
  caseId: string | undefined,
  user: User | null,
  form: FormInstance,
) => {
  const [allDiagnoses, setAllDiagnoses] = useState<SurgicalDiagnosis[]>([]);
  const [loading, setLoading] = useState(false);
  const [surgicalCase, setSurgicalCase] = useState<SurgicalCase | null>(null);
  const [specimen, setSpecimen] = useState<SurgicalSpecimen | null>(null);
  const [currentDiagnosis, setCurrentDiagnosis] =
    useState<SurgicalDiagnosis | null>(null);
  const [pathologists, setPathologists] = useState<User[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "edit">("list");
  const [diagnosisMode, setDiagnosisMode] = useState<
    "individual" | "integrated" | "clean"
  >(user?.preferences?.default_diagnosis_mode || "individual");

  const isIndividualMode = diagnosisMode === "individual";
  const isIntegratedMode = diagnosisMode === "integrated";
  const isCleanMode = diagnosisMode === "clean";

  const isCombinedMode =
    diagnosisMode === "integrated" || diagnosisMode === "clean";

  // PDF State
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  //State สำหรับเก็บ Settings
  const [settings, setSettings] = useState<SystemSetting | null>(null);

  // Computed Logic
  const hasOriginalSigned = allDiagnoses.some(
    (d) => d.entry_type === "Original" && d.status === "signed",
  );
  const isFirstEntry =
    allDiagnoses.length === 0 ||
    (allDiagnoses.length === 1 && currentDiagnosis?.id === allDiagnoses[0].id);

  // เพิ่มตัวแปรสำหรับเช็คสถานะรวม
  const hasDraft =
    surgicalCase?.specimens?.some((spec) => {
      const currentVal = form.getFieldValue(["diagnoses", spec.id, "status"]);
      return currentVal !== "signed";
    }) ?? false;

  const fetchData = useCallback(async () => {
    if (!caseId || caseId === "undefined") return;

    setLoading(true);
    try {
      const [pathologistsRes, caseData, settingsRes, allDiagsRes] =
        await Promise.all([
          UserService.getUsers({ role: "pathologist" }),
          SurgicalCaseService.getCaseById(caseId),
          SystemSettingService.getSettings(),
          SurgicalDiagnosisService.getDiagnosesByCase(Number(caseId)),
        ]);

      setPathologists(pathologistsRes);
      if (caseData.specimens) {
        caseData.specimens = [...caseData.specimens].sort((a, b) =>
          (a.specimen_label ?? "").localeCompare(b.specimen_label ?? "", undefined, { sensitivity: "base" })
        );
      }
      setSurgicalCase(caseData);
      setSettings(settingsRes);

      const allFetchedDiags = Array.isArray(allDiagsRes)
        ? allDiagsRes
        : (allDiagsRes as {data: SurgicalDiagnosis[]}).data || [];
      setAllDiagnoses(allFetchedDiags);

      // ถ้ายังไม่เคยบันทึก Draft ใดๆ (allFetchedDiags.length === 0)
      // ให้ใช้ Preference ของหมอเป็นหลัก เพราะ caseData.diagnosis_mode คือค่า Default ตอนสร้างเคส (individual)
      let detectedMode: "individual" | "integrated" | "clean" = "individual";
      if (allFetchedDiags.length === 0) {
        detectedMode = (user?.preferences?.default_diagnosis_mode as "individual" | "integrated" | "clean") || "individual";
      } else {
        detectedMode = (caseData.diagnosis_mode as "individual" | "integrated" | "clean") || (user?.preferences?.default_diagnosis_mode as "individual" | "integrated" | "clean") || "individual";
      }
      setDiagnosisMode(detectedMode);

      // 🚩 0. เช็คก่อนว่าเคสนี้ "จบไปแล้วหรือยัง"
      const isCaseSignedOut =
        caseData.status === "signed out" || caseData.status === "published";

      // 🚩 1. ค้นหา Order สูงสุดที่มีอยู่
      const maxOrderInDB = Math.max(
        ...allFetchedDiags.map((d: SurgicalDiagnosis) => d.diagnosis_order || 1),
        1,
      );

      // 🚩 1.5 ตัดสินใจว่าจะใช้ Order ไหน
      // ถ้าเคสจบแล้ว และไม่มี Active Report (Draft) ของ Addendum อยู่เลย
      // แสดงว่าเรากำลังจะเริ่ม Order ใหม่ (+1)
      let effectiveOrder = maxOrderInDB;

      const hasActiveReport = caseData.reports?.some((r: SurgicalReport) =>
        ["draft", "pending", "pending_approval"].includes(r.status),
      );

      if (isCaseSignedOut && !hasActiveReport) {
        effectiveOrder = maxOrderInDB + 1;
      }

      // 🚩 2. หา Report ที่ยังไม่จบ (เหมือนเดิม แต่ใช้ค่าที่กรองแม่นขึ้น)
      const activeReport = caseData.reports?.find((r: SurgicalReport) =>
        ["draft", "pending", "pending_approval"].includes(r.status),
      );

      let currentSigners = [];

      if (activeReport && activeReport.signers?.length > 0) {
        // กรองด้วย effectiveOrder
        const currentOrderSigners = activeReport.signers.filter(
          (s) => s.diagnosis_order === effectiveOrder,
        );

        currentSigners = currentOrderSigners.map((s) => ({
          user_id: s.user_id,
          role: s.role,
          signed_at: s.signed_at,
          status: s.signed_at ? "signed" : "pending",
        }));
      }

      // 🚩 4. กรณี Fallback (ถ้ายังว่าง)
      if (currentSigners.length === 0) {
        // ถ้าเราอยู่ใน Order ใหม่ (+1) แน่นอนว่ายังไม่มีใครเซ็น
        // ระบบจะตกมาที่ PENDING โดยอัตโนมัติ ซึ่งถูกต้องสำหรับ Addendum ใหม่
        currentSigners = [
          {
            user_id: caseData.pathologist_id || user?.id,
            role: "primary",
            signed_at: null,
            status: "pending",
          },
        ];
      }

      const masterValues: Record<string, unknown> = {
        case_id: caseData.id,
        diagnosis_mode: detectedMode,
        // 🚩 เซต Global Pathologists จากก้อนที่เราหาได้ด้านบน
        global_pathologists: currentSigners,
        case_diagnosis_text:
          allFetchedDiags.find(
            (d: SurgicalDiagnosis) =>
              d.diagnosis_level === "CASE" &&
              d.diagnosis_order === effectiveOrder,
          )?.diagnosis || "",
        clinical_diagnosis: caseData.clinical_diagnosis || "",
        has_malignancy: !!caseData.has_malignancy,
        has_critical: !!caseData.has_critical,
        is_pending: !!caseData.is_pending,
        pending_reason: caseData.pending_reason || "",
        is_out_lab_consult: !!caseData.is_out_lab_consult,
        consult_reason: caseData.consult_reason || "",
        consult_report_out_at: caseData.consult_report_out_at ? dayjs(caseData.consult_report_out_at) : null,
        stain_quality: caseData.stain_quality || undefined,
        tissue_quality: caseData.tissue_quality || undefined,
        slide_quality: caseData.slide_quality || undefined,
        diagnoses: {},
        gross_descriptions: {},
      };

      // จัดการข้อมูลรายชิ้น
      if (caseData.specimens) {
        caseData.specimens.forEach((spec: SurgicalSpecimen) => {
          masterValues.gross_descriptions[spec.id] =
            spec.gross_description || "";

          const latestSpecDiag = allFetchedDiags
            .filter(
              (d: SurgicalDiagnosis) =>
                d.surgical_specimen_id === spec.id &&
                d.diagnosis_level === "SPECIMEN",
            )
            .sort((a, b) => b.id - a.id)[0];

          if (latestSpecDiag) {
            masterValues.diagnoses[spec.id] = {
              ...latestSpecDiag,
              is_active: true,
              // 🚩 3. ในโหมด Individual เราก็ใช้ Signers ชุดเดียวกันจาก Report
              pathologists: currentSigners,
            };
          } else {
            masterValues.diagnoses[spec.id] = {
              entry_type: "Original",
              is_active: true,
              pathologists: currentSigners,
            };
          }
        });
      }

      form.setFieldsValue(masterValues);
      setViewMode("edit");
    } catch (error: any) {
      logger.error("Fetch error:", error);
      message.error(`โหลดข้อมูลล้มเหลว: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [caseId, form, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // แจ้งเตือนเรื่อง Addendum แยกออกมา
  useEffect(() => {
    // เช็คว่าถ้ามี Original ที่ Sign แล้ว และตอนนี้ฟอร์มถูกเซตเป็น Addendum แล้วจริงๆ
    const currentType = form.getFieldValue("entry_type");

    if (hasOriginalSigned && currentType === "Addendum" && !currentDiagnosis) {
      // ใช้ Key เพื่อป้องกัน Ant Design แสดง message ซ้ำซ้อน (Duplicate)
      message.info({
        content:
          "ผลล่าสุดถูกลงนามแล้ว ระบบเปิดบันทึกฉบับใหม่ (Addendum) ให้โดยอัตโนมัติ",
        key: "addendum-notify", // 🚩 Key เดียวกันจะทำให้ message ไม่ซ้อนกัน
        duration: 4,
      });
    }
  }, [hasOriginalSigned, currentDiagnosis, form]);

  const handleSelectDiagnosis = (diag: SurgicalDiagnosis) => {
    setCurrentDiagnosis(diag);
    form.setFieldsValue({
      ...diag,
      clinical_diagnosis: surgicalCase?.clinical_diagnosis,
    });
    setViewMode("edit");
  };

  // --- 1. สำหรับกดปุ่ม Individual ---
  const handleSaveAsIndividualDraft = async () => {
    if (!surgicalCase?.id || !surgicalCase.specimens) return;

    // เช็คว่าปัจจุบันเป็นโหมดรวม (Integrated/Clean) หรือไม่
    const isCurrentlyCombined =
      diagnosisMode === "integrated" || diagnosisMode === "clean";

    // และเช็คว่ามี Draft ของโหมดรวมค้างอยู่ในระบบจริงไหม
    const hasCaseLevelDraft = allDiagnoses.some(
      (d) => d.diagnosis_level === "CASE" && d.status === "draft",
    );

    if (isCurrentlyCombined && hasCaseLevelDraft) {
      Modal.confirm({
        title: "สลับเป็นโหมดลงผลแยกชิ้น (Individual Mode)",
        content:
          "ระบบจะใช้ข้อมูลจากช่องแยกชิ้นเนื้อ และหยุดแสดงผลคำวินิจฉัยรวมเดิม ยืนยันหรือไม่?",
        okText: "ยืนยัน",
        cancelText: "ยกเลิก",
        onOk: () => executeBulkSave("individual"),
      });
    } else {
      executeBulkSave("individual");
    }
  };

  // --- 2. สำหรับกดปุ่ม Integrated ---
  const handleSaveAsIntegratedDraft = async () => {
    if (!surgicalCase?.id || !surgicalCase.specimens) return;
    executeBulkSave("integrated");
  };

  const handleSaveAsCleanDraft = async () => {
    if (!surgicalCase?.id || !surgicalCase.specimens) return;
    // ถ้าเดิมเป็น Individual แล้วจะสลับมา Clean อาจจะเพิ่ม Modal ถามแบบเดียวกันได้
    // แต่ถ้ากด Save ในโหมดเดิมอยู่แล้ว ให้ Execute ได้เลย
    executeBulkSave("clean");
  };

  // --- 3. ฟังก์ชันกลาง (หัวใจหลัก) ---
  const executeBulkSave = async (
    mode: "individual" | "integrated" | "clean",
  ) => {
    // 1. เช็คว่ามีข้อมูล "ข้ามโหมด" ค้างอยู่หรือไม่
    const hasCaseData = form.getFieldValue("case_diagnosis_text");
    const hasSpecimenData = Object.values(
      form.getFieldValue("diagnoses") || {},
    ).some((d: SurgicalDiagnosis) => d.diagnosis && d.diagnosis.trim() !== "");

    // 2. ถ้าจะเซฟโหมด Individual แต่มีข้อมูล Case level อยู่
    if (mode === "individual" && hasCaseData && hasCaseData !== "<p></p>") {
      Modal.confirm({
        title: "Confirm Switch to Individual",
        content:
          "คุณพิมพ์คำวินิจฉัยค้างอยู่ในโหมด Integrated/Clean หากบันทึกแบบแยกชิ้น ข้อมูลที่คุณพิมพ์ค้างอยู่ในช่องพิมพ์ล่าสุดจะถูกลบ ยืนยันหรือไม่?",
        onOk: () => proceedWithSave(mode),
      });
      return;
    }

    // 3. ถ้าจะเซฟโหมด Integrated/Clean แต่มีข้อมูล Individual รายชิ้นอยู่
    if ((mode === "integrated" || mode === "clean") && hasSpecimenData) {
      Modal.confirm({
        title: "Confirm Switch to Combined Mode",
        content:
          "คุณพิมพ์ Diagnosis ค้างในโหมดแยกชิ้น (Individual) หากบันทึกแบบรวม ข้อมูล Diagnosis ที่พิมพ์ค้างอยู่ในช่องพิมพ์ล่าสุดจะถูกลบ ยืนยันหรือไม่?",
        onOk: () => proceedWithSave(mode),
      });
      return;
    }

    // 4. ถ้าไม่มีข้อมูลข้ามโหมด หรือกดยืนยันแล้ว ให้เซฟตามปกติ
    proceedWithSave(mode);
  };

  // แยก Logic การเซฟจริงออกมาเป็นฟังก์ชันย่อย
  const proceedWithSave = async (
    mode: "individual" | "integrated" | "clean",
  ) => {
    setLoading(true);
    try {
      const bulkPayload = prepareBulkSavePayload({
        form,
        surgicalCase,
        diagnosisMode: mode,
        user,
      });

      await SurgicalDiagnosisService.bulkSaveDraft(bulkPayload as unknown as Record<string, unknown>);

      setDiagnosisMode(mode);
      // Use setFields with touched:false so onValuesChange is NOT fired,
      // preventing the form from becoming dirty again right after save.
      form.setFields([{ name: "diagnosis_mode", value: mode, touched: false }]);

      message.success({ content: `บันทึกร่างแบบ ${mode.toUpperCase()} เรียบร้อยแล้ว`, key: "save-draft", duration: 2 });
      await fetchData();
      await handlePreviewPDF();
    } catch (error: any) {
      if (error?.response?.status === 423) {
        message.warning("Case is locked — slides dispatched for external consultation. Upload the consult PDF to unlock.");
      } else {
        message.error("บันทึกล้มเหลว: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteWorkflow = async (finalizeData?: {
    stain_quality?: string;
    tissue_quality?: string;
    slide_quality?: string;
    has_malignancy?: boolean;
    has_critical?: boolean;
    is_pending?: boolean;
    pending_reason?: string;
  }, successMessage?: string) => {
    if (!surgicalCase?.id) return false;
    setLoading(true);

    try {
      // 0. Update main form state with Finalize Data so validation logic doesn't crash on old values
      if (finalizeData) {
        form.setFieldsValue({
          is_pending: finalizeData.is_pending,
          pending_reason: finalizeData.pending_reason,
          stain_quality: finalizeData.stain_quality,
          tissue_quality: finalizeData.tissue_quality,
          slide_quality: finalizeData.slide_quality,
        });
      }

      // 1. ดึงข้อมูลล่าสุดทั้งหมดที่หมอพิมพ์ค้างไว้ใน Form
      const values = await form.validateFields();

      // 2. เตรียม Payload
      const payload = prepareBulkSavePayload({
        form,
        surgicalCase,
        diagnosisMode,
        user, // 🚩 อย่าลืมส่ง user เข้าไปด้วย (ถ้าใน Interface ใหม่ต้องการใช้หา default pathologist)
        finalizeData,
      });

      // แนบเหตุผลการแก้ไข (ถ้ามี)
      payload.global_revision_reason = values.global_revision_reason;

      // 3. ยิง API "One-Stop Service"
      await SurgicalReportService.finalizeAndSnapshot(
        Number(surgicalCase.id),
        payload,
      );

      message.success(successMessage ?? "Report signed off successfully");

      // 4. Clean up & Update UI
      await fetchData();
      await handlePreviewPDF(); // แสดง PDF ล่าสุด

      return true;
    } catch (error: any) {
      // กรณี Form validate ไม่ผ่าน (ลืมกรอกช่องแดง)
      if (error.errorFields) {
        message.error("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
      } else {
        message.error(
          error.response?.data?.detail || "เกิดข้อผิดพลาดในการปิดเคส",
        );
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewPDF = async () => {
    try {
      setGeneratingPdf(true);
      // ส่งแค่ caseId ไปก้อนเดียวจบ
      // Backend จะไป Query หาเองว่าเคสนี้ล่าสุดคือ Integrated (CASE) หรือ Individual (SPECIMEN)
      const blob = await SurgicalReportService.previewReportPdf(Number(caseId));

      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      message.error("ไม่สามารถสร้างตัวอย่างรายงานได้");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const diagnosesWatch = Form.useWatch("diagnoses", form);

  const isAwaitingApproval =
    surgicalCase?.reports?.some(
      (report: SurgicalReport) =>
        report.status === "pending" || report.status === "pending_approval",
    ) ?? false;

  const isLocked = (() => {
    // 1. ถ้ากำลังรออนุมัติ (Pending Approval) ล็อคแน่นอน
    if (isAwaitingApproval) return true;

    // 2. เช็คว่า "มีร่าง (Draft) ค้างอยู่หรือไม่" ไม่ว่าจะเป็นระดับชิ้น (Individual) หรือระดับเคส (Integrated)
    const hasDraft = allDiagnoses.some((d) => d.status === "draft");

    // 3. เช็คว่าเคสนี้ "เซ็นชื่อครบจบงานไปแล้วหรือยัง"
    // ถ้า Case Status เป็น 'signed' และไม่มี draft ใหม่เปิดขึ้นมา (เช่น กำลังจะทำ Addendum) ให้ล็อค
    if (surgicalCase?.status === "signed out" && !hasDraft) {
      return true;
    }

    // 4. ถ้ามี Draft ค้างอยู่ (ไม่ว่าจะเพิ่งสร้างใหม่หรือค้างไว้) -> ปลดล็อค (return false)
    if (hasDraft) return false;

    // 5. Default: ถ้ายังไม่เคยเซ็นเลย (Initial) -> ปลดล็อค
    return false;
  })();

  return {
    loading,
    pdfUrl,
    generatingPdf,
    surgicalCase,
    allDiagnoses, // เปลี่ยนชื่อเพื่อให้สอดคล้อง
    currentDiagnosis,
    pathologists,
    viewMode,
    isLocked,
    isAwaitingApproval,
    isFirstEntry,
    hasOriginalSigned,
    settings,
    diagnosisMode,
    setDiagnosisMode,
    setSurgicalCase,
    setViewMode,
    handleSelectDiagnosis,
    handleSaveAsIndividualDraft,
    handleSaveAsIntegratedDraft,
    handleSaveAsCleanDraft,
    handlePreviewPDF,
    refresh: fetchData,
    handleCompleteWorkflow,
  };
};

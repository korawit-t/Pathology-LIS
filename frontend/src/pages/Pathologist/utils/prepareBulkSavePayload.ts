// frontend/src/pages/Pathologist/utils/prepareBulkSavePayload.ts
import type { FormInstance } from "antd";
import type { SurgicalCase } from "../../../types/surgical";
import type { User } from "../../../types/user";
import { BulkSaveDraft, DiagnosisData } from "../../../types/surgicalBulk";

interface GlobalPathologistEntry {
  user_id?: number;
  role?: string;
  signed_at?: string | null;
}

interface PreparePayloadProps {
  form: FormInstance;
  surgicalCase: SurgicalCase;
  diagnosisMode: "individual" | "integrated" | "clean";
  user: User;
  finalizeData?: {
    stain_quality?: string;
    tissue_quality?: string;
    slide_quality?: string;
    has_malignancy?: boolean;
    has_critical?: boolean;
    is_pending?: boolean;
    pending_reason?: string;
  };
}

export const prepareBulkSavePayload = ({
  form,
  surgicalCase,
  diagnosisMode,
  user,
  finalizeData,
}: PreparePayloadProps): BulkSaveDraft => {
  const formValues = form.getFieldsValue(true);

  // Use overrides if provided, otherwise fallback to form values
  const hasMalignancy =
    finalizeData?.has_malignancy ?? !!formValues.has_malignancy;
  const hasCritical = finalizeData?.has_critical ?? !!formValues.has_critical;
  const isPending = finalizeData?.is_pending ?? !!formValues.is_pending;
  const pendingReason = isPending
    ? finalizeData?.pending_reason ?? formValues.pending_reason
    : null;

  // 🚩 1. จัดการ Global Pathologists ก่อน (ตัวตัดสินใจหลัก)
  // กรองเอาเฉพาะที่มี user_id จริงๆ (ป้องกันแถวว่างที่เกิดจากการกด add แล้วไม่เลือก)
  const currentGlobalPathologists = (formValues.global_pathologists as GlobalPathologistEntry[] || [])
    .filter((p) => p.user_id)
    .map((p) => ({
      user_id: p.user_id!,
      role: p.role || "primary",
      signed_at: p.signed_at || null,
    }));

  // ถ้าไม่มีใครเลย ให้ใส่ตัวเราเองเป็น Default
  const finalPathologists =
    currentGlobalPathologists.length > 0
      ? currentGlobalPathologists
      : [{ user_id: user.id, role: "primary", signed_at: null }];

  // 🚩 2. จัดการ Diagnoses
  const rawDiagnoses = formValues.diagnoses || {};
  const diagnosesMap: Record<string, DiagnosisData> = {};

  Object.keys(rawDiagnoses).forEach((specId) => {
    const d = rawDiagnoses[specId];
    if (d) {
      diagnosesMap[specId] = {
        // ✅ ถ้าเป็นโหมด Integrated/Clean ให้ส่ง diagnosis เป็น null เสมอ
        // เพื่อป้องกันค่าเก่าจากโหมด Individual หลุดไปทับ
        diagnosis:
          diagnosisMode === "integrated" || diagnosisMode === "clean"
            ? null
            : d.diagnosis || null,

        microscopic_description: d.microscopic_description || null,
        is_active: d.is_active ?? true,
        pathologists: finalPathologists,
      };
    }
  });

  // 🚩 3. จัดการ Gross
  const grossMap: Record<string, string> = {};
  Object.keys(formValues.gross_descriptions || {}).forEach((specId) => {
    grossMap[specId] = formValues.gross_descriptions[specId] || "";
  });

  return {
    case_id: Number(surgicalCase?.id),
    diagnosis_mode: diagnosisMode,
    clinical_diagnosis: formValues.clinical_diagnosis || null,
    has_malignancy: hasMalignancy,
    has_critical: hasCritical,
    is_pending: isPending,
    pending_reason: pendingReason,
    is_out_lab_consult: !!formValues.is_out_lab_consult,
    consult_reason: formValues.is_out_lab_consult
      ? (formValues.consult_reason || null)
      : null,
    consult_report_out_at: formValues.consult_report_out_at
      ? formValues.consult_report_out_at.toISOString()
      : null,
    gross_descriptions: grossMap,
    diagnoses: diagnosesMap,
    case_diagnosis_text:
      diagnosisMode === "integrated" || diagnosisMode === "clean"
        ? formValues.case_diagnosis_text || null
        : null,

    // 🚩 ส่งตัวหลักไปให้ Backend ใช้ Sync ตาราง ReportSigner
    pathologists: finalPathologists,

    global_revision_reason: formValues.global_revision_reason || null,
    signed_by_id: user.id,
    stain_quality: finalizeData?.stain_quality,
    tissue_quality: finalizeData?.tissue_quality,
    slide_quality: finalizeData?.slide_quality,
  };
};

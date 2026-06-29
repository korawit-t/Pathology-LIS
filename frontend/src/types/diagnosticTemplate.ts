// src/types/diagnosticTemplate.ts

/**
 * Interface สำหรับข้อมูลหลักของ Diagnostic Template
 */
export interface DiagnosticTemplate {
  id?: number;
  name: string;
  diagnosis_content: string;
  microscopic_content: string | null;
  category: string | null;
  is_active: boolean;
  created_by_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Interface สำหรับ Parameter ในการดึงข้อมูล/ค้นหา
 */
export interface GetTemplatesParams {
  category?: string;
  skip?: number;
  limit?: number;
}

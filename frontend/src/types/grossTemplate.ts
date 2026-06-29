// 1. กำหนด Interface สำหรับข้อมูล Gross Template
export interface BlockTemplateItem {
  tissue_description?: string | null;
  tissue_count?: number | null;
  is_tissue_uncountable?: boolean;
}

export interface GrossTemplate {
  id?: number;
  name: string;
  raw_content: string;
  category: string | null;
  is_active?: boolean;
  block_templates?: BlockTemplateItem[] | null;
  created_by_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

// 2. กำหนด Interface สำหรับ Parameter ในการดึงข้อมูล (Query Params)
export interface GetGrossTemplatesParams {
  category?: string;
  skip?: number;
  limit?: number;
}

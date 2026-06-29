// Master Data Interfaces
export interface GyneSpecimenAdequacy {
  id: number;
  group_type: string; // "ADEQUACY", "ZONE", "QUALITY"
  text: string;
  code?: string;
}

export interface GyneDiagnosisCategory {
  id: number;
  code: string;
  text: string;
  parent_id?: number | null;
}

// Diagnosis Interfaces
export interface GyneDiagnosisResponse {
  id: number;
  case_id: number;
  
  // Legacy / Text Fields
  adequacy: string | null;
  category: string | null; 
  interpretation: string | null;
  note: string | null;
  
  // New Structured Fields
  adequacy_id: number | null;
  endocervical_status_id: number | null;
  quality_id: number | null;
  category_1_id: number | null;
  category_2_id: number | null;

  version: number;
  is_current: boolean;
  revised_reason: string | null;
  created_at: string;
  updated_at: string | null;

  // Joined Objects (Optional)
  adequacy_obj?: GyneSpecimenAdequacy;
  endocervical_status_obj?: GyneSpecimenAdequacy;
  quality_obj?: GyneSpecimenAdequacy;
  category_1_obj?: GyneDiagnosisCategory;
  category_2_obj?: GyneDiagnosisCategory;

  signers?: { user_id: number; role: string; signed_at?: string | null }[];
}

export interface GyneDiagnosisCreate {
  case_id: number;
  
  // Text fields (Optional now)
  adequacy?: string;
  category?: string;
  interpretation?: string;
  note?: string;

  // New Structured Fields
  adequacy_id?: number;
  endocervical_status_id?: number;
  quality_id?: number;
  category_1_id?: number;
  category_2_id?: number;

  signers?: { user_id: number; role: string; signed_at?: string | null }[];
}

export interface GyneDiagnosisUpdate {
  // Text fields
  adequacy?: string;
  category?: string;
  interpretation?: string;
  note?: string;

  // New Structured Fields
  adequacy_id?: number;
  endocervical_status_id?: number;
  quality_id?: number;
  category_1_id?: number;
  category_2_id?: number;

  signers?: { user_id: number; role: string; signed_at?: string | null }[];

  revised_reason?: string;
  slide_quality?: string;
  stain_quality?: string;
}

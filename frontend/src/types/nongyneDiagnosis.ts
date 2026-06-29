export interface NongyneDiagnosisBase {
    gross_description?: string;
    microscopic_description?: string;
    diagnosis?: string;
    comment?: string;
}

export interface NongyneDiagnosisCreate extends NongyneDiagnosisBase {
    case_id: number;
    diagnosis_order?: number;
    entry_type?: string;
}

export interface NongyneDiagnosisUpdate extends NongyneDiagnosisBase {
    status?: string;
    slide_quality?: string;
    stain_quality?: string;
    signers?: { user_id: number; role: string; signed_at?: string | null }[];
}

export interface NongyneDiagnosisRevise extends NongyneDiagnosisBase {
    revision_reason: string;
    entry_type: string;
}

export interface NongyneDiagnosisResponse extends NongyneDiagnosisBase {
    id: number;
    case_id: number;
    previous_version_id?: number;
    diagnosis_order: number;
    entry_type: string;
    diagnosis_at?: string;
    revision_reason?: string;
    status: string;
    created_at: string;
    updated_at: string;
}

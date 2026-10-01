// src/services/diagnosisSearchService.ts
import api from "./httpClient";
import type {
  DiagnosisSearchParams,
  DiagnosisSearchResponse,
} from "../types/diagnosisSearch";

/** Repeated query params (`specimen_terms=colon&specimen_terms=biopsy`) are what
 *  FastAPI's `List[str] = Query(...)` expects, so blank terms are dropped here
 *  rather than sent as empty strings. */
const toQuery = (params: DiagnosisSearchParams): Record<string, unknown> => {
  const query: Record<string, unknown> = {
    match_mode: params.match_mode,
    include_gross: params.include_gross,
    include_microscopic: params.include_microscopic,
    date_field: params.date_field,
    only_reported: params.only_reported,
  };
  const specimen = params.specimen_terms.map((t) => t.trim()).filter(Boolean);
  const diagnosis = params.diagnosis_terms.map((t) => t.trim()).filter(Boolean);
  if (specimen.length) query.specimen_terms = specimen;
  if (diagnosis.length) query.diagnosis_terms = diagnosis;
  if (params.date_from) query.date_from = params.date_from;
  if (params.date_to) query.date_to = params.date_to;
  if (params.hospital_id != null) query.hospital_id = params.hospital_id;
  return query;
};

const DiagnosisSearchService = {
  search: async (params: DiagnosisSearchParams): Promise<DiagnosisSearchResponse> => {
    const res = await api.get<DiagnosisSearchResponse>("/diagnosis-search", {
      params: toQuery(params),
    });
    return res.data;
  },
};

export default DiagnosisSearchService;

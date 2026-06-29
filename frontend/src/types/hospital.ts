// src/types/hospital.ts
export interface Hospital {
  id: number;
  code?: string;
  name: string;
  address?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HospitalPayload {
  name: string;
  code?: string;
  address?: string;
}
// src/types/image.ts

export interface GrossImage {
  id: number;
  specimen_id: number;
  image_url: string;
  original_filename?: string;
  description?: string;
  order: number;
  uploaded_at: string;
  show_in_report?: boolean;
}

export interface MicroscopicImage {
  id: number;
  specimen_id: number;
  image_url: string;
  original_filename?: string;
  magnification?: string;
  stain?: string;
  description?: string;
  order: number;
  uploaded_at: string;
  uploaded_by_id?: number;
  show_in_report?: boolean;
}
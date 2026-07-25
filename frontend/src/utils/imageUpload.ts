import { MAX_IMAGE_UPLOAD_BYTES } from "../constants/upload.constants";

export function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

/** Decodes a data: URL (or fetches a blob: URL) to measure its real byte size. */
export async function getDataUrlByteSize(dataUrl: string): Promise<number> {
  const blob = await (await fetch(dataUrl)).blob();
  return blob.size;
}

export function oversizeMessage(bytes: number): string {
  return `ไฟล์ใหญ่เกินไป (${formatMb(bytes)} MB) จำกัดที่ ${formatMb(MAX_IMAGE_UPLOAD_BYTES)} MB`;
}

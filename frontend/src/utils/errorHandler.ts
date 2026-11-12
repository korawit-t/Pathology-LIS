import { message } from "antd";
import type { FormInstance } from "antd";
import { AxiosError } from "axios";
import logger from "./logger";

interface PydanticError {
  type?: string;
  loc?: (string | number)[];
  msg: string;
  ctx?: { min_length?: number; max_length?: number };
}

interface ApiError {
  detail?: string | PydanticError[];
}

export interface ValidationError {
  /** The request-body field the error is about, when there is one. */
  field?: string;
  message: string;
}

/** FastAPI answers a request body that fails its schema with 422 and a list
 * of Pydantic errors instead of a string, so `getErrorDetail` finds nothing
 * and a caller passing `detail` straight to `message.error` shows nothing
 * readable. Returns one entry per error (empty if this isn't such a response),
 * with the body field it belongs to so a form can mark that field. */
export const getValidationErrors = (err: unknown): ValidationError[] => {
  const detail = (err as AxiosError<ApiError> | undefined)?.response?.data
    ?.detail;
  if (!Array.isArray(detail)) return [];

  return detail
    .filter((e): e is PydanticError => typeof e?.msg === "string")
    .map((e) => {
      const loc = e.loc ?? [];
      const last = loc[loc.length - 1];
      const field =
        loc[0] === "body" && loc.length > 1 && typeof last === "string"
          ? last
          : undefined;

      // Pydantic's own wording ("String should have at least 8 characters")
      // reads like a type error; say it the way the rest of the UI does.
      let message = e.msg;
      if (e.type === "string_too_short" && e.ctx?.min_length != null) {
        message = `Must be at least ${e.ctx.min_length} characters long.`;
      } else if (e.type === "string_too_long" && e.ctx?.max_length != null) {
        message = `Must be at most ${e.ctx.max_length} characters long.`;
      }
      return { field, message };
    });
};

/** Extracts the FastAPI `detail` string from a caught error, or undefined
 * if there isn't one — leaves the fallback message up to the caller so
 * each call site's existing wording is preserved exactly. */
export const getErrorDetail = (err: unknown): string | undefined => {
  const detail = (err as AxiosError<ApiError> | undefined)?.response?.data
    ?.detail;
  return typeof detail === "string" ? detail : undefined;
};

export const handleApiError = (error: unknown, form?: FormInstance) => {
  const axiosError = error as AxiosError<ApiError>;
  logger.error("API Error:", axiosError);

  // 1. กรณีไม่มีการตอบกลับจาก Server (Network Error)
  if (axiosError.code === "ERR_NETWORK") {
    message.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต");
    return;
  }

  // 2. กรณี Server ตอบกลับมา (HTTP Status 4xx, 5xx)
  const status = axiosError.response?.status;
  const data = axiosError.response?.data;

  if (status === 401) {
    message.error("เซสชันหมดอายุ หรือชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง");
    // อาจเพิ่ม logic logout ตรงนี้ได้
  } else if (status === 403) {
    message.error("คุณไม่มีสิทธิ์เข้าถึงส่วนนี้");
  } else if (status === 422) {
    // กรณี Validation Error จาก FastAPI
    message.error("ข้อมูลที่กรอกไม่ถูกต้องตามรูปแบบ");
    if (form && typeof data?.detail === "object") {
       // ถ้าส่ง form มาด้วย จะให้มัน highlight ช่องที่กรอกผิด
       // logic เพิ่มเติมสำหรับแสดง error ราย field
    }
  } else if (data?.detail) {
    // แสดงข้อความ error ที่ส่งมาจาก Backend (FastAPI detail)
    const errorDetail = typeof data.detail === "string" 
      ? data.detail 
      : "เกิดข้อผิดพลาดบางอย่างที่เซิร์ฟเวอร์";
    message.error(errorDetail);
  } else {
    message.error("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่ในภายหลัง");
  }

  // ล้างฟิลด์รหัสผ่านอัตโนมัติ (ถ้ามีการส่ง form เข้ามา)
  if (form) {
    form.resetFields(["password"]);
  }
};
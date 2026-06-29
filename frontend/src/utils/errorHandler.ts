import { message } from "antd";
import type { FormInstance } from "antd";
import { AxiosError } from "axios";
import logger from "./logger";

interface ApiError {
  detail?: string | { msg: string }[];
}

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
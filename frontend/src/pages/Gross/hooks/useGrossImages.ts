import { useState } from "react";
import { App } from "antd";
import dayjs from "dayjs";
import GrossImageService from "../../../services/grossImageService";
import { GrossImage } from "../../../types/image";
import logger from "../../../utils/logger";

export const useGrossImages = (activeCase: unknown) => {
  const [grossImages, setGrossImages] = useState<GrossImage[]>([]);
  const [loading, setLoading] = useState(false); // 🚩 เพิ่ม Loading ใน Hook
  const { message } = App.useApp();

  // ดึงรูปของทุกชิ้นเนื้อ (ย้ายมาจากหน้าหลัก)
  const fetchImagesAllSpecimens = async (specimens: { id: number }[]) => {
    if (!specimens || specimens.length === 0) return;
    setLoading(true);
    try {
      const imagePromises = specimens.map((spec) =>
        GrossImageService.getImagesBySpecimenId(spec.id),
      );
      const results = await Promise.all(imagePromises);
      const combinedImages = results.flat() as GrossImage[];
      setGrossImages(combinedImages);
    } catch (err) {
      logger.error("Fetch images error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCaptureAndUpload = async (
    imageSrc: string,
    specimenId: number | null,
    currentSpecimens: { id: number }[],
  ) => {
    if (!specimenId) {
      message.warning("กรุณาเลือกชิ้นเนื้อก่อนอัปโหลดรูปภาพ");
      return;
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024;

    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();

      if (blob.size > MAX_FILE_SIZE) {
        message.error(
          `ไฟล์ใหญ่เกินไป (${(blob.size / (1024 * 1024)).toFixed(2)} MB). จำกัด 5MB`,
        );
        return;
      }

      const timestamp = dayjs().format("HHmmss_SSS"); // 🚩 ใช้ millisecond กันซ้ำ
      const fileName = `gross_${specimenId}_${timestamp}.jpg`;

      const formData = new FormData();
      formData.append("file", blob, fileName);

      await GrossImageService.uploadImage(specimenId, formData);
      message.success("อัปโหลดรูปภาพสำเร็จ");

      // 🚩 สั่ง Refresh จากใน Hook เลย
      await fetchImagesAllSpecimens(currentSpecimens);
    } catch (err) {
      logger.error(err);
      message.error("อัปโหลดล้มเหลว");
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    try {
      await GrossImageService.deleteImage(imageId);
      setGrossImages((prev) => prev.filter((img) => img.id !== imageId));
      message.success("ลบรูปภาพสำเร็จ");
    } catch (error) {
      message.error("ลบรูปภาพไม่สำเร็จ");
    }
  };

  return {
    grossImages,
    setGrossImages,
    grossLoading: loading, // ส่ง loading ออกไปใช้
    handleCaptureAndUpload,
    handleDeleteImage,
    fetchImagesAllSpecimens,
  };
};

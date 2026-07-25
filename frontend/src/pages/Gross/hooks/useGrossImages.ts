import { useState } from "react";
import { App } from "antd";
import dayjs from "dayjs";
import GrossImageService from "../../../services/grossImageService";
import { GrossImage } from "../../../types/image";
import logger from "../../../utils/logger";
import { oversizeMessage } from "../../../utils/imageUpload";
import { MAX_IMAGE_UPLOAD_BYTES } from "../../../constants/upload.constants";

export const useGrossImages = (activeCase: unknown) => {
  const [grossImages, setGrossImages] = useState<GrossImage[]>([]);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

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
      message.warning("Please select a specimen before uploading an image");
      return;
    }

    try {
      const res = await fetch(imageSrc);
      const blob = await res.blob();

      if (blob.size > MAX_IMAGE_UPLOAD_BYTES) {
        message.error(oversizeMessage(blob.size));
        return;
      }

      const timestamp = dayjs().format("HHmmss_SSS"); // millisecond precision avoids filename collisions
      const fileName = `gross_${specimenId}_${timestamp}.jpg`;

      const formData = new FormData();
      formData.append("file", blob, fileName);

      await GrossImageService.uploadImage(specimenId, formData);
      message.success("Image uploaded successfully");

      await fetchImagesAllSpecimens(currentSpecimens);
    } catch (err) {
      logger.error(err);
      message.error("Upload failed");
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    try {
      await GrossImageService.deleteImage(imageId);
      setGrossImages((prev) => prev.filter((img) => img.id !== imageId));
      message.success("Image deleted successfully");
    } catch (error) {
      message.error("Failed to delete image");
    }
  };

  return {
    grossImages,
    setGrossImages,
    grossLoading: loading,
    handleCaptureAndUpload,
    handleDeleteImage,
    fetchImagesAllSpecimens,
  };
};

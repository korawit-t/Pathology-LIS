import { useCallback, useEffect, useState, type ChangeEvent, type RefObject } from "react";
import { App } from "antd";
import type Webcam from "react-webcam";
import {
  isImageCaptureSupported,
  captureHighResPhoto,
  CAMERA_NOT_FOUND_ERROR,
  HQ_CAPTURE_FALLBACK_WARNING,
} from "../utils/imageCapture";
import { getDataUrlByteSize, oversizeMessage } from "../utils/imageUpload";
import { MAX_IMAGE_UPLOAD_BYTES } from "../constants/upload.constants";

/**
 * Shared capture state machine used by every "take a photo / pick a file"
 * modal (Gross, Microscopic, Gyne cytology, Nongyne cytology). Centralizes
 * HQ-mode support detection, the HQ-vs-screenshot capture path, and the
 * byte-size gate that runs before any dataURL is handed off — so the four
 * call sites don't drift on this logic independently.
 */
export function useImageCapture(
  webcamRef: RefObject<Webcam | null>,
  onCaptured: (dataUrl: string) => void,
  open: boolean,
) {
  const { message } = App.useApp();
  const [hqMode, setHqMode] = useState(false);
  const [hqSupported, setHqSupported] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    setHqSupported(isImageCaptureSupported());
  }, []);

  // The modal component itself doesn't unmount when it closes (only its
  // Modal children do, via destroyOnClose) — so this hook's state survives
  // across opens/closes unless reset explicitly here.
  useEffect(() => {
    if (!open) setHqMode(false);
  }, [open]);

  // Checked immediately after capture/file-select, before any crop/annotate
  // step — avoids wasting editor work on a file that ultimately can't upload.
  const finalizeCapture = useCallback(
    async (dataUrl: string, successMessage?: string) => {
      const bytes = await getDataUrlByteSize(dataUrl);
      if (bytes > MAX_IMAGE_UPLOAD_BYTES) {
        message.error(oversizeMessage(bytes));
        return;
      }
      onCaptured(dataUrl);
      if (successMessage) message.success(successMessage);
    },
    [message, onCaptured],
  );

  const captureViaScreenshot = useCallback(
    (successMessage?: string) => {
      const image = webcamRef.current?.getScreenshot();
      if (image) {
        finalizeCapture(image, successMessage);
      }
    },
    [webcamRef, finalizeCapture],
  );

  const capture = useCallback(
    async (successMessage?: string) => {
      if (hqMode && hqSupported) {
        const track = webcamRef.current?.stream?.getVideoTracks()[0];
        if (!track) {
          message.error(CAMERA_NOT_FOUND_ERROR);
          return;
        }
        setCapturing(true);
        try {
          const blob = await captureHighResPhoto(track);
          const reader = new FileReader();
          reader.onloadend = () => {
            finalizeCapture(reader.result as string, successMessage);
          };
          reader.readAsDataURL(blob);
        } catch {
          message.warning(HQ_CAPTURE_FALLBACK_WARNING);
          captureViaScreenshot(successMessage);
        } finally {
          setCapturing(false);
        }
        return;
      }
      captureViaScreenshot(successMessage);
    },
    [hqMode, hqSupported, webcamRef, message, captureViaScreenshot, finalizeCapture],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, successMessage?: string) => {
      const file = e.target.files?.[0];
      // Reset so re-selecting the same file still fires a change event.
      e.target.value = "";
      if (!file) return;
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        message.error(oversizeMessage(file.size));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        finalizeCapture(reader.result as string, successMessage);
      };
      reader.readAsDataURL(file);
    },
    [message, finalizeCapture],
  );

  return {
    hqMode,
    setHqMode,
    hqSupported,
    capturing,
    capture,
    captureViaScreenshot,
    handleFileChange,
  };
}

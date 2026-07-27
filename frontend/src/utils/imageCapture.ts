export const DEFAULT_VIDEO_CONSTRAINTS = {
  width: 1920,
  height: 1080,
  facingMode: "environment",
} as const;

export const HQ_UNSUPPORTED_TOOLTIP =
  "This browser doesn't support high-quality capture";

export const HQ_CAPTURE_FALLBACK_WARNING =
  "High-quality capture failed, using video frame instead";

export const CAMERA_NOT_FOUND_ERROR = "Camera not found, please try again";

/**
 * Detects support for both the ImageCapture constructor AND takePhoto() —
 * some browsers (e.g. Firefox behind a flag) expose the constructor without
 * a working takePhoto(), so "ImageCapture" in window alone is a false positive.
 */
export function isImageCaptureSupported(): boolean {
  if (typeof window === "undefined") return false;
  const ctor = (window as typeof window & { ImageCapture?: typeof ImageCapture })
    .ImageCapture;
  return typeof ctor?.prototype?.takePhoto === "function";
}

/**
 * Measured against a Sony A7 III via Imaging Edge Webcam: takePhoto() returned
 * a PNG blob at 1121 KB for a 0.59 MP frame. Re-encoding at this JPEG quality
 * dropped it to 244 KB (-78%) with no visible quality loss in that test.
 */
const HQ_CAPTURE_JPEG_QUALITY = 0.92;

/**
 * takePhoto() isn't guaranteed to return a JPEG — some camera drivers hand
 * back PNG instead. Callers name the file .jpg and label it image/jpeg
 * regardless, so an un-converted PNG silently balloons the upload (PNG is
 * far less efficient for photographic content). Re-encodes to JPEG at the
 * source's native pixel size (no resize). Never throws — falls back to the
 * original blob if decoding/encoding fails for any reason.
 */
async function ensureJpegBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/jpeg") return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return blob;
      ctx.drawImage(bitmap, 0, 0);
      const jpegBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", HQ_CAPTURE_JPEG_QUALITY)
      );
      return jpegBlob ?? blob;
    } finally {
      bitmap.close();
    }
  } catch {
    return blob;
  }
}

/**
 * Requests a still photo at the camera's maximum still-image resolution via
 * getPhotoCapabilities(), since takePhoto() with no photoSettings falls back
 * to the device's default photo resolution — which for many UVC webcams is
 * just the current video resolution (no real quality gain over a video-frame
 * screenshot). Falls back to a plain takePhoto() if getPhotoCapabilities()
 * isn't supported by the camera driver.
 */
export async function captureHighResPhoto(track: MediaStreamTrack): Promise<Blob> {
  const imageCapture = new ImageCapture(track);
  let photoBlob: Blob;
  try {
    const caps = await imageCapture.getPhotoCapabilities();
    photoBlob = await imageCapture.takePhoto({
      imageWidth: caps.imageWidth.max,
      imageHeight: caps.imageHeight.max,
    });
  } catch {
    photoBlob = await imageCapture.takePhoto();
  }
  return ensureJpegBlob(photoBlob);
}

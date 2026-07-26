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
 * Requests a still photo at the camera's maximum still-image resolution via
 * getPhotoCapabilities(), since takePhoto() with no photoSettings falls back
 * to the device's default photo resolution — which for many UVC webcams is
 * just the current video resolution (no real quality gain over a video-frame
 * screenshot). Falls back to a plain takePhoto() if getPhotoCapabilities()
 * isn't supported by the camera driver.
 */
export async function captureHighResPhoto(track: MediaStreamTrack): Promise<Blob> {
  const imageCapture = new ImageCapture(track);
  try {
    const caps = await imageCapture.getPhotoCapabilities();
    return await imageCapture.takePhoto({
      imageWidth: caps.imageWidth.max,
      imageHeight: caps.imageHeight.max,
    });
  } catch {
    return imageCapture.takePhoto();
  }
}

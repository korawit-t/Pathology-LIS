// src/declarations.d.ts

declare module '*.module.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.module.scss' {
  const content: { [className: string]: string };
  export default content;
}

// Experimental Web API not yet included in TypeScript's DOM lib.
interface MediaSettingsRange {
  max: number;
  min: number;
  step: number;
}

interface PhotoCapabilities {
  imageWidth: MediaSettingsRange;
  imageHeight: MediaSettingsRange;
}

interface PhotoSettings {
  imageWidth?: number;
  imageHeight?: number;
}

declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  takePhoto(photoSettings?: PhotoSettings): Promise<Blob>;
  getPhotoCapabilities(): Promise<PhotoCapabilities>;
}
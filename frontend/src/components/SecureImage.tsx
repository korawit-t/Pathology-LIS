import React, { useEffect, useRef, useState } from "react";
import { Image, Spin } from "antd";
import type { ImageProps } from "antd";
import api from "../services/httpClient";

const blobCache = new Map<string, string>();

export function useSecureSrc(src: string | undefined): string | undefined {
  const [blobSrc, setBlobSrc] = useState<string | undefined>(() =>
    src ? blobCache.get(src) : undefined
  );
  const srcRef = useRef(src);

  useEffect(() => {
    if (!src) { setBlobSrc(undefined); return; }
    if (blobCache.has(src)) { setBlobSrc(blobCache.get(src)); return; }

    let cancelled = false;
    api.get(src, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data);
        blobCache.set(src, url);
        setBlobSrc(url);
      })
      .catch(() => { if (!cancelled) setBlobSrc(undefined); });

    return () => { cancelled = true; };
  }, [src]);

  return blobSrc;
}

interface SecureImageProps extends Omit<ImageProps, "src"> {
  src: string | undefined;
}

const SecureImage: React.FC<SecureImageProps> = ({ src, preview, ...rest }) => {
  const blobSrc = useSecureSrc(src);
  if (!blobSrc) return <Spin size="small" />;
  // Override preview.src with blob URL so preview modal also uses auth'd image
  const resolvedPreview =
    typeof preview === "object" && preview !== null
      ? { ...preview, src: blobSrc }
      : preview ?? false;
  return <Image src={blobSrc} preview={resolvedPreview} {...rest} />;
};

export default SecureImage;

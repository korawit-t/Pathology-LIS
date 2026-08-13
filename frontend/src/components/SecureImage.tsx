import React, { useEffect, useState } from "react";
import { Image, Spin, Tooltip } from "antd";
import { FileImageOutlined } from "@ant-design/icons";
import type { ImageProps } from "antd";
import api, { API_BASE_URL } from "../services/httpClient";

const blobCache = new Map<string, string>();

/**
 * Call sites build `src` as `${API_BASE_URL}${path}` so the same string stays
 * usable as a plain <img src>. But `api` applies its own `baseURL`, and axios
 * only skips that for URLs with a scheme — so a *relative* base gets applied
 * twice. The on-prem IIS build uses VITE_API_BASE_URL="/api" (README §4D),
 * which turned every secure image into a 404 on `/api/api/storage/...` while
 * the absolute-base LAN builds kept working. Strip the base back off before
 * handing the path to axios.
 */
function toApiPath(src: string): string {
  return API_BASE_URL && src.startsWith(API_BASE_URL)
    ? src.slice(API_BASE_URL.length) || "/"
    : src;
}

export interface SecureSrcState {
  src: string | undefined;
  /** Distinguishes "request failed" from "still loading" — without it a failed
   * fetch is indistinguishable from a pending one and spins forever. */
  failed: boolean;
}

export function useSecureSrcState(src: string | undefined): SecureSrcState {
  const [blobSrc, setBlobSrc] = useState<string | undefined>(() =>
    src ? blobCache.get(src) : undefined
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) { setBlobSrc(undefined); setFailed(false); return; }
    if (blobCache.has(src)) { setBlobSrc(blobCache.get(src)); setFailed(false); return; }

    let cancelled = false;
    setFailed(false);
    api.get(toApiPath(src), { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        const url = URL.createObjectURL(res.data);
        blobCache.set(src, url);
        setBlobSrc(url);
      })
      .catch(() => { if (!cancelled) { setBlobSrc(undefined); setFailed(true); } });

    return () => { cancelled = true; };
  }, [src]);

  return { src: blobSrc, failed };
}

export function useSecureSrc(src: string | undefined): string | undefined {
  return useSecureSrcState(src).src;
}

interface SecureImageProps extends Omit<ImageProps, "src"> {
  src: string | undefined;
}

const SecureImage: React.FC<SecureImageProps> = ({ src, preview, ...rest }) => {
  const { src: blobSrc, failed } = useSecureSrcState(src);
  if (failed) {
    return (
      <Tooltip title="Image failed to load">
        <div
          style={{
            width: rest.width,
            height: rest.height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fafafa",
            border: "1px dashed #d9d9d9",
            borderRadius: 4,
            color: "#bfbfbf",
          }}
        >
          <FileImageOutlined style={{ fontSize: 20 }} />
        </div>
      </Tooltip>
    );
  }
  if (!blobSrc) return <Spin size="small" />;
  // Override preview.src with blob URL so preview modal also uses auth'd image
  const resolvedPreview =
    typeof preview === "object" && preview !== null
      ? { ...preview, src: blobSrc }
      : preview ?? false;
  return <Image src={blobSrc} preview={resolvedPreview} {...rest} />;
};

export default SecureImage;

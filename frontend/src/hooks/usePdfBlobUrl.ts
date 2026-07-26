import { useEffect, useRef, useState } from "react";

interface UsePdfBlobUrlOptions {
  debounceMs?: number;
  onError?: (err: unknown) => void;
}

/**
 * Fetches a PDF as a blob and exposes it as an object URL (e.g. for an
 * <iframe> preview), revoking the previous URL whenever the fetch is
 * re-triggered or the component unmounts. Pass `null` for `fetchFn` to
 * clear the URL without fetching (e.g. while a preview panel is closed).
 */
export function usePdfBlobUrl(
  fetchFn: (() => Promise<Blob>) | null,
  { debounceMs, onError }: UsePdfBlobUrlOptions = {},
) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (fetchFn) {
      const run = () => {
        setLoading(true);
        fetchFn()
          .then((blob) => {
            if (cancelled) return;
            activeUrl = URL.createObjectURL(blob);
            setUrl(activeUrl);
          })
          .catch((err) => {
            if (!cancelled) onErrorRef.current?.(err);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      };
      if (debounceMs) {
        timeoutId = setTimeout(run, debounceMs);
      } else {
        run();
      }
    } else {
      setUrl(null);
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFn, debounceMs]);

  return { url, loading };
}

/**
 * Opens a freshly fetched PDF blob in a new browser window/tab. Opens the
 * window synchronously before the fetch so Safari doesn't block it as a
 * popup, then revokes the object URL after `revokeAfterMs`.
 */
export async function openPdfBlobInNewWindow(
  fetchFn: () => Promise<Blob>,
  revokeAfterMs = 30_000,
): Promise<void> {
  const newWindow = window.open("", "_blank");
  try {
    const blob = await fetchFn();
    const url = URL.createObjectURL(blob);
    if (newWindow) {
      newWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
    } else {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    newWindow?.close();
    throw err;
  }
}

import { useMemo } from "react";
import { usePdfBlobUrl } from "./usePdfBlobUrl";
import { generateStickerPdfBlob } from "../utils/stickerLabel";
import type { StickerLabelFields, StickerLabelStyle } from "../utils/stickerLabel";
import logger from "../utils/logger";

/** Generates and exposes a specimen-sticker PDF's object URL, built on the
 * already-correct usePdfBlobUrl (revokes the URL it actually created, tied
 * to the real fetch lifecycle) instead of each modal hand-rolling its own
 * useEffect+cleanup — which is what caused a shared blob-URL leak across
 * all 4 print-preview modals this hook replaces: their cleanup closed over
 * `pdfUrl` from the render that last re-ran the effect, not from when the
 * async PDF blob callback actually set it, so the URL was effectively
 * never revoked.
 *
 * `fields` must be memoized by the caller on the actual data reference
 * (not rebuilt as a fresh object every render), or the sticker regenerates
 * on every unrelated re-render. */
export function useStickerPdf(
  open: boolean,
  fields: StickerLabelFields | null,
  style: StickerLabelStyle,
  errorLabel: string,
) {
  const fetchFn = useMemo(
    () => (open && fields ? () => generateStickerPdfBlob(fields, style) : null),
    [open, fields, style],
  );
  const { url: pdfUrl, loading } = usePdfBlobUrl(fetchFn, {
    onError: (err) => logger.error(errorLabel, err),
  });
  return { pdfUrl, loading };
}

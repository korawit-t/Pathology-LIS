/** Shared prop shape for the specimen-sticker print-preview modals
 * (Surgical/Gyne/Nongyne/Molecular). Unlike CaseFormModalProps<T>, all 4
 * case types genuinely share this exact {open; onCancel; data} contract
 * — including Molecular, whose data is MolecularStickerData (its own
 * deliberately-decoupled minimal shape; see MolecularPrintPreviewModal.tsx)
 * passed as T like any other caller. */
export interface PrintPreviewModalProps<T> {
  open: boolean;
  onCancel: () => void;
  data: T | null;
}

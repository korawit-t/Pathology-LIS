/** Shared prop shape for the case-registration form modals (Surgical/Gyne/
 * Nongyne). Molecular is excluded — its onSuccess takes no payload and it
 * has no onRefresh. */
export interface CaseFormModalProps<T> {
  open: boolean;
  editingId: number | null;
  onCancel: () => void;
  onSuccess: (savedData: T | null) => void;
  onRefresh?: () => void;
}

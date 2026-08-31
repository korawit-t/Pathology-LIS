import { useCallback, useState } from "react";
import { App } from "antd";
import { useSecureSrc } from "../components/SecureImage";
import { getDataUrlByteSize, oversizeMessage } from "../utils/imageUpload";
import { MAX_IMAGE_UPLOAD_BYTES } from "../constants/upload.constants";
import { getErrorDetail } from "../utils/errorHandler";

interface UseImageEditSessionOptions {
  /**
   * Full API URL of an already-uploaded image, or undefined when the modal is
   * capturing a new one. Fetched through the authed blob path so the editor
   * gets a same-origin src it can safely export from a canvas.
   */
  imageUrl?: string;
  /** Uploads the re-rendered bytes, replacing the stored file. */
  onReplace: (blob: Blob) => Promise<unknown>;
  /** Runs after a successful replace — typically the caller's list refresh. */
  onReplaced?: () => void;
}

/**
 * Shared "re-edit an image that is already uploaded" flow used by all four
 * capture modals (Gross, Microscopic, Gyne cytology, Nongyne cytology).
 * Centralizes fetching the stored bytes, the byte-size gate, and the replace
 * call so the four call sites don't drift on it independently — the same
 * reason useImageCapture exists for the capture side.
 */
export function useImageEditSession({
  imageUrl,
  onReplace,
  onReplaced,
}: UseImageEditSessionOptions) {
  const { message } = App.useApp();
  const originalSrc = useSecureSrc(imageUrl);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEditing = useCallback(() => {
    if (!originalSrc) {
      message.error("ยังโหลดรูปไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่");
      return;
    }
    setEditing(true);
  }, [originalSrc, message]);

  const cancelEditing = useCallback(() => setEditing(false), []);

  const saveEdited = useCallback(
    async (editedSrc: string) => {
      const bytes = await getDataUrlByteSize(editedSrc);
      if (bytes > MAX_IMAGE_UPLOAD_BYTES) {
        message.error(oversizeMessage(bytes));
        return;
      }
      setSaving(true);
      try {
        const blob = await (await fetch(editedSrc)).blob();
        await onReplace(blob);
        setEditing(false);
        message.success("Image updated.");
        onReplaced?.();
      } catch (err) {
        // Surfaces the backend's own reason — notably the 423 raised when the
        // case has been signed out or published since this tab loaded it.
        message.error(getErrorDetail(err) ?? "Failed to save the edited image.");
      } finally {
        setSaving(false);
      }
    },
    [message, onReplace, onReplaced],
  );

  return {
    /** Blob URL of the stored image, once loaded. */
    originalSrc,
    /** True while the ImageEditor is open over the stored image. */
    editing,
    saving,
    canEdit: !!originalSrc,
    startEditing,
    cancelEditing,
    saveEdited,
  };
}

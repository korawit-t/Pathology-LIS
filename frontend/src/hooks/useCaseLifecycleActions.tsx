import { Modal, Input, message } from "antd";
import { CloseCircleOutlined } from "@ant-design/icons";

/** Copy that genuinely differs per case type — preserved verbatim per
 * caller rather than picked one way, since e.g. Surgical's ISO 15189
 * wording is a deliberate compliance detail, not an oversight to
 * "fix" into consistency. */
export interface CaseCancelCopy {
  title: string;
  prompt: string;
  placeholder: string;
}

interface ErrorWithDetail {
  response?: { data?: { detail?: string } };
}

/** Delete Case / Cancel Case, shared by the case-registration form modals.
 * Both operations share the modal's single `loading` flag (also driving the
 * Save button's spinner in all 3 callers today) — accepts the existing
 * setLoading rather than owning separate state, so that behavior carries
 * over unchanged. */
export function useCaseLifecycleActions(
  editingId: number | null,
  deleteFn: (id: number) => Promise<void>,
  cancelFn: (id: number, reason: string) => Promise<unknown>,
  cancelCopy: CaseCancelCopy,
  onSuccess: (savedData: null) => void,
  setLoading: (loading: boolean) => void,
) {
  const handleDelete = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      await deleteFn(editingId);
      message.success("Case deleted successfully");
      onSuccess(null);
    } catch {
      message.error("Failed to delete case");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    let cancelReason = "";

    Modal.confirm({
      title: cancelCopy.title,
      icon: <CloseCircleOutlined style={{ color: "#ff4d4f" }} />,
      content: (
        <div style={{ marginTop: 16 }}>
          <p>{cancelCopy.prompt}</p>
          <Input.TextArea
            rows={3}
            placeholder={cancelCopy.placeholder}
            onChange={(e) => (cancelReason = e.target.value)}
          />
        </div>
      ),
      okText: "Confirm Cancel",
      okType: "danger",
      cancelText: "Close",
      onOk: async () => {
        if (!cancelReason.trim()) {
          message.warning("Please provide a reason before cancelling");
          return Promise.reject();
        }

        try {
          setLoading(true);
          await cancelFn(editingId!, cancelReason);
          message.success("Case cancelled successfully");
          onSuccess(null);
        } catch (error) {
          const errorMsg =
            (error as ErrorWithDetail)?.response?.data?.detail ||
            "Failed to cancel case";
          message.error(errorMsg);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return { handleDelete, handleCancel };
}

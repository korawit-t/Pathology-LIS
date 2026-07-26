import { useState } from "react";
import type { UploadFile, UploadProps } from "antd";
import { Modal, Upload, message } from "antd";
import { DownloadOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import type { RequestFile } from "../types/surgical";

/** Structural shape every *CaseService already exports for request-file
 * handling (surgicalCaseService.ts, gyneCytoCaseService.ts,
 * nongyneCytoCaseService.ts all match this exactly) — pass the service
 * object straight through, no adapter needed. */
export interface CaseFileService {
  uploadRequestFile(caseId: number, file: File): Promise<{ message: string; file_id: number }>;
  deleteRequestFile(fileId: number): Promise<void>;
  downloadRequestFile(fileId: number, fileName: string): Promise<void>;
  downloadRequestFileBlob(fileId: number): Promise<ArrayBuffer>;
}

/** The request-documents upload slice shared by the case-registration form
 * modals (Surgical/Gyne/Nongyne): file list state, the antd Upload wiring
 * (including the pre-save "queue locally" path for new cases), download,
 * and delete. `flushPendingUploads` is the fix for a real bug — Gyne/Nongyne
 * never called the equivalent of this after creating a new case, silently
 * discarding any file attached before Save despite the UI promising
 * otherwise; wired up where each modal creates a case (see the commit that
 * calls this). */
export function useCaseFileUpload(service: CaseFileService, editingId: number | null) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadRequest = async (options: {
    file: File;
    onSuccess: (res: string) => void;
    onError: (err: { err: unknown }) => void;
  }) => {
    const { file, onSuccess, onError } = options;
    if (!editingId) {
      message.warning("Please save the case before uploading files");
      onError({ err: new Error("Case not created yet") });
      return;
    }
    try {
      setIsUploading(true);
      const res = await service.uploadRequestFile(editingId, file);
      const newFile: UploadFile = {
        uid: String(res.file_id),
        name: file.name,
        status: "done",
        type: file.type,
      };
      setFileList((prev) => [...prev, newFile]);
      onSuccess("ok");
      message.success(`${file.name} uploaded successfully`);
    } catch (err) {
      onError({ err });
      message.error(`Failed to upload ${file.name}`);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadProps: UploadProps = {
    customRequest: handleUploadRequest as unknown as UploadProps["customRequest"],
    onRemove: () => false,
    fileList,
    accept: ".pdf,.jpg,.jpeg,.png",
    showUploadList: false,
    beforeUpload: (file) => {
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error("File must be smaller than 10MB");
        return Upload.LIST_IGNORE;
      }
      if (!editingId) {
        // Queue locally — will upload after case is created
        setFileList((prev) => [
          ...prev,
          {
            uid: `pending-${crypto.randomUUID()}`,
            name: file.name,
            status: "done",
            type: file.type,
            originFileObj: file as unknown as NonNullable<UploadFile["originFileObj"]>,
          },
        ]);
        return Upload.LIST_IGNORE;
      }
      return true;
    },
  };

  const handleConfirmDownload = (file: UploadFile) => {
    Modal.confirm({
      title: "Download File",
      icon: <DownloadOutlined style={{ color: "#1890ff" }} />,
      content: `Download "${file.name}"?`,
      okText: "Download",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await service.downloadRequestFile(Number(file.uid), file.name);
          message.success("File downloaded successfully");
        } catch {
          message.error("Failed to download file");
        }
      },
    });
  };

  const handleConfirmDeleteFile = (file: UploadFile) => {
    if (file.uid.startsWith("rc-upload") || file.uid.startsWith("pending-")) {
      setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
      return;
    }
    Modal.confirm({
      title: "Delete File",
      icon: <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />,
      content: `Delete "${file.name}"? This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await service.deleteRequestFile(Number(file.uid));
          message.success("File deleted");
          setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
        } catch {
          message.error("Failed to delete file");
        }
      },
    });
  };

  /** Upload any locally-queued (pre-save) files now that a case id exists.
   * Per-file failures are caught individually and warn, rather than
   * rejecting the whole batch — matches how case creation itself must not
   * be blocked by a request-file upload failing. */
  const flushPendingUploads = async (caseId: number) => {
    const pendingFiles = fileList.filter((f) => f.originFileObj);
    if (pendingFiles.length === 0) return;
    await Promise.allSettled(
      pendingFiles.map((pf) =>
        service
          .uploadRequestFile(caseId, pf.originFileObj as unknown as File)
          .catch(() => {
            message.warning(`Failed to upload "${pf.name}". Please retry in edit mode.`);
          }),
      ),
    );
  };

  /** Maps the backend's RequestFile[] (loadEditingData's shape) to antd's
   * UploadFile[]. Includes `url` (Surgical's superset shape) — inert for
   * callers whose RequestDocumentsUpload never reads it. */
  const toUploadFileList = (files: RequestFile[] | undefined): UploadFile[] =>
    (files || []).map((file) => ({
      uid: String(file.id),
      name: file.file_name,
      status: "done",
      url: file.file_path,
      type: file.file_type,
    }));

  return {
    fileList,
    setFileList,
    isUploading,
    uploadProps,
    handleConfirmDownload,
    handleConfirmDeleteFile,
    flushPendingUploads,
    toUploadFileList,
  };
}

import React from "react";
import { Form, Upload, Button, Tooltip, Space } from "antd";
import {
  UploadOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  EyeOutlined,
  DownloadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { UploadFile, UploadProps } from "antd";

export interface RequestDocumentsUploadProps {
  uploadProps: UploadProps;
  fileList: UploadFile[];
  isUploading: boolean;
  editingId: number | null;
  onPreview: (file: UploadFile) => void;
  onDownload: (file: UploadFile) => void;
  onDelete: (file: UploadFile) => void;
}

const RequestDocumentsUpload: React.FC<RequestDocumentsUploadProps> = ({
  uploadProps,
  fileList,
  isUploading,
  editingId,
  onPreview,
  onDownload,
  onDelete,
}) => {
  return (
    <Form.Item
      label="Upload Request Form (PDF, JPG, PNG - Max 10MB)"
      extra={!editingId ? "Files will be uploaded automatically after the case is saved" : undefined}
    >
      <Upload {...uploadProps}>
        <Button icon={<UploadOutlined />} loading={isUploading}>
          Select Files
        </Button>
      </Upload>
      {fileList.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {fileList.map((file) => {
            const isPdf = file.name?.toLowerCase().endsWith(".pdf");
            return (
              <div
                key={file.uid}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 12px", marginBottom: 4,
                  border: "1px solid #f0f0f0", borderRadius: 6, background: "#fafafa",
                }}
              >
                <Space>
                  {isPdf
                    ? <FilePdfOutlined style={{ fontSize: 16, color: "#ff4d4f" }} />
                    : <FileImageOutlined style={{ fontSize: 16, color: "#1890ff" }} />}
                  <span style={{ fontSize: 13 }}>{file.name}</span>
                </Space>
                <Space size={4}>
                  <Tooltip title="Preview">
                    <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => onPreview(file)} />
                  </Tooltip>
                  {!file.originFileObj && (
                    <Tooltip title="Download">
                      <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => onDownload(file)} />
                    </Tooltip>
                  )}
                  <Tooltip title="Delete">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(file)} />
                  </Tooltip>
                </Space>
              </div>
            );
          })}
        </div>
      )}
    </Form.Item>
  );
};

export default RequestDocumentsUpload;

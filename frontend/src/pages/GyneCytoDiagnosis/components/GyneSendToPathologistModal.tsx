import React from "react";
import { Modal, Select } from "antd";
import type { User } from "../../../types/user";

interface GyneSendToPathologistModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLoading: boolean;
  pathologists: User[];
  selectedPathoId: number | null;
  onSelectPatho: (id: number) => void;
}

const GyneSendToPathologistModal: React.FC<GyneSendToPathologistModalProps> = ({
  open,
  onCancel,
  onConfirm,
  confirmLoading,
  pathologists,
  selectedPathoId,
  onSelectPatho,
}) => (
  <Modal
    title="Send to Pathologist"
    open={open}
    onCancel={onCancel}
    onOk={onConfirm}
    okText="Confirm & Send"
    okButtonProps={{ style: { background: "#fa8c16", border: "none" } }}
    confirmLoading={confirmLoading}
  >
    <p style={{ marginBottom: 16, color: "#595959" }}>
      This case is flagged as <b style={{ color: "#fa8c16" }}>abnormal</b>. Select a pathologist to
      assign for review.
    </p>
    <Select
      showSearch
      placeholder="Select pathologist"
      style={{ width: "100%" }}
      value={selectedPathoId}
      onChange={(val) => onSelectPatho(val)}
      options={pathologists
        .filter((p) => p.roles?.some((r) => r === "pathologist" || r === "senior_pathologist"))
        .map((p) => ({
          value: p.id,
          label: p.full_name ?? `User #${p.id}`,
        }))}
    />
  </Modal>
);

export default GyneSendToPathologistModal;

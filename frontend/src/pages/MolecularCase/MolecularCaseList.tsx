import React, { useCallback, useEffect, useState } from "react";
import { Space, Button, message, Select, Input } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";

import PageContainer from "../../components/Layout/PageContainer";
import MolecularCaseFormModal from "./MolecularCaseFormModal";
import MolecularCaseTable from "./MolecularCaseTable";
import MolecularPrintPreviewModal from "./MolecularPrintPreviewModal";
import { MolecularCaseService, MolecularCaseResponse } from "../../services/molecularCaseService";

interface MolecularCaseListProps {
  onSelectCase: (caseId: number) => void;
}

const MolecularCaseList: React.FC<MolecularCaseListProps> = ({ onSelectCase }) => {
  const [cases, setCases] = useState<MolecularCaseResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [formState, setFormState] = useState<{ open: boolean; editingId: number | null }>({ open: false, editingId: null });
  const [printModal, setPrintModal] = useState<{ open: boolean; data: MolecularCaseResponse | null }>({ open: false, data: null });

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      setCases(await MolecularCaseService.getAll({ status: statusFilter, search: search || undefined, limit: 200 }));
    } catch {
      message.error("Failed to load Molecular cases");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  return (
    <PageContainer
      withCard
      title="Molecular Pathology"
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder="Search Accession No., HN, or Patient name"
            style={{ width: 280 }}
            onSearch={setSearch}
          />
          <Select
            allowClear
            placeholder="All statuses"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "pending", label: "Pending" },
              { value: "reported", label: "Reported" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchCases} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true, editingId: null })}>
            New Molecular
          </Button>
        </Space>
      }
    >
      <MolecularCaseFormModal
        open={formState.open}
        editingId={formState.editingId}
        onCancel={() => setFormState({ open: false, editingId: null })}
        onSuccess={() => {
          setFormState({ open: false, editingId: null });
          fetchCases();
        }}
      />

      <MolecularCaseTable
        dataSource={cases}
        loading={loading}
        onSelectCase={onSelectCase}
        onEditCase={(id) => setFormState({ open: true, editingId: id })}
        onPrintCase={(record) => setPrintModal({ open: true, data: record })}
      />

      <MolecularPrintPreviewModal
        open={printModal.open}
        data={printModal.data}
        onCancel={() => setPrintModal({ open: false, data: null })}
      />
    </PageContainer>
  );
};

export default MolecularCaseList;

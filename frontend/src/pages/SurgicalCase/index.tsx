import React, { useState, useMemo, useEffect } from "react";
import { Input, Button, Space, Typography, Row, Col, Statistic } from "antd";
import { PlusOutlined, FireFilled, ReloadOutlined } from "@ant-design/icons";
import SurgicalTable from "./components/SurgicalTable";
import SurgicalCaseFormModal from "./components/SurgicalCaseFormModal";
import PrintPreviewModal from "./components/PrintPreviewModal";
import { useSurgicalData } from "./hooks/useSurgicalData";
import { SurgicalCase } from "../../types/surgical";
import PageContainer from "../../components/Layout/PageContainer";
import HospitalService from "../../services/hospitalService";
import MedicalSchemeService from "../../services/medicalSchemeService";

const { Text } = Typography;

const SurgicalCaseManager: React.FC = () => {
  const {
    cases,
    total,
    currentPage,
    setCurrentPage,
    departments,
    loading,
    setSearchText,
    searchText,
    setStatusFilter,
    setHospitalFilter,
    setSchemeFilter,
    reload,
  } = useSurgicalData();

  const [modalState, setModalState] = useState<{ open: boolean; id: number | null }>({
    open: false,
    id: null,
  });
  const [printModal, setPrintModal] = useState<{ open: boolean; data: SurgicalCase | null }>({
    open: false,
    data: null,
  });
  const [hospitals, setHospitals] = useState<{ id: number; name: string }[]>([]);
  const [schemes, setSchemes] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    HospitalService.getHospitals().then(setHospitals);
    MedicalSchemeService.getSchemes().then(setSchemes);
  }, []);

  const urgentCount = useMemo(() => cases.filter((c) => c.is_express).length, [cases]);

  const handleFormSuccess = (savedData: SurgicalCase | null) => {
    reload();
    setModalState({ open: false, id: null });
    if (!savedData?.id) return;
    setPrintModal({ open: true, data: savedData });
  };

  const handleFilterChange = (hospitalId: number | null, schemeId: number | null, statusList: string[]) => {
    setHospitalFilter(hospitalId ?? undefined);
    setSchemeFilter(schemeId ?? undefined);
    setStatusFilter(statusList.length ? statusList[0] : undefined);
    setCurrentPage(1);
  };

  return (
    <PageContainer withCard title="Surgical Pathology Accessioning">
      {/* Action row */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }} wrap={false}>
        <Col flex="auto">
          <Space size={8}>
            <Input.Search
              placeholder="Search accession, patient, HN..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={(val) => { setSearchText(val); setCurrentPage(1); }}
              style={{ width: 300 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={reload} loading={loading} />
          </Space>
        </Col>
        <Col>
          <Space size={24} align="center">
            {urgentCount > 0 && (
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 12 }}>Urgent</Text>}
                value={urgentCount}
                formatter={(v) => <span style={{ fontSize: 20, fontWeight: 700, color: "#ff4d4f" }}>{v}</span>}
                prefix={<FireFilled style={{ fontSize: 14, color: "#ff4d4f" }} />}
              />
            )}
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Total Cases</Text>}
              value={total}
              formatter={(v) => <span style={{ fontSize: 20, fontWeight: 700, color: "#1890ff" }}>{v}</span>}
            />
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setModalState({ open: true, id: null })}
            >
              New Case
            </Button>
          </Space>
        </Col>
      </Row>

      <SurgicalTable
        dataSource={cases}
        departments={departments}
        total={total}
        current={currentPage}
        loading={loading}
        onChangePage={(page) => setCurrentPage(page)}
        onEdit={(record: SurgicalCase) => setModalState({ open: true, id: record.id })}
        hospitals={hospitals}
        schemes={schemes}
        onFilterChange={handleFilterChange}
      />

      <SurgicalCaseFormModal
        open={modalState.open}
        editingId={modalState.id}
        onCancel={() => { setModalState({ open: false, id: null }); reload(); }}
        onSuccess={handleFormSuccess}
        onRefresh={reload}
      />
      <PrintPreviewModal
        open={printModal.open}
        surgicalCase={printModal.data}
        onCancel={() => setPrintModal({ open: false, data: null })}
      />
    </PageContainer>
  );
};

export default SurgicalCaseManager;

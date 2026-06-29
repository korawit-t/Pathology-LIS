import React, { useState, useEffect } from "react";
import { Input, Button, Space, Typography, Row, Col, Statistic } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import NongyneTable from "./components/NongyneTable";
import NongyneCaseFormModal from "./components/NongyneCaseFormModal";
import NongynePrintPreviewModal from "./components/NongynePrintPreviewModal";
import { useNongyneData } from "./hooks/useNongyneData";
import { NongyneCytologyCase } from "../../types/nongyne";
import type { SystemSetting } from "../../types/system";
import PageContainer from "../../components/Layout/PageContainer";
import HospitalService from "../../services/hospitalService";
import MedicalSchemeService from "../../services/medicalSchemeService";
import SystemSettingService from "../../services/systemSettingService";
import HolidayService from "../../services/holidayService";

const { Text } = Typography;

const NongyneCaseManager: React.FC = () => {
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
  } = useNongyneData();

  const [modalState, setModalState] = useState<{ open: boolean; id: number | null }>({
    open: false,
    id: null,
  });
  const [printModal, setPrintModal] = useState<{ open: boolean; data: NongyneCytologyCase | null }>({
    open: false,
    data: null,
  });
  const [hospitals, setHospitals] = useState<{ id: number; name: string }[]>([]);
  const [schemes, setSchemes] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<SystemSetting | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);

  useEffect(() => {
    HospitalService.getHospitals().then(setHospitals);
    MedicalSchemeService.getSchemes().then(setSchemes);
    SystemSettingService.getPublicSettings().then(setSettings).catch(() => {});
    HolidayService.getHolidayDateList().then(setHolidays).catch(() => {});
  }, []);

  const handleFormSuccess = (savedData: NongyneCytologyCase | null) => {
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
    <PageContainer withCard title="Non-Gyne Cytology Accessioning">
      {/* Action row */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }} wrap={false}>
        <Col flex="auto">
          <Space size={8}>
            <Input.Search
              placeholder="Search cases..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={(val) => { setSearchText(val); setCurrentPage(1); }}
              allowClear
              style={{ width: 300 }}
            />
            <Button icon={<ReloadOutlined />} onClick={reload} loading={loading} />
          </Space>
        </Col>
        <Col>
          <Space size={24} align="center">
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

      <NongyneTable
        dataSource={cases}
        departments={departments}
        total={total}
        current={currentPage}
        loading={loading}
        onChangePage={(page) => setCurrentPage(page)}
        onEdit={(record: NongyneCytologyCase) => setModalState({ open: true, id: record.id })}
        hospitals={hospitals}
        schemes={schemes}
        onFilterChange={handleFilterChange}
        settings={settings}
        holidays={holidays}
      />

      <NongyneCaseFormModal
        open={modalState.open}
        editingId={modalState.id}
        onCancel={() => { setModalState({ open: false, id: null }); reload(); }}
        onSuccess={handleFormSuccess}
        onRefresh={reload}
      />
      <NongynePrintPreviewModal
        open={printModal.open}
        data={printModal.data}
        onCancel={() => setPrintModal({ open: false, data: null })}
      />
    </PageContainer>
  );
};

export default NongyneCaseManager;

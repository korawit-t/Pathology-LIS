import React, { useState, useEffect } from "react";
import { Input, Button, Space, Typography, Row, Col, Statistic } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import PageContainer from "../../components/Layout/PageContainer";

import GyneCytoTable from "./components/GyneCytoTable";
import GyneCytoFormModal from "./components/GyneCytoFormModal";
import GynePrintPreviewModal from "./components/GynePrintPreviewModal";

import { useGyneCytoData } from "./hooks/useGyneCytoData";
import { GyneCytologyCase } from "../../types/gyne-cytology";
import type { SystemSetting } from "../../types/system";
import HospitalService from "../../services/hospitalService";
import SystemSettingService from "../../services/systemSettingService";
import HolidayService from "../../services/holidayService";

const { Text } = Typography;

const GyneCytologyManager: React.FC = () => {
  const {
    cases,
    total,
    currentPage,
    setCurrentPage,
    loading,
    setSearchText,
    searchText,
    setStatusFilter,
    setHospitalFilter,
    reload,
  } = useGyneCytoData();

  const [modalState, setModalState] = useState<{ open: boolean; id: number | null }>({
    open: false,
    id: null,
  });
  const [printModal, setPrintModal] = useState<{ open: boolean; data: GyneCytologyCase | null }>({
    open: false,
    data: null,
  });
  const [hospitals, setHospitals] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<SystemSetting | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);

  useEffect(() => {
    HospitalService.getHospitals().then(setHospitals);
    SystemSettingService.getPublicSettings().then(setSettings).catch(() => {});
    HolidayService.getHolidayDateList().then(setHolidays).catch(() => {});
  }, []);

  const handleFormSuccess = (savedData: GyneCytologyCase | null) => {
    reload();
    setModalState({ open: false, id: null });
    if (savedData?.id) setPrintModal({ open: true, data: savedData });
  };

  const handleFilterChange = (hospitalId: number | null, _schemeId: number | null, statusList: string[]) => {
    setHospitalFilter(hospitalId ?? undefined);
    setStatusFilter(statusList.length ? statusList[0] : undefined);
    setCurrentPage(1);
  };

  return (
    <PageContainer withCard title="Gyne Cytology Accessioning">
      {/* Action row */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }} wrap={false}>
        <Col flex="auto">
          <Space size={8}>
            <Input.Search
              placeholder="Search HN or Accession No..."
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
              Register Case
            </Button>
          </Space>
        </Col>
      </Row>

      <GyneCytoTable
        dataSource={cases}
        total={total}
        current={currentPage}
        loading={loading}
        onChangePage={(page) => setCurrentPage(page)}
        onEdit={(record: GyneCytologyCase) => setModalState({ open: true, id: record.id })}
        hospitals={hospitals}
        onFilterChange={handleFilterChange}
        settings={settings}
        holidays={holidays}
      />

      <GyneCytoFormModal
        open={modalState.open}
        editingId={modalState.id}
        onCancel={() => { setModalState({ open: false, id: null }); reload(); }}
        onSuccess={handleFormSuccess}
        onRefresh={reload}
      />
      <GynePrintPreviewModal
        open={printModal.open}
        data={printModal.data}
        onCancel={() => setPrintModal({ open: false, data: null })}
      />
    </PageContainer>
  );
};

export default GyneCytologyManager;

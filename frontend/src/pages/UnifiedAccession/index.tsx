import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button, Tabs, Space, message, Badge, Input } from "antd";
import {
  ScissorOutlined,
  MedicineBoxOutlined,
  UserOutlined,
  InboxOutlined,
  QuestionCircleOutlined,
  GlobalOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Typography } from "antd";
import dayjs from "dayjs";
import PageContainer from "../../components/Layout/PageContainer";
import ReportPreviewModal from "../../components/ReportPreviewModal";
import { useSurgicalData } from "../SurgicalCase/hooks/useSurgicalData";
import { useGyneCytoData } from "../GyneCytologyCase/hooks/useGyneCytoData";
import { useNongyneData } from "../NongyneCase/hooks/useNongyneData";
import SurgicalTable from "../SurgicalCase/components/SurgicalTable";
import GyneCytoTable from "../GyneCytologyCase/components/GyneCytoTable";
import NongyneTable from "../NongyneCase/components/NongyneTable";
import SurgicalCaseFormModal from "../SurgicalCase/components/SurgicalCaseFormModal";
import GyneCytoFormModal from "../GyneCytologyCase/components/GyneCytoFormModal";
import NongyneCaseFormModal from "../NongyneCase/components/NongyneCaseFormModal";
import PrintPreviewModal from "../SurgicalCase/components/PrintPreviewModal";
import GynePrintPreviewModal from "../GyneCytologyCase/components/GynePrintPreviewModal";
import NongynePrintPreviewModal from "../NongyneCase/components/NongynePrintPreviewModal";
import HospitalService from "../../services/hospitalService";
import MedicalSchemeService from "../../services/medicalSchemeService";
import SurgicalReportService from "../../services/surgicalReportService";
import SurgicalCaseService from "../../services/surgicalCaseService";
import SurgicalBlockStainService from "../../services/surgicalBlockStainService";
import BlockStorageService from "../../services/blockStorageService";
import { IHCService } from "../../services/ihcService";
import OutlabConsultRunService from "../../services/outlabConsultRunService";
import type { OutlabConsultRunResponse } from "../../services/outlabConsultRunService";
import GyneDiagnosisService from "../../services/gyneDiagnosisService";
import NongyneReportService from "../../services/nongyneReportService";
import { IHCMarkerWithResult } from "../../services/ihcService";
import { SurgicalCase } from "../../types/surgical";
import { GyneCytologyCase } from "../../types/gyne-cytology";
import { NongyneCytologyCase } from "../../types/nongyne";
import type { SystemSetting } from "../../types/system";
import SystemSettingService from "../../services/systemSettingService";
import HolidayService from "../../services/holidayService";
import GyneCytoCaseService from "../../services/gyneCytoCaseService";
import NongyneCytoCaseService from "../../services/nongyneCytoCaseService";

import { buildUnifiedRows } from "./buildUnifiedRows";
import { UnifiedRow, OutlabStainRun } from "./types";
import AllTabContent from "./AllTabContent";
import OutlabTabContent from "./OutlabTabContent";
import DetailModal from "./DetailModal";
import GuideModal from "./GuideModal";

const DEFAULT_DATE_FROM = dayjs().subtract(1, "month").format("YYYY-MM-DD");
const DEFAULT_DATE_TO = dayjs().format("YYYY-MM-DD");

const UnifiedAccession: React.FC = () => {
  // ---- Data hooks ----
  const {
    cases: surgCases, total: surgTotal, currentPage: surgPage,
    setCurrentPage: setSurgPage, departments: surgDepts, loading: surgLoading,
    setSearchText: setSurgSearch, setStatusFilter: setSurgStatus,
    setHospitalFilter: setSurgHosp, setSchemeFilter: setSurgScheme,
    setDateFrom: setSurgDateFrom, setDateTo: setSurgDateTo, reload: reloadSurg,
  } = useSurgicalData();

  const {
    cases: gyneCases, total: gyneTotal, currentPage: gynePage,
    setCurrentPage: setGynePage, loading: gyneLoading,
    setSearchText: setGyneSearch, setStatusFilter: setGyneStatus,
    setHospitalFilter: setGyneHosp, setSchemeFilter: setGyneScheme,
    setDateFrom: setGyneDateFrom, setDateTo: setGyneDateTo, reload: reloadGyne,
  } = useGyneCytoData();

  const {
    cases: ngCases, total: ngTotal, currentPage: ngPage,
    setCurrentPage: setNgPage, departments: ngDepts, loading: ngLoading,
    setSearchText: setNgSearch, setStatusFilter: setNgStatus,
    setHospitalFilter: setNgHosp, setSchemeFilter: setNgScheme,
    setDateFrom: setNgDateFrom, setDateTo: setNgDateTo, reload: reloadNg,
  } = useNongyneData();

  // ---- Lookups ----
  const [hospitals, setHospitals] = useState<{ id: number; name: string }[]>([]);
  const [schemes, setSchemes] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<SystemSetting | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);

  // ---- IHC pending detection ----
  const [ihcAccessions, setIhcAccessions] = useState<Set<string>>(new Set());
  const [ihcOrderedAccessions, setIhcOrderedAccessions] = useState<Set<string>>(new Set());

  useEffect(() => {
    SurgicalBlockStainService.getAllStains({ category: "IHC" })
      .then((stains) => {
        setIhcOrderedAccessions(new Set(stains.filter((s) => s.accession_no).map((s) => s.accession_no!)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ihcOrderedAccessions.size || !surgCases.length) return;
    const specimensByAccession: Record<string, number[]> = {};
    for (const c of surgCases) {
      if (ihcOrderedAccessions.has(c.accession_no)) {
        specimensByAccession[c.accession_no] = (c.specimens ?? []).map((s) => s.id);
      }
    }
    const allSpecimenIds = Object.values(specimensByAccession).flat();
    if (!allSpecimenIds.length) return;
    Promise.all(allSpecimenIds.map((id) => IHCService.getPanel(id).catch(() => []))).then((panels) => {
      const specimenPanels: Record<number, typeof panels[0]> = {};
      allSpecimenIds.forEach((id, i) => { specimenPanels[id] = panels[i]; });
      const pendingSet = new Set<string>();
      for (const [accNo, specIds] of Object.entries(specimensByAccession)) {
        const allInterpreted = specIds.every((id) => {
          const panel = specimenPanels[id] ?? [];
          return panel.length > 0 && panel.every((item: IHCMarkerWithResult) => item.result?.selected_option != null);
        });
        if (!allInterpreted) pendingSet.add(accNo);
      }
      setIhcAccessions(pendingSet);
    });
  }, [ihcOrderedAccessions, surgCases]);

  useEffect(() => {
    HospitalService.getHospitals().then(setHospitals);
    MedicalSchemeService.getSchemes().then(setSchemes);
    Promise.all([SystemSettingService.getSettings(), HolidayService.getHolidayDateList()])
      .then(([s, h]) => { setSettings(s); setHolidays(h); });
  }, []);

  // Default date range on mount
  useEffect(() => {
    setSurgDateFrom(DEFAULT_DATE_FROM); setSurgDateTo(DEFAULT_DATE_TO);
    setGyneDateFrom(DEFAULT_DATE_FROM); setGyneDateTo(DEFAULT_DATE_TO);
    setNgDateFrom(DEFAULT_DATE_FROM); setNgDateTo(DEFAULT_DATE_TO);
  }, []);

  // ---- Search (All tab) ----
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const q = searchText.trim();
    setSurgSearch(q); setGyneSearch(q); setNgSearch(q);
    if (q) {
      setSurgDateFrom(undefined); setSurgDateTo(undefined);
      setGyneDateFrom(undefined); setGyneDateTo(undefined);
      setNgDateFrom(undefined); setNgDateTo(undefined);
    } else {
      setSurgDateFrom(DEFAULT_DATE_FROM); setSurgDateTo(DEFAULT_DATE_TO);
      setGyneDateFrom(DEFAULT_DATE_FROM); setGyneDateTo(DEFAULT_DATE_TO);
      setNgDateFrom(DEFAULT_DATE_FROM); setNgDateTo(DEFAULT_DATE_TO);
    }
  }, [searchText]);

  // ---- Search (per-tab) ----
  const [surgTabSearch, setSurgTabSearch] = useState("");
  const [gyneTabSearch, setGyneTabSearch] = useState("");
  const [ngTabSearch, setNgTabSearch] = useState("");

  useEffect(() => {
    const q = surgTabSearch.trim();
    setSurgSearch(q);
    setSurgDateFrom(q ? undefined : DEFAULT_DATE_FROM);
    setSurgDateTo(q ? undefined : DEFAULT_DATE_TO);
    setSurgPage(1);
  }, [surgTabSearch]);

  useEffect(() => {
    const q = gyneTabSearch.trim();
    setGyneSearch(q);
    setGyneDateFrom(q ? undefined : DEFAULT_DATE_FROM);
    setGyneDateTo(q ? undefined : DEFAULT_DATE_TO);
    setGynePage(1);
  }, [gyneTabSearch]);

  useEffect(() => {
    const q = ngTabSearch.trim();
    setNgSearch(q);
    setNgDateFrom(q ? undefined : DEFAULT_DATE_FROM);
    setNgDateTo(q ? undefined : DEFAULT_DATE_TO);
    setNgPage(1);
  }, [ngTabSearch]);

  // ---- Registration modals ----
  const [surgModal, setSurgModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [surgPrint, setSurgPrint] = useState<{ open: boolean; data: SurgicalCase | null }>({ open: false, data: null });
  const [gyneModal, setGyneModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [gynePrint, setGynePrint] = useState<{ open: boolean; data: GyneCytologyCase | null }>({ open: false, data: null });
  const [ngModal, setNgModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [ngPrint, setNgPrint] = useState<{ open: boolean; data: NongyneCytologyCase | null }>({ open: false, data: null });

  // ---- PDF preview ----
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [loadingPdfKey, setLoadingPdfKey] = useState<string | null>(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const openReportPdf = useCallback(async (
    type: "surgical" | "gyne" | "nongyne", reportId: number, pdfKey: string,
  ) => {
    try {
      setLoadingPdfKey(pdfKey);
      let blob: Blob;
      if (type === "surgical") blob = await SurgicalReportService.getReportPdf(reportId);
      else if (type === "gyne") blob = await GyneDiagnosisService.getReportPdf(reportId);
      else blob = await NongyneReportService.getReportPdf(reportId);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
      setIsPreviewOpen(true);
    } catch {
      message.error("ไม่สามารถโหลดรายงานได้");
    } finally {
      setLoadingPdfKey(null);
    }
  }, [pdfUrl]);

  // ---- Print sticker ----
  const [printLoadingKey, setPrintLoadingKey] = useState<string | null>(null);

  const openPrintFromRow = useCallback(async (row: UnifiedRow) => {
    const key = `${row.type}-${row.id}`;
    setPrintLoadingKey(key);
    try {
      if (row.type === "surgical") {
        const data = await SurgicalCaseService.getCaseById(row.id);
        setSurgPrint({ open: true, data });
      } else if (row.type === "gyne") {
        const data = await GyneCytoCaseService.getById(row.id);
        setGynePrint({ open: true, data });
      } else {
        const data = await NongyneCytoCaseService.getById(row.id);
        setNgPrint({ open: true, data });
      }
    } catch {
      message.error("Cannot load case for printing");
    } finally {
      setPrintLoadingKey(null);
    }
  }, []);

  const openPrintFromSurgical = useCallback(async (record: SurgicalCase) => {
    await openPrintFromRow({ type: "surgical", id: record.id } as UnifiedRow);
  }, [openPrintFromRow]);

  const openPrintFromGyne = useCallback(async (record: GyneCytologyCase) => {
    await openPrintFromRow({ type: "gyne", id: record.id } as UnifiedRow);
  }, [openPrintFromRow]);

  const openPrintFromNg = useCallback(async (record: NongyneCytologyCase) => {
    await openPrintFromRow({ type: "nongyne", id: record.id } as UnifiedRow);
  }, [openPrintFromRow]);

  // ---- Detail modal ----
  const [detailModal, setDetailModal] = useState<{ open: boolean; row: UnifiedRow | null }>({ open: false, row: null });
  const [modalReports, setModalReports] = useState<{ id: number; status: string; published_at?: string | null }[]>([]);
  const [modalReportsLoading, setModalReportsLoading] = useState(false);
  const [modalCaseData, setModalCaseData] = useState<SurgicalCase | null>(null);
  const [modalCaseLoading, setModalCaseLoading] = useState(false);
  const [modalOutlabRuns, setModalOutlabRuns] = useState<OutlabStainRun[]>([]);
  const [modalOutlabLoading, setModalOutlabLoading] = useState(false);
  const [modalConsultRuns, setModalConsultRuns] = useState<OutlabConsultRunResponse[]>([]);
  const [modalConsultLoading, setModalConsultLoading] = useState(false);
  const [blockLocationMap, setBlockLocationMap] = useState<Record<number, string>>({});

  const closeDetailModal = useCallback(() => {
    setDetailModal({ open: false, row: null });
    setModalReports([]); setModalCaseData(null);
    setModalOutlabRuns([]); setModalConsultRuns([]);
  }, []);

  const openDetailModal = useCallback(async (row: UnifiedRow) => {
    setDetailModal({ open: true, row });
    setModalReports([]); setModalCaseData(null);
    setModalOutlabRuns([]); setModalConsultRuns([]);

    setModalReportsLoading(true);
    try {
      let reports: { id: number; status: string; published_at?: string | null }[];
      if (row.type === "surgical") {
        const result = await SurgicalReportService.getReportHistory(row.id);
        reports = result.items ?? [];
      } else if (row.type === "gyne") {
        reports = await GyneDiagnosisService.getReportsByCase(row.id) as never;
      } else {
        reports = await NongyneReportService.getReportsByCase(row.id) as never;
      }
      setModalReports(reports ?? []);
    } catch {
      message.error("ไม่สามารถโหลดรายการรายงานได้");
    } finally {
      setModalReportsLoading(false);
    }

    setModalConsultLoading(true);
    OutlabConsultRunService.getRuns({ limit: 500 })
      .then((runs) => {
        setModalConsultRuns(runs.filter((r) => r.details.some((d) => d.case_id === row.id && d.case_type === row.type)));
      })
      .catch(() => {})
      .finally(() => setModalConsultLoading(false));

    if (row.type === "surgical") {
      setModalCaseLoading(true);
      setModalOutlabLoading(true);
      try {
        const [caseData, allRuns] = await Promise.all([
          SurgicalCaseService.getCaseById(row.id),
          SurgicalBlockStainService.getOutlabRuns({ limit: 500 }).catch(() => [] as OutlabStainRun[]),
        ]);
        setModalCaseData(caseData);
        BlockStorageService.searchByAccession(row.accession_no)
          .then((runs) => {
            const map: Record<number, string> = {};
            for (const run of runs) {
              for (const detail of run.details ?? []) {
                if (detail.block_id && detail.storage_location) map[detail.block_id] = detail.storage_location;
              }
            }
            setBlockLocationMap(map);
          })
          .catch(() => {});
        setModalOutlabRuns(
          (allRuns as OutlabStainRun[]).filter((run) =>
            (run.details ?? []).some((d) => d.accession_no === row.accession_no),
          ),
        );
      } catch {
      } finally {
        setModalCaseLoading(false);
        setModalOutlabLoading(false);
      }
    }
  }, []);

  // ---- Edit modal ----
  const openEditModal = useCallback((row: UnifiedRow) => {
    if (row.type === "surgical") setSurgModal({ open: true, id: row.id });
    else if (row.type === "gyne") setGyneModal({ open: true, id: row.id });
    else setNgModal({ open: true, id: row.id });
  }, []);

  // ---- Out Lab tab ----
  const [activeTab, setActiveTab] = useState("all");
  const [outlabRuns, setOutlabRuns] = useState<OutlabConsultRunResponse[]>([]);
  const [outlabLoading, setOutlabLoading] = useState(false);
  const [outlabSearch, setOutlabSearch] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const loadOutlabRuns = useCallback(async () => {
    setOutlabLoading(true);
    try {
      setOutlabRuns(await OutlabConsultRunService.getRuns({ limit: 500 }));
    } catch {
      message.error("ไม่สามารถโหลด Out Lab ได้");
    } finally {
      setOutlabLoading(false);
    }
  }, []);

  const handleReceiveConsultRun = useCallback(async (runId: number) => {
    try {
      await OutlabConsultRunService.receiveRun(runId);
      message.success("บันทึกการรับรายงานกลับสำเร็จ");
      loadOutlabRuns();
    } catch {
      message.error("ไม่สามารถบันทึกการรับกลับได้");
    }
  }, [loadOutlabRuns]);

  useEffect(() => { if (activeTab === "outlab") loadOutlabRuns(); }, [activeTab, loadOutlabRuns]);

  const outlabFilteredRuns = useMemo(() => {
    const q = outlabSearch.trim().toLowerCase();
    if (!q) return outlabRuns;
    return outlabRuns.filter((r) =>
      (r.run_no || "").toLowerCase().includes(q) ||
      (r.destination_lab || "").toLowerCase().includes(q) ||
      r.details.some((d) =>
        (d.accession_no || "").toLowerCase().includes(q) ||
        (d.patient_name || "").toLowerCase().includes(q),
      ),
    );
  }, [outlabRuns, outlabSearch]);

  const outlabPendingCount = useMemo(
    () => outlabRuns.filter((r) => r.status !== "completed").length,
    [outlabRuns],
  );

  // ---- Filter handlers ----
  const handleSurgFilter = (hospitalId: number | null, schemeId: number | null, statusList: string[]) => {
    setSurgHosp(hospitalId ?? undefined);
    setSurgScheme(schemeId ?? undefined);
    setSurgStatus(statusList.length ? statusList[0] : undefined);
    setSurgPage(1);
  };

  const handleGyneFilter = (hospitalId: number | null, schemeId: number | null, statusList: string[]) => {
    setGyneHosp(hospitalId ?? undefined);
    setGyneScheme(schemeId ?? undefined);
    setGyneStatus(statusList.length ? statusList[0] : undefined);
    setGynePage(1);
  };

  const handleNgFilter = (hospitalId: number | null, schemeId: number | null, statusList: string[]) => {
    setNgHosp(hospitalId ?? undefined);
    setNgScheme(schemeId ?? undefined);
    setNgStatus(statusList.length ? statusList[0] : undefined);
    setNgPage(1);
  };

  // ---- Unified rows ----
  const allRows = useMemo(
    () => buildUnifiedRows(surgCases, gyneCases, ngCases, ihcAccessions),
    [surgCases, gyneCases, ngCases, ihcAccessions],
  );

  // ---- Header ----
  const headerExtra = (
    <Space size={8}>
      <Button icon={<QuestionCircleOutlined />} onClick={() => setGuideOpen(true)}>
        คู่มือการใช้งาน
      </Button>
      <Button type="primary" icon={<ScissorOutlined />} onClick={() => setSurgModal({ open: true, id: null })}>
        New Surgical
      </Button>
      <Button
        icon={<MedicineBoxOutlined />}
        style={{ background: "#52c41a", borderColor: "#389e0d", color: "#fff" }}
        onClick={() => setGyneModal({ open: true, id: null })}
      >
        New Gyne
      </Button>
      <Button
        icon={<UserOutlined />}
        style={{ background: "#fa8c16", borderColor: "#d46b08", color: "#fff" }}
        onClick={() => setNgModal({ open: true, id: null })}
      >
        New Non-Gyne
      </Button>
    </Space>
  );

  const pageTabs = [
    {
      key: "all",
      label: <span style={{ fontSize: 15, paddingRight: 4 }}>All</span>,
      children: (
        <AllTabContent
          rows={allRows}
          loading={surgLoading || gyneLoading || ngLoading}
          searchText={searchText}
          onSearchChange={setSearchText}
          onRowClick={openDetailModal}
          onEdit={openEditModal}
          onPrint={openPrintFromRow}
          printLoadingKey={printLoadingKey}
          settings={settings}
          holidays={holidays}
        />
      ),
    },
    {
      key: "surgical",
      label: <span style={{ fontSize: 15, paddingRight: 4 }}>Surgical</span>,
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Input
              prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
              placeholder="Search by Accession No., HN, or Patient name"
              allowClear
              value={surgTabSearch}
              onChange={(e) => setSurgTabSearch(e.target.value)}
              style={{ width: 360 }}
            />
          </Space>
          <SurgicalTable
            dataSource={surgCases}
            departments={surgDepts}
            total={surgTotal}
            current={surgPage}
            loading={surgLoading}
            onChangePage={(p) => setSurgPage(p)}
            onEdit={(r) => setSurgModal({ open: true, id: r.id })}
            onPrint={openPrintFromSurgical}
            onViewPdf={(id) => openReportPdf("surgical", id, `s-direct-${id}`)}
            hospitals={hospitals}
            schemes={schemes}
            onFilterChange={handleSurgFilter}
          />
        </>
      ),
    },
    {
      key: "gyne",
      label: <span style={{ fontSize: 15, paddingRight: 4 }}>Gyne Cytology</span>,
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Input
              prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
              placeholder="Search by Accession No., HN, or Patient name"
              allowClear
              value={gyneTabSearch}
              onChange={(e) => setGyneTabSearch(e.target.value)}
              style={{ width: 360 }}
            />
          </Space>
          <GyneCytoTable
            dataSource={gyneCases}
            total={gyneTotal}
            current={gynePage}
            loading={gyneLoading}
            onChangePage={(p) => setGynePage(p)}
            onEdit={(r) => setGyneModal({ open: true, id: r.id })}
            onPrint={openPrintFromGyne}
            onViewPdf={(id) => openReportPdf("gyne", id, `g-direct-${id}`)}
            hospitals={hospitals}
            departments={surgDepts}
            schemes={schemes}
            onFilterChange={handleGyneFilter}
          />
        </>
      ),
    },
    {
      key: "nongyne",
      label: <span style={{ fontSize: 15, paddingRight: 4 }}>Non-Gyne Cytology</span>,
      children: (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Input
              prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
              placeholder="Search by Accession No., HN, or Patient name"
              allowClear
              value={ngTabSearch}
              onChange={(e) => setNgTabSearch(e.target.value)}
              style={{ width: 360 }}
            />
          </Space>
          <NongyneTable
            dataSource={ngCases}
            departments={ngDepts}
            total={ngTotal}
            current={ngPage}
            loading={ngLoading}
            onChangePage={(p) => setNgPage(p)}
            onEdit={(r) => setNgModal({ open: true, id: r.id })}
            onPrint={openPrintFromNg}
            onViewPdf={(id) => openReportPdf("nongyne", id, `n-direct-${id}`)}
            hospitals={hospitals}
            schemes={schemes}
            onFilterChange={handleNgFilter}
          />
        </>
      ),
    },
    {
      key: "outlab",
      label: (
        <Space size={6} style={{ fontSize: 15 }}>
          <GlobalOutlined />
          <span>Out Lab</span>
          {outlabPendingCount > 0 && <Badge count={outlabPendingCount} size="small" />}
        </Space>
      ),
      children: (
        <OutlabTabContent
          runs={outlabFilteredRuns}
          loading={outlabLoading}
          searchText={outlabSearch}
          onSearchChange={setOutlabSearch}
          onRefresh={loadOutlabRuns}
          onReceive={handleReceiveConsultRun}
          pendingCount={outlabPendingCount}
        />
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Typography.Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <InboxOutlined style={{ marginRight: 12, color: "#595959" }} />
          Accession
        </Typography.Title>
      }
      extra={headerExtra}
      cardProps={{ bodyStyle: { paddingTop: 8 } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={pageTabs}
        type="line"
        size="large"
        tabBarStyle={{ marginBottom: 24 }}
      />

      <DetailModal
        open={detailModal.open}
        row={detailModal.row}
        onCancel={closeDetailModal}
        reports={modalReports}
        reportsLoading={modalReportsLoading}
        loadingPdfKey={loadingPdfKey}
        onViewPdf={openReportPdf}
        caseData={modalCaseData}
        caseLoading={modalCaseLoading}
        blockLocationMap={blockLocationMap}
        outlabRuns={modalOutlabRuns}
        outlabLoading={modalOutlabLoading}
        consultRuns={modalConsultRuns}
        consultLoading={modalConsultLoading}
      />

      <ReportPreviewModal
        open={isPreviewOpen}
        pdfUrl={pdfUrl}
        onCancel={() => setIsPreviewOpen(false)}
      />

      <SurgicalCaseFormModal
        open={surgModal.open}
        editingId={surgModal.id}
        onCancel={() => { setSurgModal({ open: false, id: null }); reloadSurg(); }}
        onSuccess={(savedData) => {
          reloadSurg();
          setSurgModal({ open: false, id: null });
          if (savedData?.id) setSurgPrint({ open: true, data: savedData });
        }}
        onRefresh={reloadSurg}
      />
      <PrintPreviewModal
        open={surgPrint.open}
        surgicalCase={surgPrint.data}
        onCancel={() => setSurgPrint({ open: false, data: null })}
      />

      <GyneCytoFormModal
        open={gyneModal.open}
        editingId={gyneModal.id}
        onCancel={() => { setGyneModal({ open: false, id: null }); reloadGyne(); }}
        onSuccess={(savedData) => {
          reloadGyne();
          setGyneModal({ open: false, id: null });
          if (savedData?.id) setGynePrint({ open: true, data: savedData });
        }}
        onRefresh={reloadGyne}
      />
      <GynePrintPreviewModal
        open={gynePrint.open}
        data={gynePrint.data}
        onCancel={() => setGynePrint({ open: false, data: null })}
      />

      <NongyneCaseFormModal
        open={ngModal.open}
        editingId={ngModal.id}
        onCancel={() => { setNgModal({ open: false, id: null }); reloadNg(); }}
        onSuccess={(savedData) => {
          reloadNg();
          setNgModal({ open: false, id: null });
          if (savedData?.id) setNgPrint({ open: true, data: savedData });
        }}
        onRefresh={reloadNg}
      />
      <NongynePrintPreviewModal
        open={ngPrint.open}
        data={ngPrint.data}
        onCancel={() => setNgPrint({ open: false, data: null })}
      />

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </PageContainer>
  );
};

export default UnifiedAccession;

import React, { useEffect, useState } from "react";
import {
  App,
  Badge,
  Button,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { CheckOutlined, FileTextOutlined, PlusSquareOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/th";

import GrossExaminationService from "../../services/grossExaminationService";
import SurgicalSpecimenService from "../../services/surgicalSpecimenService";
import { CASE_STATUS } from "../../constants/lab.constants";
import type { SurgicalCase, SurgicalSpecimen } from "../../types/surgical";
import GrossListTable from "./components/GrossListTable";
import PageContainer from "../../components/Layout/PageContainer";
import logger from "../../utils/logger";

const { Title, Text } = Typography;

interface Props {
  hospitals: { id: number; name: string }[];
  onEditClick: (record: SurgicalCase) => void;
  refreshToken: number;
}

const GrossListView: React.FC<Props> = ({ hospitals, onEditClick, refreshToken }) => {
  const { message } = App.useApp();
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterHospitalId, setFilterHospitalId] = useState<number | null>(null);
  const [worklistTab, setWorklistTab] = useState<"registered" | "in_progress" | "all">("registered");
  const [activeTab, setActiveTab] = useState("worklist");
  const [registeredCount, setRegisteredCount] = useState<number | null>(null);
  const [inProgressCount, setInProgressCount] = useState<number | null>(null);

  const [addlSpecimens, setAddlSpecimens] = useState<SurgicalSpecimen[]>([]);
  const [addlLoading, setAddlLoading] = useState(false);

  const fetchData = async (
    page: number = 1,
    search: string = searchText,
    status: string[] = filterStatus,
    hospitalId: number | null = filterHospitalId,
    tab: "registered" | "in_progress" | "all" = worklistTab,
  ) => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const effectiveStatus =
        tab === "registered" ? [CASE_STATUS.REGISTERED] :
        tab === "in_progress" ? [CASE_STATUS.GROSS_IN_PROGRESS] :
        (status.length ? status : undefined);
      const specimensData = await GrossExaminationService.getCases(
        skip,
        pageSize,
        search,
        effectiveStatus,
        hospitalId ?? undefined,
      );
      setCases(specimensData.items || []);
      setTotal(specimensData.total || 0);
    } catch (err) {
      logger.error("Fetch Error:", err);
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const fetchWorklistCounts = async () => {
    try {
      const [regData, inProgData] = await Promise.all([
        GrossExaminationService.getCases(0, 1, "", [CASE_STATUS.REGISTERED]),
        GrossExaminationService.getCases(0, 1, "", [CASE_STATUS.GROSS_IN_PROGRESS]),
      ]);
      setRegisteredCount(regData.total);
      setInProgressCount(inProgData.total);
    } catch {
      /* ignore */
    }
  };

  const fetchAdditionalSections = async () => {
    setAddlLoading(true);
    try {
      const data = await SurgicalSpecimenService.getSpecimensNeedingAdditionalSections();
      setAddlSpecimens(data);
    } catch {
      /* ignore */
    } finally {
      setAddlLoading(false);
    }
  };

  const handleMarkDone = async (specimen: SurgicalSpecimen) => {
    try {
      await SurgicalSpecimenService.clearAdditionalSections(specimen.id);
      message.success(`Marked done: ${specimen.specimen_label} — ${specimen.specimen_name}`);
      fetchAdditionalSections();
    } catch {
      message.error("Failed to mark done");
    }
  };

  useEffect(() => {
    fetchWorklistCounts();
  }, []);

  useEffect(() => {
    fetchData(currentPage, searchText, filterStatus, filterHospitalId, worklistTab);
  }, [currentPage, worklistTab]);

  // Refresh list when a case is saved from edit view
  useEffect(() => {
    if (refreshToken > 0) {
      fetchData(currentPage);
      fetchWorklistCounts();
    }
  }, [refreshToken]);

  const handleWorklistTabChange = (tab: string) => {
    const newTab = tab as "registered" | "in_progress" | "all";
    setWorklistTab(newTab);
    setCurrentPage(1);
    setFilterStatus([]);
  };

  const handleFilterChange = (hospitalId: number | null, statusList: string[]) => {
    setFilterHospitalId(hospitalId);
    setFilterStatus(statusList);
    setCurrentPage(1);
    fetchData(1, searchText, statusList, hospitalId, worklistTab);
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    setCurrentPage(1);
    fetchData(1, value, filterStatus, filterHospitalId);
  };

  const addlColumns = [
    {
      title: "Accession No.",
      key: "accession",
      width: 130,
      render: (_: unknown, s: SurgicalSpecimen) => (
        <Text strong style={{ color: "#1890ff" }}>
          {s.case?.accession_no || "—"}
        </Text>
      ),
    },
    {
      title: "Specimen",
      key: "specimen",
      width: 280,
      render: (_: unknown, s: SurgicalSpecimen) => (
        <Space size={4}>
          <Tag color="blue">{s.specimen_label}</Tag>
          <Text>{s.specimen_name}</Text>
        </Space>
      ),
    },
    {
      title: "Note",
      dataIndex: "additional_sections_note",
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "Ordered By",
      key: "ordered_by",
      width: 120,
      render: (_: unknown, s: SurgicalSpecimen) =>
        s.additional_sections_ordered_by?.report_name ||
        s.additional_sections_ordered_by?.full_name || "—",
    },
    {
      title: "Ordered At",
      key: "ordered_at",
      width: 110,
      render: (_: unknown, s: SurgicalSpecimen) =>
        s.additional_sections_ordered_at
          ? dayjs(s.additional_sections_ordered_at).format("DD/MM/YY HH:mm")
          : "—",
    },
    {
      title: "",
      key: "action",
      width: 110,
      render: (_: unknown, s: SurgicalSpecimen) => (
        <Popconfirm
          title="Mark as done?"
          description="This will clear the additional sections request."
          okText="Done"
          cancelText="Cancel"
          onConfirm={() => handleMarkDone(s)}
        >
          <Tooltip title="Mark as done">
            <Button size="small" icon={<CheckOutlined />} type="primary">
              Mark Done
            </Button>
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0 }}>
          <FileTextOutlined style={{ marginRight: 8, color: "#595959" }} />
          Gross Examination
        </Title>
      }
      cardProps={{ bodyStyle: { paddingTop: 8 } }}
    >
      <Tabs
        type="line"
        size="large"
        tabBarStyle={{ marginBottom: 16 }}
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          if (key === "additional-sections") fetchAdditionalSections();
        }}
        tabBarExtraContent={
          activeTab === "worklist" ? (
            <Input.Search
              placeholder="Search accession, HN, patient..."
              allowClear
              enterButton
              onSearch={handleSearch}
              style={{ width: 280 }}
            />
          ) : undefined
        }
        items={[
          {
            key: "worklist",
            label: <span style={{ fontSize: 15, paddingRight: 4 }}>Gross Worklist</span>,
            children: (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Segmented
                    options={[
                      {
                        label: (
                          <Space size={6}>
                            Registered
                            {registeredCount != null && registeredCount > 0 && (
                              <Badge count={registeredCount} style={{ backgroundColor: "#8c8c8c" }} />
                            )}
                          </Space>
                        ),
                        value: "registered",
                      },
                      {
                        label: (
                          <Space size={6}>
                            In Progress
                            {inProgressCount != null && inProgressCount > 0 && (
                              <Badge count={inProgressCount} style={{ backgroundColor: "#722ed1" }} />
                            )}
                          </Space>
                        ),
                        value: "in_progress",
                      },
                      { label: "All", value: "all" },
                    ]}
                    value={worklistTab}
                    onChange={handleWorklistTabChange}
                  />
                </div>
                <GrossListTable
                  cases={cases}
                  loading={loading}
                  onEditClick={onEditClick}
                  total={total}
                  current={currentPage}
                  onChangePage={(page) => setCurrentPage(page)}
                  hospitals={hospitals}
                  onFilterChange={handleFilterChange}
                />
              </>
            ),
          },
          {
            key: "additional-sections",
            label: (
              <Space size={6} style={{ fontSize: 15 }}>
                <PlusSquareOutlined />
                Additional Sections
                {addlSpecimens.length > 0 && (
                  <Badge count={addlSpecimens.length} style={{ backgroundColor: "#faad14" }} />
                )}
              </Space>
            ),
            children: (
              <Table
                dataSource={addlSpecimens}
                columns={addlColumns}
                rowKey="id"
                loading={addlLoading}
                size="middle"
                pagination={{ pageSize: 20, showSizeChanger: false }}
                locale={{ emptyText: "No additional sections requested" }}
              />
            ),
          },
        ]}
      />
    </PageContainer>
  );
};

export default GrossListView;

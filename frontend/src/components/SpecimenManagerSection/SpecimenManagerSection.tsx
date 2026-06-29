import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Input,
  Space,
  Card,
  Tag,
  Typography,
  Popconfirm,
  App,
  Divider,
  Tooltip,
  Popover,
  Select,
  Modal,
  List,
  AutoComplete,
} from "antd";
import {
  DeleteOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  EditOutlined,
} from "@ant-design/icons";
import SpecimenTestInline from "./SpecimenTestInline";
import SurgicalSpecimenService from "../../services/surgicalSpecimenService";
import StyledCard from "../Layout/StyledCard";
import SpecimenTemplateService, {
  SpecimenTemplate,
} from "../../services/specimenTemplateService";
import { useSpecimenManager } from "./useSpecimenManager";
import { useTheme } from "../../contexts/ThemeContext";

const { Text, Title } = Typography;
const { Option } = Select;

export interface Specimen {
  id?: number;
  specimen_label: string;
  specimen_name: string;
}

interface Props {
  activeCaseId: number | undefined;
  specimens: Specimen[];
  isExtendedFix?: boolean;
  onSpecimensChange?: (updatedList: Specimen[]) => void;
  onSelect?: (specimen: Specimen) => void;
  activeSpecimenId?: number;
  isLocked?: boolean;
  canAddDelete?: boolean;
  showSpecimenName?: boolean;
  showSpecimenCategory?: boolean;
}

const SpecimenManagerSection: React.FC<Props> = ({
  activeCaseId,
  specimens,
  isExtendedFix,
  onSpecimensChange,
  onSelect,
  activeSpecimenId,
  isLocked = false,
  canAddDelete = false,
  showSpecimenName,
  showSpecimenCategory = true,
}) => {
  const {
    newName,
    setNewName,
    isModalOpen,
    setIsModalOpen,
    customSpecimens,
    newCustomName,
    setNewCustomName,
    handleAddCustom,
    handleEditCustom,
    handleRemoveCustom,
    handleAdd,
    handleDelete,
    handleUpdateName,
    displayNextLabel,
  } = useSpecimenManager(activeCaseId, specimens, onSpecimensChange);
  const { isDarkMode } = useTheme();
  const openManagementModal = () => setIsModalOpen(true);
  const closeManagementModal = () => setIsModalOpen(false);

  const specimenHeaderPreview = (
    <div
      style={{
        padding: "4px",
        width: "300px",
        maxHeight: "450px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          marginTop: 0,
          padding: "16px",
          background: "#ffffff",
          border: "1px solid #d9d9d9",
          borderRadius: "4px",
          fontFamily: "'Times New Roman', serif",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        {specimens.length === 0 ? (
          <Text italic type="secondary">
            No specimens added yet.
          </Text>
        ) : (
          [...specimens].sort((a, b) => a.specimen_label.localeCompare(b.specimen_label, undefined, { numeric: true, sensitivity: "base" })).map((spec, index) => (
            <div
              key={spec.id || index}
              style={{ marginBottom: index === specimens.length - 1 ? 0 : 16 }}
            >
              {/* ส่วนหัวข้อ SPECIMEN X */}
              <div
                style={{
                  marginBottom: 4,
                  paddingBottom: 1,
                }}
              >
                <Text strong style={{ fontSize: "14px", color: "#000" }}>
                  {spec.specimen_label}: {spec.specimen_name}
                </Text>
              </div>

              {/* จำลองเนื้อหาวินิจฉัย (Dummy Text) */}
              <div style={{ marginTop: 6, opacity: 0.4 }}>
                <div
                  style={{
                    width: "100%",
                    height: "6px",
                    background: "#f0f0f0",
                    marginBottom: "3px",
                  }}
                ></div>
                <div
                  style={{ width: "60%", height: "6px", background: "#f0f0f0" }}
                ></div>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: "8px",
          alignItems: "flex-start",
        }}
      >
        <CheckCircleOutlined style={{ color: "#52c41a", marginTop: "2px" }} />
        <Text type="secondary" style={{ fontSize: "11px" }}>
          The PDF report will be generated sequentially from{" "}
          {specimens.length > 0
            ? `Specimen ${specimens[0].specimen_label} to ${specimens[specimens.length - 1].specimen_label}`
            : "A to Z"}
        </Text>
      </div>
    </div>
  );

  const columns = [
    {
      title: "Label",
      dataIndex: "specimen_label",
      key: "specimen_label",
      width: "60px",
      align: "center" as const,
      render: (text: string) => (
        <Tag color="blue" style={{ fontSize: "16px", fontWeight: "bold" }}>
          {text}
        </Tag>
      ),
    },
    {
      title: (
        <Space size={4}>
          {showSpecimenName
            ? "Specimen Name, Site, Procedure"
            : "Specimen Name"}
          {/* 🚩 แสดง Popover เฉพาะกรณี showSpecimenName เป็น true เท่านั้น */}
          {showSpecimenName && (
            <Popover
              content={specimenHeaderPreview}
              title={"REPORT STRUCTURE PREVIEW:"}
              placement="top"
              trigger="hover"
            >
              <InfoCircleOutlined
                style={{
                  color: "#1890ff",
                  fontSize: "12px",
                  cursor: "help",
                }}
              />
            </Popover>
          )}
        </Space>
      ),

      dataIndex: "specimen_name",
      key: "specimen_name",
      width: "450px",
      render: (text: string, record: Specimen) => (
        <Text
          strong
          editable={
            !isLocked
              ? {
                  onChange: (val) =>
                    record.id && handleUpdateName(record.id, val),
                  tooltip: "คลิกเพื่อแก้ไขชื่อชิ้นเนื้อ",
                }
              : false
          }
        >
          {text}
        </Text>
      ),
    },
    ...(showSpecimenCategory
      ? [
          {
            title: "Specimen Category",
            key: "ap_tests",
            width: "400px",
            render: (_: unknown, record: Specimen) =>
              record.id ? (
                <SpecimenTestInline specimenId={record.id} disabled={isLocked} />
              ) : (
                <Text type="secondary" italic>
                  กำลังเตรียมข้อมูล...
                </Text>
              ),
          },
        ]
      : []),
    // 🚩 คอลัมน์ Action จะแสดงผลตามเงื่อนไข canAddDelete
    ...(canAddDelete
      ? [
          {
            title: "Action",
            key: "action",
            width: "60px",
            align: "center" as const,
            render: (_: unknown, record: Specimen, index: number) => (
              <Popconfirm
                title="ยืนยันการลบ?"
                onConfirm={() => handleDelete(index, record)}
                okText="ลบ"
                cancelText="ยกเลิก"
                disabled={isLocked}
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={isLocked}
                />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <StyledCard
      size="small"
      style={{
        height: "100%", // 🚩 เพิ่ม 100% เพื่อให้กางเต็ม Row
        display: "flex",
        flexDirection: "column",
      }}
      bodyStyle={{
        padding: "16px 20px",
        flex: 1, // 🚩 ให้เนื้อหาด้านในยืดออก
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header Section: จัดวาง Title และ Tag ให้อยู่บรรทัดเดียวกันอย่างสวยงาม */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Title
            level={5}
            style={{
              color: "#262626",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "1.2px",
              fontWeight: 600,
            }}
          >
            <BlockOutlined style={{ marginRight: 8, color: "#1890ff" }} />
            Specimen
          </Title>
          {/* 🧪 แสดง Badge เฉพาะเมื่อค่าเป็น true */}
          {/* 🧪 แสดง Badge เมื่อผ่านการ Extended Fix มาแล้ว */}
          {isExtendedFix && (
            <Tooltip title="Formalin fixation completed. Ready for grossing.">
              <Tag
                color="success" // 🚩 เปลี่ยนเป็นสีเขียวเพื่อให้รู้ว่า "ผ่าน/เสร็จแล้ว"
                icon={<CheckCircleOutlined />} // 🚩 ใช้ไอคอนติ๊กถูก
                style={{
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontWeight: "bold",
                  border: "1px solid #b7eb8f",
                  background: "#f6ffed",
                  color: "#389e0d",
                }}
              >
                EXTENDED FIXATION
              </Tag>
            </Tooltip>
          )}
          {activeSpecimenId && (
            <Tag color="blue" bordered={false} style={{ marginLeft: 8 }}>
              Editing Item
            </Tag>
          )}
        </div>
      </div>

      {/* ส่วน Table: ปรับให้ดู Clean ขึ้น */}
      <Table
        dataSource={[...specimens].sort((a, b) => a.specimen_label.localeCompare(b.specimen_label, undefined, { numeric: true, sensitivity: "base" }))}
        columns={columns}
        pagination={false}
        size="small"
        rowKey={(record) => record.id?.toString() || Math.random().toString()}
        onRow={(record) => ({
          onClick: () => onSelect?.(record),
          style: {
            cursor: "pointer",
            backgroundColor:
              record.id === activeSpecimenId ? "#f0f7ff" : undefined,
            transition: "all 0.2s",
          },
        })}
        // 🚩 เพิ่ม border ของ table ให้จางลงเพื่อให้เข้ากับ Card
        style={{ marginBottom: 8 }}
      />

      {/* ส่วน Action ด้านล่าง (Add Section) */}
      {canAddDelete && !isLocked && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 16,
            borderTop: "1px dashed #f0f0f0", // เปลี่ยนเป็น dashed จางๆ เพื่อความ Clean
          }}
        >
          <Space.Compact style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 16px",
                minWidth: "100px",

                // 🚩 1. ปรับพื้นหลัง: ใน Dark Mode ใช้สีน้ำเงินเข้มโปร่งแสง
                background: isDarkMode ? "rgba(22, 119, 255, 0.15)" : "#f0f7ff",

                // 🚩 2. ปรับเส้นขอบ: ใน Dark Mode ใช้สีฟ้าจางๆ หรือโปร่งแสง
                border: isDarkMode
                  ? "1px solid rgba(22, 119, 255, 0.3)"
                  : "1px solid #d6e4ff",

                // 🚩 3. ปรับสีตัวอักษร: ใน Dark Mode ใช้สีฟ้าที่สว่างขึ้นเพื่อให้ Contrast ดี
                color: isDarkMode ? "#69b1ff" : "#1890ff",

                borderRadius: "6px 0 0 6px",
                fontWeight: 600,
                fontSize: "13px",
                backdropFilter: isDarkMode ? "blur(4px)" : "none", // เพิ่มความ Glass นิดๆ
              }}
            >
              Next: {displayNextLabel()}
            </div>
            <AutoComplete
              style={{ flex: 1 }}
              value={newName}
              onChange={(val) => setNewName(val)}
              onSelect={(val: string) => {
                handleAdd(val);
                setNewName("");
              }}
              getPopupContainer={() => document.body}
              placeholder="Search or type specimen name, press Enter to add..."
              options={customSpecimens
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((item) => ({
                  value: item.name,
                  label: item.name,
                }))}
              filterOption={(inputValue, option) =>
                option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              onInputKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            >
              <Input
                style={{ height: "36px", borderRadius: "0 6px 6px 0" }}
                allowClear
                suffix={
                  <SettingOutlined
                    onClick={(e) => {
                      e.stopPropagation();
                      openManagementModal();
                    }}
                    style={{ cursor: "pointer", color: "#d9d9d9", fontSize: "15px" }}
                  />
                }
              />
            </AutoComplete>
          </Space.Compact>

          {/* 🚩 Modal ตัวนี้จะเด้งขึ้นมาเมื่อกด Manage Custom List เท่านั้น */}
          <Modal
            zIndex={2000}
            title={
              <Space>
                <SettingOutlined />
                <span>Manage Specimen List</span>
              </Space>
            }
            open={isModalOpen}
            onCancel={closeManagementModal}
            footer={[
              <Button key="close" onClick={closeManagementModal}>
                Close
              </Button>,
            ]}
          >
            <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
              <Input
                placeholder="Add new template..."
                value={newCustomName}
                onChange={(e) => setNewCustomName(e.target.value)}
              />
              <Button type="primary" onClick={handleAddCustom}>
                Add to List
              </Button>
            </Space.Compact>

            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                border: "1px solid #f0f0f0",
                borderRadius: "8px",
              }}
            >
              <List
                size="small"
                dataSource={customSpecimens}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveCustom(item.id)}
                      />,
                    ]}
                  >
                    {/* 🚩 เปลี่ยนตรงนี้เป็น Typography.Text พร้อมคุณสมบัติ editable */}
                    <Typography.Text
                      editable={{
                        icon: <EditOutlined />,
                        tooltip: "Click to edit",
                        // เมื่อแก้ไขเสร็จและกด Enter หรือคลิกนอกช่อง
                        onChange: (newVal) => handleEditCustom(item.id, newVal),
                      }}
                      style={{ width: "100%" }}
                    >
                      {item.name}
                    </Typography.Text>
                  </List.Item>
                )}
              />
            </div>
          </Modal>
        </div>
      )}
    </StyledCard>
  );
};

export default SpecimenManagerSection;

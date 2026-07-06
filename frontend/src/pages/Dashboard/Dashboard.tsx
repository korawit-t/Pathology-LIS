import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Layout,
  Button,
  Menu,
  Typography,
  Divider,
  Space,
  Spin,
  Tooltip,
} from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  ExperimentOutlined,
  LayoutOutlined,
  VerticalLeftOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";

import {
  SIDE_MENU_CONFIG,
  buildAuthorizedMenuItems,
} from "../../constants/sideMenu.config";
import SideMenu from "../../components/Layout/SideMenu";
import { resolveDashboardView } from "./dashboardViewResolver";
import "./Dashboard.css";
import UserService from "../../services/userService";
import type { User } from "../../types/user";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import logger from "../../utils/logger";
import SystemSettingService from "../../services/systemSettingService";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [layoutMode, setLayoutMode] = useState<"side" | "top">(
    (localStorage.getItem("layoutMode") as "side" | "top") || "top",
  );
  const [collapsed, setCollapsed] = useState(false);
  const [currentView, setCurrentView] = useState("dashboard");
  const [previousView, setPreviousView] = useState<string | null>(null);
  const [pathologistDefaultTab, setPathologistDefaultTab] = useState("surgical");
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<number | null>(
    null,
  );
  const [enabledFlags, setEnabledFlags] = useState<Record<string, boolean>>({});

  const navigate = useNavigate();
  // ดึงข้อมูล User เมื่อ Component mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await UserService.getCurrentUser();

        setUser(userData);

        const layoutMode = userData.preferences?.layout_mode;
        if (layoutMode) {
          setLayoutMode(layoutMode);
          localStorage.setItem("layoutMode", layoutMode);
        }
      } catch (error) {
        logger.error("Auth Error:", error);
        const lastSlug = localStorage.getItem("last_hospital_slug") || "master";
        navigate(lastSlug === "master" ? "/login" : `/${lastSlug}`);
      }
    };

    fetchUser();
    SystemSettingService.getSettings()
      .then((s) => setEnabledFlags({ nongyne_slide_dispatch_enabled: s.nongyne_slide_dispatch_enabled ?? true }))
      .catch(() => {});
  }, [navigate]);


  const toggleLayoutMode = async () => {
    const newMode = layoutMode === "side" ? "top" : "side";

    // 1. เปลี่ยนที่หน้าจอทันที + เซฟลงเครื่อง (เพื่อให้เร็ว)
    setLayoutMode(newMode);
    localStorage.setItem("layoutMode", newMode);

    // 2. เซฟลงฐานข้อมูล (เพื่อให้เปลี่ยนเครื่องแล้วค่ายังอยู่)
    try {
      await UserService.updateMyPreferences({ layout_mode: newMode });
    } catch (error) {
      logger.error("บันทึกความชอบลง Server ไม่สำเร็จ:", error);
    }
  };

  const authorizedMenuItems = React.useMemo(() => {
    if (!user) return [];
    return buildAuthorizedMenuItems(SIDE_MENU_CONFIG, user.roles ?? [], enabledFlags);
  }, [user, enabledFlags]);

  if (!user) return <Spin fullscreen tip="Loading user data..." />;

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      {layoutMode === "side" && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme={isDarkMode ? "dark" : "light"}
          style={{
            borderRight: isDarkMode ? "1px solid #303030" : "1px solid #f0f0f0",
          }}
        >
          <div
            onClick={() => setCurrentView("dashboard")}
            className={`sidebar-logo-container ${isDarkMode ? "sidebar-logo-dark" : "sidebar-logo-light"}`}
            style={{
              height: 64,
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              borderBottom: isDarkMode ? "1px solid #303030" : "1px solid #f0f0f0",
              cursor: "pointer",
            }}
          >
            <ExperimentOutlined
              style={{
                fontSize: 24,
                color: "#1677ff",
                filter: isDarkMode ? "drop-shadow(0 0 5px rgba(22, 119, 255, 0.3))" : "none",
              }}
            />
            {!collapsed && (
              <Title
                level={4}
                style={{
                  margin: "0 0 0 12px",
                  fontSize: 16,
                  color: isDarkMode ? "#ffffff" : "#262626",
                }}
              >
                PATH-LIS
              </Title>
            )}
          </div>

          <SideMenu
            user={user}
            setCurrentView={setCurrentView}
            currentView={currentView}
          />
        </Sider>
      )}

      <Layout style={{ background: "transparent" }}>
        <Header
          style={{
            background: isDarkMode ? "rgba(20, 20, 20, 0.75)" : "rgba(255, 255, 255, 0.75)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 64,
            boxShadow: "0 1px 4px rgba(0,21,41,.08)",
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,
              overflow: "hidden",
            }}
          >
            {layoutMode === "side" ? (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{
                  fontSize: "16px",
                  width: 40,
                  height: 40,
                  marginRight: 10,
                  color: isDarkMode ? "#fff" : "inherit",
                }}
              />
            ) : (
              <div
                onClick={() => setCurrentView("dashboard")}
                className={`sidebar-logo-container ${isDarkMode ? "sidebar-logo-dark" : "sidebar-logo-light"}`}
                style={{ display: "flex", alignItems: "center", marginRight: 24, cursor: "pointer" }}
              >
                <ExperimentOutlined
                  style={{
                    fontSize: 24,
                    color: "#1677ff",
                    filter: isDarkMode ? "drop-shadow(0 0 5px rgba(22, 119, 255, 0.4))" : "none",
                  }}
                />
                <Title
                  level={4}
                  style={{ margin: "0 0 0 8px", fontSize: 16, color: isDarkMode ? "#fff" : "inherit" }}
                >
                  PATH-LIS
                </Title>
              </div>
            )}

            {layoutMode === "top" && (
              <Menu
                mode="horizontal"
                selectedKeys={[currentView]}
                style={{
                  flex: 1,
                  borderBottom: "none",
                  minWidth: 0,
                  background: "transparent",
                }}
                items={authorizedMenuItems}
                onClick={({ key }) => setCurrentView(key)}
              />
            )}
          </div>
          <Space align="center" size="middle">
            <Button
              type="text"
              icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleDarkMode}
              // 🚩 ปรับสีปุ่มให้ดูนวลขึ้น
              style={{
                fontSize: "16px",
                color: isDarkMode ? "#fadb14" : "rgba(0,0,0,0.45)", // โหมดมืดให้ไอคอนดวงอาทิตย์สีเหลืองทอง
              }}
            />

            <Tooltip title={layoutMode === "side" ? "Switch to top menu" : "Switch to sidebar"}>
              <Button
                type="text"
                icon={
                  layoutMode === "side" ? (
                    <LayoutOutlined />
                  ) : (
                    <VerticalLeftOutlined />
                  )
                }
                onClick={toggleLayoutMode}
                style={{
                  color: isDarkMode
                    ? "rgba(255,255,255,0.65)"
                    : "rgba(0,0,0,0.45)",
                }}
              />
            </Tooltip>

            <Divider
              type="vertical"
              style={{ borderColor: isDarkMode ? "#303030" : "#f0f0f0" }}
            />

            <Text strong style={{ color: isDarkMode ? "#fff" : "inherit" }}>
              {user?.full_name}
            </Text>

            <Button
              icon={<LogoutOutlined />}
              danger
              type="text"
              onClick={logout}
              className="logout-button"
            />
          </Space>
        </Header>

        <Content
          style={{
            margin: 0, // เอา margin ออก หรือปรับตามเหมาะสม
            padding: 0, // 🚩 เอา padding 24 ออก เพื่อให้ PageContainer คุมพื้นที่เอง
            background: "transparent", // 🚩 เปลี่ยนจาก colorBgContainer เป็นโปร่งใส หรือเอาออก
            minHeight: 280,
            overflow: "initial", // ช่วยเรื่อง Sticky bar ในหน้า Gross
          }}
        >
          {resolveDashboardView({
            currentView,
            user,
            isSidebarCollapsed: collapsed,
            isSideLayout: layoutMode === "side",
            selectedSpecimenId,
            onNavigate: (view: string) => {
              if (view.includes(":")) {
                const [page, tab] = view.split(":");
                if (page === "pathologist-page") setPathologistDefaultTab(tab);
                setCurrentView(page);
              } else {
                setCurrentView(view);
              }
            },
            defaultTab: pathologistDefaultTab,
            onActiveTabChange: setPathologistDefaultTab,
            onOpenReport: (id, type) => {
              setSelectedSpecimenId(id);
              setPreviousView(currentView);

              if (currentView === "approval") {
                if (type === "gyne") {
                  setCurrentView("gyne-approval-manage");
                } else if (type === "nongyne") {
                  setCurrentView("nongyne-approval-manage");
                } else {
                  setCurrentView("approval-manage");
                }
              } else if (currentView === "gyne-cyto-work-list" || currentView === "gyne-qc-review" || type === "gyne") {
                const isPathologistUser = user?.roles?.some(
                  (r) => r === "pathologist" || r === "senior_pathologist",
                );
                setCurrentView(
                  isPathologistUser
                    ? "pathologist-gyne-diagnosis"
                    : "gyne-cyto-diagnosis-entry",
                );
              } else if (currentView === "pathologist-page" && type === "nongyne") {
                setCurrentView("pathologist-nongyne-diagnosis");
              } else if (currentView === "nongyne-cyto-work-list" || type === "nongyne") {
                setCurrentView("nongyne-cyto-diagnosis-entry");
              } else {
                // Default for Surgical
                setCurrentView("surgical-report-form");
              }
            },
            onBackToWorklist: () => {
              if (
                currentView === "approval-manage" ||
                currentView === "gyne-approval-manage" ||
                currentView === "nongyne-approval-manage"
              ) {
                setCurrentView("approval");
              } else if (currentView === "gyne-cyto-diagnosis-entry") {
                setCurrentView(previousView === "gyne-qc-review" ? "gyne-qc-review" : "gyne-cyto-work-list");
                setPreviousView(null);
              } else if (currentView === "pathologist-gyne-diagnosis") {
                setCurrentView("pathologist-page");
              } else if (currentView === "pathologist-nongyne-diagnosis") {
                setCurrentView("pathologist-page");
              } else if (currentView === "nongyne-cyto-diagnosis-entry") {
                setCurrentView("nongyne-cyto-work-list");
              } else if (currentView === "nongyne-cyto-stains") {
                setCurrentView("nongyne-cyto-work-list");
              } else if (currentView === "gyne-cyto-stains") {
                setCurrentView("gyne-cyto-work-list");
              } else {
                setCurrentView("pathologist-page");
              }
            },
          })}
        </Content>
      </Layout>
    </Layout>
  );
};

export default Dashboard;

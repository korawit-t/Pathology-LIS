import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ConfigProvider, App as AntdApp, Layout, Alert, message } from "antd";

message.config({ duration: 1 });
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Login from "./pages/Auth/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import WSIViewerPage from "./pages/WSIViewer/WSIViewerPage";
import ResultPage from "./pages/Result/ResultPage";
import HospitalResultPage from "./pages/Result/HospitalResultPage";
import ForceChangePassword from "./pages/Auth/ForceChangePassword";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const IdleWarningBanner: React.FC = () => {
  const { idleWarning, logout } = useAuth();
  if (!idleWarning) return null;
  return (
    <Alert
      type="warning"
      banner
      message="ไม่มีการใช้งาน — ระบบจะออกจากระบบโดยอัตโนมัติใน 1 นาที หากไม่มีการเคลื่อนไหว"
      action={
        <span
          style={{ cursor: "pointer", textDecoration: "underline" }}
          onClick={logout}
        >
          ออกจากระบบทันที
        </span>
      }
      style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999 }}
    />
  );
};

// Component หลักที่จัดการ Theme
const MainApp: React.FC = () => {
  const { algorithm, backgroundStyle } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: algorithm, // ✅ ตอนนี้ TypeScript จะรู้ว่า algorithm มาจาก Context ที่ถูกต้อง
      }}
    >
      {/* 🌟 AntdApp ช่วยให้ static methods อย่าง modal, message ใช้ theme เดียวกันได้ */}
      <AntdApp
        message={{ top: 56, duration: 1 }}
        notification={{ placement: "topRight", top: 72 }}
      >
        <AuthProvider>
          <IdleWarningBanner />
          <Layout style={{ minHeight: "100vh", ...backgroundStyle }}>
            <Routes>
              {/* 🔓 หน้าที่ใครก็เข้าได้ */}
              <Route path="/login" element={<Login />} />

              {/* 🔒 หน้าเปลี่ยนรหัสผ่าน (ไม่ต้องระบุ PageKey เพราะทุกคนที่โดนบังคับต้องเข้าได้) */}
              <Route
                path="/force-change-password"
                element={
                  <ProtectedRoute>
                    <ForceChangePassword />
                  </ProtectedRoute>
                }
              />

              {/* 🔒 ล็อคหน้า Dashboard หลัก (ใช้สิทธิ์ตาม PageKey "dashboard") */}
              <Route
                path="/dashboard/*"
                element={
                  <ProtectedRoute pageKey="dashboard">
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              {/* 🔒 หน้าผลตรวจสำหรับ Clinician (ใช้สิทธิ์ตาม PageKey "results") */}
              <Route
                path="/results/*"
                element={
                  <ProtectedRoute pageKey="results">
                    <ResultPage />
                  </ProtectedRoute>
                }
              />

              {/* 🔒 หน้าผลตรวจสำหรับ Hospital Staff (ดูได้ทุกเคสของโรงพยาบาลตัวเอง) */}
              <Route
                path="/hospital-results/*"
                element={
                  <ProtectedRoute pageKey="hospital-results">
                    <HospitalResultPage />
                  </ProtectedRoute>
                }
              />

              {/* WSI Viewer Test Page */}
              <Route path="/wsi-viewer" element={<WSIViewerPage />} />

              {/* Dynamic Route for Hospital Login */}
              <Route path="/:hospitalSlug" element={<Login />} />

              {/* Fallback Routes */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Router>
        {" "}
        {/* ✅ ย้าย Router มาไว้ระดับบนสุด เพื่อให้ Context ใช้ navigate ได้ */}
        <MainApp />
      </Router>
    </ThemeProvider>
  );
};

export default App;

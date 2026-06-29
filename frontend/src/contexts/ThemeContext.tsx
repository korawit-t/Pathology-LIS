import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";
import { theme, MappingAlgorithm } from "antd";

const { darkAlgorithm, defaultAlgorithm } = theme;

// 1. นิยามโครงสร้างของข้อมูลใน Context (Interface)
interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  algorithm: MappingAlgorithm | MappingAlgorithm[]; // Type จาก Ant Design
  backgroundStyle: React.CSSProperties;
}

// 2. สร้าง Context พร้อมกำหนด Type (เริ่มต้นเป็น undefined เพื่อความปลอดภัย)
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 3. Custom Hook สำหรับเรียกใช้ (พร้อม Error Handling ถ้าลืมครอบ Provider)
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

// 4. Provider Component
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // 🌟 4.1 สถานะเริ่มต้น
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const storedMode = localStorage.getItem("themeMode");
    return storedMode === "dark";
  });

  // 🌟 4.2 บันทึกสถานะลง LocalStorage
  useEffect(() => {
    localStorage.setItem("themeMode", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  // 🌟 4.3 ฟังก์ชันสลับโหมด
  const toggleDarkMode = () => {
    setIsDarkMode((prevMode) => !prevMode);
  };

  // 🌟 กำหนดสีพื้นหลังตามโหมด
  const backgroundStyle: React.CSSProperties = isDarkMode
    ? {
        backgroundColor: "#0b0c0d", // ดำลึกขึ้นกว่าเดิม
        backgroundImage: "linear-gradient(180deg, #161719 0%, #0b0c0d 100%)",
        backgroundAttachment: "fixed",
      }
    : {
        backgroundColor: "#e2e8f0", // เทาหมอกนวลๆ (Slate 200) เพื่อให้ Card ขาวดูเด่น
        backgroundImage: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
        backgroundAttachment: "fixed",
      };

  const algorithm = isDarkMode ? darkAlgorithm : defaultAlgorithm;

  return (
    <ThemeContext.Provider
      value={{ isDarkMode, toggleDarkMode, algorithm, backgroundStyle }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

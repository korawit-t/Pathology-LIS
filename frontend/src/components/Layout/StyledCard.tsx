import React from "react";
import { Card, CardProps } from "antd";
import { useTheme } from "../../contexts/ThemeContext"; // ดึงธีมมาใช้

const StyledCard: React.FC<CardProps> = (props) => {
  const { isDarkMode } = useTheme();

  return (
    <Card
      {...props}
      id={props.id}
      style={{
        borderRadius: "20px", // มนขึ้นเพื่อความหรูหรา

        // 🚩 1. การใช้ Gradient ใน Card ช่วยให้ดูมีมิติ (Depth)
        background: isDarkMode
          ? "linear-gradient(145deg, rgba(40, 45, 55, 0.9) 0%, rgba(20, 25, 30, 0.9) 100%)"
          : "rgba(255, 255, 255, 0.95)",

        backdropFilter: "blur(16px)",

        // 🚩 2. Multi-layered Shadow เพื่อความ 3D Pop Up
        boxShadow: isDarkMode
          ? "0 4px 6px rgba(0, 0, 0, 0.3), 0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1)"
          : "0 4px 6px rgba(0, 0, 0, 0.02), 0 20px 40px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)",

        // 🚩 3. ขอบแบบสว่าง (Highlight) เพื่อให้ดูไม่กลืนกับพื้นหลัง
        border: isDarkMode
          ? "1px solid rgba(255, 255, 255, 0.1)"
          : "1px solid rgba(255, 255, 255, 0.7)",

        // ขอบบนจะสว่างกว่าปกติเสมอ (High-level Elevation)
        borderTop: isDarkMode
          ? "1px solid rgba(255, 255, 255, 0.2)"
          : "1px solid rgba(255, 255, 255, 1)",

        scrollMarginTop: "100px",

        transition: "transform 0.3s ease, box-shadow 0.3s ease", // พร้อมสำหรับ Hover effect
        ...props.style,
      }}
    />
  );
};

export default StyledCard;

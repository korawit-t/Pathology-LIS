// src/components/ThemeToggle.jsx
import React from 'react';
// ✅ Import Switch Component แทน Button
import { Switch, Space } from 'antd'; 
// ✅ Import Icons สำหรับแสดงผลบน Switch
import { BulbOutlined, BulbFilled, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTheme } from '../contexts/ThemeContext'; 

const ThemeToggle = () => {
    // 🌟 ดึงสถานะและฟังก์ชันสลับโหมด
    const { isDarkMode, toggleDarkMode } = useTheme();

    return (
        // ใช้ Space เพื่อจัดเรียงข้อความ/ไอคอน กับ Switch
        <Space size="small">
            <SunOutlined style={{ color: isDarkMode ? 'rgba(0, 0, 0, 0.45)' : '#faad14' }} /> 
            
            {/* ✅ Ant Design Switch Component */}
            <Switch
                // 'checked' คือสถานะเปิด (Dark Mode)
                checked={isDarkMode} 
                // 'onChange' ใช้ฟังก์ชัน Toggle
                onChange={toggleDarkMode}
                // 'checkedChildren' คือข้อความ/ไอคอนเมื่อเปิด (Dark Mode)
                checkedChildren={<MoonOutlined />} 
                // 'unCheckedChildren' คือข้อความ/ไอคอนเมื่อปิด (Light Mode)
                unCheckedChildren={<SunOutlined />}
                // กำหนดสีเมื่อเปิด
                style={{ backgroundColor: isDarkMode ? '#172b4c' : '' }} 
                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            />
            
            <MoonOutlined style={{ color: isDarkMode ? '#ffec3d' : 'rgba(0, 0, 0, 0.45)' }} />
            
        </Space>
    );
};

export default ThemeToggle;
import React from "react";
import { Card, Typography, Button, Space } from "antd"; // เพิ่ม Button, Space
import type { CardProps } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons"; // เพิ่ม Icon
import { useTheme } from "../../contexts/ThemeContext";

const { Title, Text } = Typography;

interface PageContainerProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subTitle?: React.ReactNode; // 🚩 เพิ่ม subTitle
  extra?: React.ReactNode;
  withCard?: boolean;
  cardProps?: CardProps;
  onBack?: () => void; // 🚩 เพิ่ม onBack เพื่อแก้ Error ts(2322)
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  title,
  subTitle,
  extra,
  withCard = false,
  cardProps,
  onBack, // 🚩 รับมาใช้งาน
}) => {
  const { isDarkMode } = useTheme();

  const renderTitle = () => {
    if (!title) return null;

    // สร้างส่วนหัวที่มีทั้งปุ่ม Back และ Title
    const headerNode = (
      <Space size="middle">
        {onBack && (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{ fontSize: "20px", color: isDarkMode ? "#fff" : "inherit" }}
          />
        )}
        <div>
          {typeof title === "string" ? (
            <Title
              level={3}
              style={{ margin: 0, color: isDarkMode ? "#fff" : "inherit" }}
            >
              {title}
            </Title>
          ) : (
            title
          )}
          {subTitle && (
            <Text
              type="secondary"
              style={{ display: "block", fontSize: "14px" }}
            >
              {subTitle}
            </Text>
          )}
        </div>
      </Space>
    );

    return headerNode;
  };

  return (
    <div
      style={{
        padding: "20px 24px 24px",
        background: "transparent",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1600px",
          width: "100%",
          margin: "0 auto",
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {withCard ? (
          <Card
            bordered={false}
            title={
              title ? (
                <div style={{ padding: "8px 0" }}>{renderTitle()}</div>
              ) : null
            }
            extra={extra}
            style={{
              flex: 1,
              minHeight: "calc(100vh - 44px)",
              borderRadius: "20px",
              background: isDarkMode
                ? "linear-gradient(135deg, rgba(40, 45, 55, 0.9) 0%, rgba(20, 25, 30, 0.9) 100%)"
                : "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(16px)",
              boxShadow: isDarkMode
                ? "0 4px 6px rgba(0, 0, 0, 0.2), 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)"
                : "0 4px 6px rgba(0, 0, 0, 0.02), 0 20px 40px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)",
              border: isDarkMode
                ? "1px solid rgba(255, 255, 255, 0.08)"
                : "1px solid rgba(255, 255, 255, 0.7)",
              ...cardProps?.style,
            }}
            {...cardProps}
          >
            {children}
          </Card>
        ) : (
          <>
            {(title || extra) && (
              <div
                style={{
                  marginBottom: 24,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>{renderTitle()}</div>
                <div>{extra}</div>
              </div>
            )}
            {children}
          </>
        )}
      </div>
    </div>
  );
};

export default PageContainer;

import React from "react";
import { Col, Anchor, Typography } from "antd";
import {
  MedicineBoxOutlined,
  DatabaseOutlined,
  EditOutlined,
  HistoryOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import StyledCard from "../../../../components/Layout/StyledCard";
// Make sure this stylesheet path matches the structure where it's used
import styles from "../../../../styles/LayoutWidget.module.css";

const { Text } = Typography;

interface SurgicalReportNavigatorProps {
  isDarkMode: boolean;
}

const SurgicalReportNavigator: React.FC<SurgicalReportNavigatorProps> = ({
  isDarkMode,
}) => {
  return (
    <Col flex="160px" className={styles.navigatorContainer}>
      <div
        style={{
          position: "sticky",
          top: "100px",
          height: "fit-content",
          zIndex: 10,
        }}
      >
        <StyledCard
          size="small"
          bodyStyle={{ padding: "16px 12px" }}
          style={{
            width: "100%",
            border: isDarkMode
              ? "1px solid rgba(255, 255, 255, 0.08)"
              : "1px solid rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <Text
              type="secondary"
              strong
              style={{
                fontSize: "10px",
                letterSpacing: "1px",
                color: isDarkMode
                  ? "rgba(255, 255, 255, 0.45)"
                  : "#8c8c8c",
              }}
            >
              NAVIGATOR
            </Text>
          </div>

          <Anchor
            affix={false}
            targetOffset={120}
            style={{ background: "transparent" }}
            className={isDarkMode ? "dark-anchor" : ""}
            items={[
              {
                key: "1",
                href: "#patient-info",
                title: (
                  <span>
                    <MedicineBoxOutlined /> Patient
                  </span>
                ),
              },
              {
                key: "2",
                href: "#clinical-info",
                title: (
                  <span>
                    <DatabaseOutlined /> Clinical
                  </span>
                ),
              },
              {
                key: "3",
                href: "#diagnostic-station",
                title: (
                  <span>
                    <EditOutlined /> Diagnosis
                  </span>
                ),
              },
              {
                key: "4",
                href: "#history-section",
                title: (
                  <span>
                    <HistoryOutlined /> History
                  </span>
                ),
              },
              {
                key: "5",
                href: "#preview-section",
                title: (
                  <span>
                    <FileTextOutlined /> Preview
                  </span>
                ),
              },
            ]}
          />
        </StyledCard>
      </div>
    </Col>
  );
};

export default SurgicalReportNavigator;

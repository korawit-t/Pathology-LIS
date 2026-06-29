import React, { forwardRef } from "react";
import { Typography, Row, Col } from "antd";
import dayjs from "dayjs";
import type { OutlabRun } from "../../../services/surgicalBlockStainService";

const { Title, Text } = Typography;

interface PrintDetail {
  id?: number;
  accession_no?: string;
  block_code?: string;
  stain_order?: {
    accession_no?: string;
    block_code?: string;
    stain_name?: string;
    test?: { name?: string };
    block?: {
      accession_no?: string;
      block_code?: string;
      specimen?: { case?: { accession_no?: string } };
    };
  };
  blockCode?: string;
  testName?: string;
}

interface OutlabRunPrintData extends OutlabRun {
  operator?: { full_name?: string; username?: string };
  details?: PrintDetail[];
}

interface Props {
  runData: OutlabRunPrintData | null;
  hospitalName?: string;
}

export const OutlabRunPrint = forwardRef<HTMLDivElement, Props>(
  (props, ref) => {
    const { runData, hospitalName } = props;

    if (!runData) return <div ref={ref}></div>;

    const operatorName = runData.operator?.full_name || runData.operator?.username || "N/A";
    const details = runData.details || [];

    return (
      <div style={{ display: "none" }}>
        <div
          ref={ref}
          style={{
            padding: "15mm",
            color: "#000",
            backgroundColor: "#fff",
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          }}
        >
          {/* Hospital Name Header */}
          <div style={{ textAlign: "center", marginBottom: "5px" }}>
            <Title level={4} style={{ margin: 0, textTransform: "uppercase" }}>
              {hospitalName || "Pathology Laboratory System"}
            </Title>
          </div>

          {/* Header Section */}
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <Title
              level={3}
              style={{
                margin: 0,
                textTransform: "uppercase",
                textDecoration: "underline",
              }}
            >
              Outlab Dispatch Note
            </Title>
            <div style={{ marginTop: 5 }}>
              <Text strong style={{ fontSize: "16px" }}>
                RUN NO: {runData.run_no || "N/A"}
              </Text>
            </div>
            <Text>Printed Date: {dayjs().format("DD/MM/YYYY HH:mm")}</Text>
          </div>

          {/* Info Section */}
          <Row
            style={{
              marginBottom: "20px",
              borderBottom: "2px solid #000",
              paddingBottom: "10px",
            }}
          >
            <Col span={14}>
              <Text strong>Destination Lab: </Text>
              <Text>{runData.destination_lab || "N/A"}</Text>
              <br />
              <Text strong>Dispatched Date: </Text>
              <Text>{runData.sent_at ? dayjs(runData.sent_at).format("DD/MM/YYYY HH:mm") : "-"}</Text>
            </Col>
            <Col span={10} style={{ textAlign: "right" }}>
              <Text strong>Total Slides: </Text>
              <Text>{details.length} Slide(s)</Text>
            </Col>
          </Row>

          {/* Table Section */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "30px",
            }}
          >
            <thead>
              <tr>
                <th style={tableHeaderStyle}>No.</th>
                <th style={tableHeaderStyle}>Accession No.</th>
                <th style={tableHeaderStyle}>Block Code</th>
                <th style={tableHeaderStyle}>Stain / Test</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Group details by Accession No
                const groupedDetails: Record<string, PrintDetail[]> = {};
                details.forEach((detail: PrintDetail) => {
                  const stain = detail.stain_order;
                  const block = stain?.block;
                  const specimen = block?.specimen;
                  const caseObj = specimen?.case;

                  const accessionNo = detail.accession_no || stain?.accession_no || block?.accession_no || caseObj?.accession_no || "Unknown Accession";
                  const blockCode = detail.block_code || block?.block_code || stain?.block_code || "-";
                  const testName = stain?.test?.name || stain?.stain_name || "-";

                  if (!groupedDetails[accessionNo]) {
                    groupedDetails[accessionNo] = [];
                  }
                  groupedDetails[accessionNo].push({ ...detail, blockCode, testName });
                });

                let globalIndex = 1;
                const renderedRows: React.ReactNode[] = [];

                Object.entries(groupedDetails).forEach(([accessionNo, items]) => {
                  items.forEach((item, idx) => {
                    renderedRows.push(
                      <tr key={item.id || `${accessionNo}-${idx}`}>
                        <td style={tableCellStyle}>{globalIndex++}</td>
                        {idx === 0 && (
                          <td
                            style={{ ...tableCellStyle, fontWeight: "bold", verticalAlign: "top" }}
                            rowSpan={items.length}
                          >
                            {accessionNo}
                          </td>
                        )}
                        <td style={{ ...tableCellStyle, textAlign: "left" }}>
                          {item.blockCode}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: "left" }}>
                          {item.testName}
                        </td>
                      </tr>
                    );
                  });
                });

                return renderedRows;
              })()}
            </tbody>
          </table>

          {/* Signature Section */}
          <div style={{ marginTop: "60px" }}>
            <Row gutter={64}>
              <Col span={12} style={{ textAlign: "center" }}>
                <Text>
                  ...........................................................
                </Text>
                <div style={{ marginTop: "8px" }}>
                  <Text strong>
                    ( {operatorName || "................................"} )
                  </Text>
                  <br />
                  <Text
                    style={{ fontSize: "12px", textTransform: "uppercase" }}
                  >
                    Dispatched By
                  </Text>
                </div>
              </Col>
              <Col span={12} style={{ textAlign: "center" }}>
                <Text>
                  ...........................................................
                </Text>
                <div style={{ marginTop: "8px" }}>
                  <Text strong>
                    ( ........................................ )
                  </Text>
                  <br />
                  <Text
                    style={{ fontSize: "12px", textTransform: "uppercase" }}
                  >
                    Received By (Destination Lab)
                  </Text>
                </div>
              </Col>
            </Row>
          </div>

          {/* Footer */}
          <div
            style={{
              position: "fixed",
              bottom: "10mm",
              left: "15mm",
              right: "15mm",
              textAlign: "right",
              fontSize: "10px",
              color: "#666",
              borderTop: "1px solid #eee",
              paddingTop: "5px",
            }}
          >
            Generated by Pathology LIS System
          </div>
        </div>
      </div>
    );
  }
);

// CSS Styles for Printing
const tableHeaderStyle: React.CSSProperties = {
  border: "1px solid #000",
  padding: "10px 8px",
  backgroundColor: "#f2f2f2",
  textAlign: "center",
  fontSize: "13px",
  fontWeight: "bold",
};

const tableCellStyle: React.CSSProperties = {
  border: "1px solid #000",
  padding: "10px 8px",
  textAlign: "center",
  fontSize: "13px",
};

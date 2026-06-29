import React, { forwardRef } from "react";
import { Typography, Row, Col } from "antd";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface DispatchBlock { block_code?: string; }
interface DispatchSpecimen { blocks?: DispatchBlock[]; }
interface ScannedCase {
  id: number;
  accession_no?: string;
  remark?: string;
  specimens?: DispatchSpecimen[];
  surgical_case?: { accession_no?: string; specimens?: DispatchSpecimen[] };
  nongyne_cyto_case?: { accession_no?: string };
}

interface Props {
  scannedCases: ScannedCase[];
  pathologistName: string;
  senderName?: string; // 🚩 Add Sender Name
  hospitalName?: string;
  dispatchNo?: string;
  remark?: string;
}

export const DispatchNotePrint = forwardRef<HTMLDivElement, Props>(
  (props, ref) => {
    const {
      scannedCases,
      pathologistName,
      senderName,
      hospitalName,
      dispatchNo,
      remark,
    } = props;

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
          {/* 🚩 Hospital Name Header */}
          <div style={{ textAlign: "center", marginBottom: "5px" }}>
            <Title level={4} style={{ margin: 0, textTransform: "uppercase" }}>
              {hospitalName || "Pathology Laboratory System"}
            </Title>
          </div>

          {/* Header */}
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
              Slide Dispatch Note
            </Title>
            {/* 🚩 Display dispatch number clearly */}
            <div style={{ marginTop: 5 }}>
              <Text strong style={{ fontSize: "16px" }}>
                NO: {dispatchNo || "N/A"}
              </Text>
            </div>
            <Text>Dispatch Date: {dayjs().format("DD/MM/YYYY HH:mm")}</Text>
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
              <Text strong>Receiving Pathologist: </Text>
              <Text>{pathologistName}</Text>
            </Col>
            <Col span={10} style={{ textAlign: "right" }}>
              <Text strong>Total Cases: </Text>
              <Text>{scannedCases.length} Item(s)</Text>
            </Col>
          </Row>
          {remark && (
            <div
              style={{
                marginBottom: "15px",
                padding: "8px",
                border: "1px dashed #999",
              }}
            >
              <Text strong>Remark: </Text>
              <Text>{remark}</Text>
            </div>
          )}

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
                <th style={tableHeaderStyle}>Block List</th>
                <th style={tableHeaderStyle}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {[...scannedCases]
                .sort((a, b) => {
                  const aNo = a.accession_no || a.surgical_case?.accession_no || a.nongyne_cyto_case?.accession_no || "";
                  const bNo = b.accession_no || b.surgical_case?.accession_no || b.nongyne_cyto_case?.accession_no || "";
                  return aNo.localeCompare(bNo, undefined, { numeric: true, sensitivity: "base" });
                })
                .map((item, index) => {
                // 🚩 Flexible data access logic (Supports both Scan and List views)
                const specimens =
                  item.specimens || item.surgical_case?.specimens || [];
                const allBlockCodes =
                  specimens
                    .flatMap((spec) =>
                      spec.blocks?.map((b) => b.block_code),
                    )
                    .filter(Boolean)
                    .sort((a, b) => (a as string).localeCompare(b as string, undefined, { numeric: true, sensitivity: "base" }))
                    .join(", ") || "-";

                return (
                  <tr key={item.id}>
                    <td style={tableCellStyle}>{index + 1}</td>
                    <td style={{ ...tableCellStyle, fontWeight: "bold" }}>
                      {item.accession_no || item.surgical_case?.accession_no || item.nongyne_cyto_case?.accession_no}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: "left" }}>
                      {allBlockCodes}
                    </td>
                    <td style={tableCellStyle}>{item.remark || ""}</td>
                  </tr>
                );
              })}
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
                    ( {senderName || "................................"} )
                  </Text>
                  <br />
                  <Text
                    style={{ fontSize: "12px", textTransform: "uppercase" }}
                  >
                    Dispatched By (Laboratory Staff)
                  </Text>
                </div>
              </Col>
              <Col span={12} style={{ textAlign: "center" }}>
                <Text>
                  ...........................................................
                </Text>
                <div style={{ marginTop: "8px" }}>
                  <Text strong>
                    ( {pathologistName || "................................"} )
                  </Text>
                  <br />
                  <Text
                    style={{ fontSize: "12px", textTransform: "uppercase" }}
                  >
                    Received By (Pathologist)
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
            Printed on: {dayjs().format("DD/MM/YYYY HH:mm:ss")} | Pathology LIS
            System
          </div>
        </div>
      </div>
    );
  },
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

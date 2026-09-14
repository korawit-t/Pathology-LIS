import React from "react";
import { Table, Typography, Spin } from "antd";
import dayjs from "dayjs";
import type { OutlabAppointment } from "../types";

const { Text } = Typography;

interface AppointmentSubTableProps {
  appointments?: OutlabAppointment[];
  loading?: boolean;
  /** The HIS lookup failed — distinct from it succeeding with no rows. */
  unavailable?: boolean;
}

/** HosXP appointment history shown in HosxpKeyTab's row-expansion. */
export const AppointmentSubTable: React.FC<AppointmentSubTableProps> = ({
  appointments,
  loading,
  unavailable,
}) => {
  if (loading) return <Spin size="small" style={{ padding: 12 }} />;
  // "Could not ask" and "asked, found none" are different facts and must not
  // render the same. A failed lookup shown as "no appointments found" is a
  // confident wrong answer about a patient's follow-up.
  if (unavailable)
    return (
      <Text type="danger" style={{ padding: "8px 12px", display: "block" }}>
        Cannot reach the HIS — appointments unknown
      </Text>
    );
  if (!appointments || appointments.length === 0)
    return (
      <Text type="secondary" style={{ padding: "8px 12px", display: "block" }}>
        No appointments found in HosXP
      </Text>
    );
  return (
    <Table
      dataSource={appointments}
      rowKey="oapp_id"
      size="small"
      pagination={false}
      style={{ margin: "4px 0" }}
      columns={[
        {
          title: "Appointment Date",
          dataIndex: "nextdate",
          width: 150,
          render: (v) => v ? <Text strong>{dayjs(v).format("DD/MM/YYYY")}</Text> : "-",
        },
        {
          title: "Time",
          dataIndex: "nexttime",
          width: 80,
          render: (v) => v ? String(v).substring(0, 5) : "-",
        },
        {
          title: "Clinic",
          dataIndex: "department",
          width: 200,
          render: (v, row) => v || row.contact_point || "-",
        },
        {
          title: "Cause",
          dataIndex: "app_cause",
          render: (v) => <Text type="secondary">{v || "-"}</Text>,
        },
        {
          title: "Note",
          dataIndex: "note",
          render: (v) => <Text type="secondary">{v || "-"}</Text>,
        },
      ]}
    />
  );
};

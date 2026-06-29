import React from "react";
import { Table, Descriptions } from "antd";
import dayjs from "dayjs";
import type { SlideStorageRunResponse, SlideStorageDetailResponse } from "../../../../types/slideStorage";

interface SlideStorageDetailsProps {
  run: SlideStorageRunResponse | null;
}

const SlideStorageDetails: React.FC<SlideStorageDetailsProps> = ({ run }) => {
  if (!run) return null;

  return (
    <>
      <Descriptions
        bordered
        size="small"
        column={2}
        style={{ marginBottom: 24 }}
      >
        <Descriptions.Item label="Run No.">{run.run_no}</Descriptions.Item>
        <Descriptions.Item label="Date">
          {dayjs(run.started_at).format("DD/MM/YYYY HH:mm")}
        </Descriptions.Item>
        <Descriptions.Item label="Staff" span={2}>
          {run.operator?.full_name || `Staff ID: ${run.user_id}`}
        </Descriptions.Item>
        <Descriptions.Item label="Remark" span={2}>
          {run.remark || "-"}
        </Descriptions.Item>
      </Descriptions>

      <Table
        dataSource={run.details}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: "Accession",
            render: (_: unknown, r: SlideStorageDetailResponse) => {
              if (r.gyne_stain) return r.gyne_stain.case?.accession_no || "-";
              if (r.nongyne_stain) return r.nongyne_stain.case?.accession_no || "-";
              return r.stain?.block?.specimen?.case?.accession_no || "-";
            },
          },
          {
            title: "Slide",
            render: (_: unknown, r: SlideStorageDetailResponse) => {
              if (r.gyne_stain) {
                const testName = r.gyne_stain.test?.name || "Pap";
                return `${testName} #${r.gyne_stain.slide_no}`;
              }
              if (r.nongyne_stain) {
                const testName = r.nongyne_stain.test?.name || "H&E";
                return `${testName} #${r.nongyne_stain.slide_no}`;
              }
              const blockCode = r.stain?.block?.block_code || "-";
              const slideNo = r.stain?.slide_no || "";
              const testName = r.stain?.test?.name || "H&E";
              return `${blockCode} (Slide #${slideNo}) — ${testName}`;
            },
          },
          { title: "Location", dataIndex: "storage_location" },
          { title: "Remark", dataIndex: "remark" },
        ]}
      />
    </>
  );
};

export default SlideStorageDetails;

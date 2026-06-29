import React from "react";
import { Table, Descriptions } from "antd";
import dayjs from "dayjs";
import type { BlockStorageRunResponse } from "../../../../types/blockStorage";

interface BlockStorageDetailsProps {
  run: BlockStorageRunResponse | null;
}

const BlockStorageDetails: React.FC<BlockStorageDetailsProps> = ({ run }) => {
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
          { title: "Accession", dataIndex: ["block", "accession_no"] },
          { title: "Block Code", dataIndex: ["block", "block_code"] },
          { title: "Location", dataIndex: "storage_location" },
          { title: "Remark", dataIndex: "remark" },
        ]}
      />
    </>
  );
};

export default BlockStorageDetails;

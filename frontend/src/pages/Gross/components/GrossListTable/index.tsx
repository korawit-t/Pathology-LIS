import React from "react";
import { Table } from "antd";
import type { TableProps } from "antd";
import { getColumns, HospitalOption } from "./columns";
import { SurgicalCase } from "../../../../types/surgical";
import "../../../../styles/table-common.css";

interface SurgicalCaseListTableProps {
    cases: SurgicalCase[];
    loading: boolean;
    onEditClick: (record: SurgicalCase) => void;
    total: number;
    current: number;
    onChangePage: (page: number) => void;
    hospitals: HospitalOption[];
    onFilterChange: (hospitalId: number | null, statusList: string[]) => void;
}

const SurgicalCaseListTable: React.FC<SurgicalCaseListTableProps> = ({
    cases,
    loading,
    onEditClick,
    total,
    current,
    onChangePage,
    hospitals,
    onFilterChange,
}) => {
    const columns = getColumns(onEditClick, hospitals);

    const handleTableChange: TableProps<SurgicalCase>["onChange"] = (
        _pagination,
        filters,
        _sorter,
        extra,
    ) => {
        if (extra.action !== "filter") return;
        const hospitalId = filters["hospital"]?.[0] != null
            ? Number(filters["hospital"][0])
            : null;
        const statusList = (filters["status"] as string[]) ?? [];
        onFilterChange(hospitalId, statusList);
    };

    return (
        <Table
            className="standard-table"
            dataSource={cases}
            columns={columns}
            rowKey="id"
            loading={loading}
            onRow={(record) => ({
                onClick: () => onEditClick(record),
            })}
            rowClassName={() => "editable-row"}
            onChange={handleTableChange}
            pagination={{
                current: current,
                pageSize: 20,
                total: total,
                onChange: (page) => onChangePage(page),
                showSizeChanger: false,
                showTotal: (totalCount) => `Total ${totalCount} cases`,
            }}
            scroll={{ x: "max-content", y: "calc(100vh - 360px)" }}
            sticky
            bordered
            size="middle"
        />
    );
};

export default SurgicalCaseListTable;

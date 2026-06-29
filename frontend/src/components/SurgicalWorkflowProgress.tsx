import React from "react";
import { Tag, Tooltip, Space } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";

interface WorkflowRecord {
  is_grossed?: boolean | null;
  is_processed?: boolean | null;
  is_slide_prepped?: boolean | null;
  is_reported?: boolean | null;
}

interface StatusBadgeTagProps {
    label: string;
    isDone: boolean;
    color: string;
    tooltip: string;
}

const StatusBadgeTag: React.FC<StatusBadgeTagProps> = ({ label, isDone, color, tooltip }) => (
    <Tooltip title={tooltip}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <Tag 
                color={isDone ? color : "default"} 
                style={{ 
                    margin: 0, 
                    width: '38px', 
                    textAlign: 'center',
                    fontWeight: isDone ? 600 : 'normal',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: isDone ? `1px solid ${color}` : '1px solid #d9d9d9'
                }}
            >
                {label}
            </Tag>
            {isDone && (
                <CheckCircleFilled 
                    style={{ 
                        position: 'absolute', 
                        top: '-5px', 
                        right: '-5px', 
                        fontSize: '11px', 
                        color: '#52c41a', 
                        backgroundColor: '#fff', 
                        borderRadius: '50%',
                        boxShadow: '0 0 2px rgba(0,0,0,0.3)',
                        zIndex: 1
                    }} 
                />
            )}
        </div>
    </Tooltip>
);

export const SurgicalWorkflowProgress: React.FC<{ record: WorkflowRecord }> = ({ record }) => (
    <Space size={10}>
        <StatusBadgeTag 
            label="GR" 
            isDone={!!record.is_grossed} 
            color="green" 
            tooltip={record.is_grossed ? "Grossed Complete" : "Pending Grossing"} 
        />
        <StatusBadgeTag 
            label="PR" 
            isDone={!!record.is_processed} 
            color="blue" 
            tooltip={record.is_processed ? "Processed Complete" : "Pending Processing"} 
        />
        <StatusBadgeTag 
            label="SL" 
            isDone={!!record.is_slide_prepped} 
            color="purple" 
            tooltip={record.is_slide_prepped ? "Slides Prepared" : "Pending Slides"} 
        />
        <StatusBadgeTag 
            label="RP" 
            isDone={!!record.is_reported} 
            color="cyan" 
            tooltip={record.is_reported ? "Report Released" : "Pending Report"} 
        />
    </Space>
);
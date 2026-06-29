import React from 'react';
import { List, Checkbox, Badge, Typography } from 'antd';

const { Text } = Typography;

/** roadmap item type */
export interface RoadmapItem {
  label: string;
  done: boolean;
}

/** props type */
interface RoadmapListProps {
  items: RoadmapItem[];
}

const RoadmapList: React.FC<RoadmapListProps> = ({ items }) => {
  return (
    <List
      bordered
      dataSource={items}
      renderItem={(item: RoadmapItem) => (
        <List.Item
          style={{ background: item.done ? '#f6ffed' : '#fff' }}
        >
          <Checkbox checked={item.done} disabled>
            <Text
              delete={item.done}
              type={item.done ? 'secondary' : undefined}
            >
              {item.label}
            </Text>
          </Checkbox>

          {item.done ? (
            <Badge status="success" text="Completed" />
          ) : (
            <Badge status="processing" text="In Progress" />
          )}
        </List.Item>
      )}
    />
  );
};

export default RoadmapList;

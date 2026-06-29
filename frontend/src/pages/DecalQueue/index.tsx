import React, { useState, useCallback, useEffect } from "react";
import { Typography, Space, Button, Input } from "antd";
import { ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";
import PageContainer from "../../components/Layout/PageContainer";
import DecalQueueManager from "../SurgicalBlock/components/DecalQueueManager";
import UserService from "../../services/userService";
import { User } from "../../types/user";

const { Title } = Typography;

const DecalQueuePage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await UserService.getUsers();
      setUsers(data);
    } catch {
      // non-critical
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <PageContainer
      withCard
      cardProps={{ styles: { body: { padding: 0 } } }}
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
          Decal & Extended Fix Queue
        </Title>
      }
      extra={
        <Space>
          <Input.Search
            placeholder="Search by Block / Accession No."
            style={{ width: 300 }}
            allowClear
            enterButton
            onSearch={(value) => setSearchText(value)}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={loadingUsers}
            onClick={() => {
              fetchUsers();
              setSearchText("");
            }}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <DecalQueueManager
        users={users}
        searchText={searchText}
        onRefreshCount={() => {}}
      />
    </PageContainer>
  );
};

export default DecalQueuePage;

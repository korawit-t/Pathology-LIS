import React, { useCallback, useEffect, useState } from "react";
import { Typography, Button, message } from "antd";
import { ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";
import PageContainer from "../../components/Layout/PageContainer";
import HEControlSlideManager from "./components/HEControlSlideManager";
import HEControlSlideService, {
  HEControlSlide,
} from "../../services/heControlSlideService";

const { Title } = Typography;

const HEControlSlidePage: React.FC = () => {
  const [slides, setSlides] = useState<HEControlSlide[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSlides = useCallback(async () => {
    setLoading(true);
    try {
      const data = await HEControlSlideService.getAll({ limit: 50 });
      setSlides(data);
    } catch {
      message.error("Failed to load control slide history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlides();
  }, [fetchSlides]);

  return (
    <PageContainer
      withCard
      title={
        <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center" }}>
          <ExperimentOutlined style={{ marginRight: 12, color: "#595959" }} />
          H&E Control Slide
        </Title>
      }
      extra={
        <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchSlides}>
          Refresh
        </Button>
      }
    >
      <HEControlSlideManager
        slides={slides}
        loading={loading}
        onRefresh={fetchSlides}
      />
    </PageContainer>
  );
};

export default HEControlSlidePage;

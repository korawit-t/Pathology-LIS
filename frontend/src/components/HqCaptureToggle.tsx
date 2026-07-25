import React, { FC } from "react";
import { Switch, Tooltip, Typography } from "antd";
import { HQ_UNSUPPORTED_TOOLTIP } from "../utils/imageCapture";

const { Text } = Typography;

interface HqCaptureToggleProps {
  hqMode: boolean;
  hqSupported: boolean;
  onChange: (checked: boolean) => void;
}

export const HqCaptureToggle: FC<HqCaptureToggleProps> = ({
  hqMode,
  hqSupported,
  onChange,
}) => (
  <div style={{ marginTop: 4 }}>
    <Tooltip title={hqSupported ? undefined : HQ_UNSUPPORTED_TOOLTIP}>
      <Switch size="small" checked={hqMode} onChange={onChange} disabled={!hqSupported} />
    </Tooltip>
    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
      High-quality capture (HQ)
    </Text>
  </div>
);

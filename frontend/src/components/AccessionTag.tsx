import React from "react";
import { Typography } from "antd";
import { ACCESSION_PREFIX_COLOR, CASE_TYPE_COLOR } from "../constants/theme";

export { CASE_TYPE_COLOR };

const { Text } = Typography;

export function accessionColor(accessionNo: string | null | undefined): string {
  const prefix = (accessionNo || "").charAt(0).toUpperCase();
  return ACCESSION_PREFIX_COLOR[prefix] ?? "#1890ff";
}

interface AccessionTagProps {
  value: string | null | undefined;
  strong?: boolean;
  copyable?: boolean;
  style?: React.CSSProperties;
}

const AccessionTag: React.FC<AccessionTagProps> = ({
  value,
  strong = true,
  copyable = false,
  style,
}) => {
  const color = accessionColor(value);
  return (
    <Text
      strong={strong}
      copyable={copyable}
      style={{ color, ...style }}
    >
      {value || "-"}
    </Text>
  );
};

export default AccessionTag;

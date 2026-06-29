import React from 'react';
import { Result } from 'antd';
import type { UserRole } from '../../constants/roles.constants';
import { hasAnyRole } from '../../utils/hasRole';

interface RequireRoleViewProps {
  user: { roles?: string[] } | null | undefined;
  roles: readonly UserRole[];
  children: React.ReactNode;
}

const RequireRoleView: React.FC<RequireRoleViewProps> = ({
  user,
  roles,
  children,
}) => {
  if (!hasAnyRole(user, [...roles])) {
    return (
      <Result
        status="403"
        title="403 Forbidden"
        subTitle="You do not have permission to access this page"
      />
    );
  }

  return <>{children}</>;
};

export default RequireRoleView;

import React from 'react';
import type { UserRole } from '../../constants/roles.constants';
import type { User } from '../../types/user';
import { hasAnyRole } from '../../utils/hasRole';

interface RequireRoleProps {
  user: User | null;
  roles: UserRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const RequireRole: React.FC<RequireRoleProps> = ({
  user,
  roles,
  fallback = null,
  children,
}) => {
  if (!hasAnyRole(user, roles)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default RequireRole;

import type { UserRole } from '../constants/roles.constants';

/**
 * เช็คว่า user มี role ใด role หนึ่งหรือไม่
 */
export function hasRole(
  user: { roles?: string[] } | null | undefined,
  role: UserRole
): boolean {
  if (!user?.roles) return false;
  return (user.roles as UserRole[]).includes(role);
}

/**
 * เช็คหลาย role (OR)
 * hasAnyRole(user, ['admin', 'pathologist'])
 */
export function hasAnyRole(
  user: { roles?: string[] } | null | undefined,
  roles: UserRole[]
): boolean {
  if (!user?.roles) return false;
  return roles.some(r => (user.roles as UserRole[]).includes(r));
}

// Roles that belong to internal lab staff — users with any of these go to /dashboard.
const LAB_ROLES: UserRole[] = [
  'admin', 'lab_manager', 'pathologist', 'cytotechnologist',
  'histo', 'gross', 'immuno', 'financial', 'register',
];

const HOSPITAL_POSITION_KEYWORDS = ['hospital staff', 'hospital'];

/**
 * Returns the correct home route for a user based on their roles and position.
 * - Has "hospital" role OR position name contains "hospital" (and no lab role) → /hospital-results
 * - Has "clinician" role only → /results
 * - Everyone else (lab / admin) → /dashboard
 */
export function getHomeRoute(
  roles: string[] | undefined | null,
  positionName?: string | null,
): string {
  if (!roles || roles.length === 0) return '/dashboard';
  const hasLabRole = roles.some(r => LAB_ROLES.includes(r as UserRole));
  if (hasLabRole) return '/dashboard';

  const isHospitalByRole = roles.includes('hospital');
  const isHospitalByPosition =
    !!positionName &&
    HOSPITAL_POSITION_KEYWORDS.some(kw =>
      positionName.toLowerCase().includes(kw),
    );

  if (isHospitalByRole || isHospitalByPosition) return '/hospital-results';
  if (roles.includes('clinician')) return '/results';
  return '/dashboard';
}

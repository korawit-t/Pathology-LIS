// src/utils/hasRole.ts
import { UserRole } from "../constants/roles.constants";

export const hasAnyRole = (user: { roles?: string[] } | null | undefined, allowedRoles: UserRole[]) => {
  const userRoles = user?.roles as UserRole[]; // Cast ตรงนี้จุดเดียว

  if (!userRoles || !Array.isArray(userRoles)) return false;

  // TypeScript จะไม่บ่น เพราะทั้งสองฝั่งเป็น UserRole[] เหมือนกันแล้ว
  return allowedRoles.some((role) => userRoles.includes(role));
};

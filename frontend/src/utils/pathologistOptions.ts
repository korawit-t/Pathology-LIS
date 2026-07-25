import type { User } from "../types/user";

export interface PathologistOption {
  value: number;
  label: string;
}

/** Converts a list of pathologist Users into the {value,label} shape most
 * Select/consult-request components expect. */
export function toPathologistOptions(pathologists: User[]): PathologistOption[] {
  return pathologists.map((p) => ({ value: p.id, label: p.full_name || "" }));
}

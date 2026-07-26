interface PatientNameParts {
  title?: { title?: string | null } | null;
  name?: string | null;
  ln?: string | null;
}

export function formatPatientName(patient?: PatientNameParts | null): string {
  return (
    [patient?.title?.title, patient?.name, patient?.ln].filter(Boolean).join(" ") || "-"
  );
}

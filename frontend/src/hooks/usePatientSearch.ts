import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import debounce from "lodash/debounce";
import PatientService from "../services/patientService";
import type { Patient } from "../types/patient";
import type { Hospital } from "../types/hospital";
import logger from "../utils/logger";

/**
 * Shared patient-search slice of the case-registration form modals
 * (Surgical/Gyne/Nongyne/Molecular): the `patients` list used to populate
 * PatientSearchField, plus the three handlers that mutate it identically
 * across all four modals. `Extra` lets a caller widen the list to include
 * a lighter patient-ref type returned by `loadEditingData` (e.g. Nongyne's
 * `PatientRef`, Molecular's `MolecularCasePatientRef`) without this hook
 * needing to know about those types.
 */
export function usePatientSearch<Extra = never>(
  form: FormInstance,
  hospitals: Hospital[],
) {
  const [patients, setPatients] = useState<(Patient | Extra)[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const debouncedSearchPatient = useMemo(
    () =>
      debounce(async (value: string) => {
        if (!value || value.trim().length < 3) {
          setPatients([]); // ล้างข้อมูลเมื่อคำค้นหาสั้นเกินไป
          return;
        }
        setIsSearching(true);
        try {
          const results = await PatientService.getPatients(value);
          setPatients(results);
        } catch (err) {
          logger.error("Search Patient Error:", err);
          setPatients([]);
        } finally {
          setIsSearching(false);
        }
      }, 500),
    [],
  );

  const handleSelectSpecificHN = (
    e: MouseEvent,
    hnItem: string,
    patientId: number,
  ) => {
    e.stopPropagation();
    if (hnItem.includes(": ")) {
      const [hName, hNumber] = hnItem.split(": ");
      const targetHospital = hospitals.find((h) => h.name === hName);
      form.setFieldsValue({
        patient_id: patientId,
        hn: hNumber,
        hospital_id: targetHospital?.id,
      });
      message.success(`HN: ${hNumber} (${hName}) selected`);
    }
  };

  const handlePatientCreationSuccess = (newPatient: Patient) => {
    setPatients((prev) => [newPatient, ...prev]);
    form.setFieldsValue({
      patient_id: newPatient.id,
      hn: newPatient.hn || form.getFieldValue("hn"),
    });
    message.success(
      `Patient ${newPatient.name}${newPatient.ln ? " " + newPatient.ln : ""} selected`,
    );
  };

  return {
    patients,
    setPatients,
    isSearching,
    debouncedSearchPatient,
    handleSelectSpecificHN,
    handlePatientCreationSuccess,
  };
}

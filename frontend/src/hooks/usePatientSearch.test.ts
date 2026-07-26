import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { usePatientSearch } from "./usePatientSearch";
import PatientService from "../services/patientService";
import logger from "../utils/logger";

vi.mock("../services/patientService", () => ({
  default: { getPatients: vi.fn() },
}));
vi.mock("../utils/logger", () => ({
  default: { error: vi.fn() },
}));

const mockGetPatients = PatientService.getPatients as ReturnType<typeof vi.fn>;

const makeForm = () => {
  const values: Record<string, unknown> = {};
  return {
    setFieldsValue: vi.fn((v: Record<string, unknown>) => Object.assign(values, v)),
    getFieldValue: vi.fn((name: string) => values[name]),
  } as unknown as import("antd").FormInstance;
};

const hospitals = [{ id: 1, name: "General Hospital" }] as import("../types/hospital").Hospital[];

describe("usePatientSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("debouncedSearchPatient", () => {
    it("clears the list and does not call the service for a query under 3 chars", async () => {
      const { result } = renderHook(() => usePatientSearch(makeForm(), hospitals));

      act(() => {
        result.current.debouncedSearchPatient("ab");
      });

      expect(mockGetPatients).not.toHaveBeenCalled();
      expect(result.current.patients).toEqual([]);
    });

    it("clears the list for a whitespace-only query (trim check)", async () => {
      const { result } = renderHook(() => usePatientSearch(makeForm(), hospitals));

      act(() => {
        result.current.debouncedSearchPatient("   ");
      });

      expect(mockGetPatients).not.toHaveBeenCalled();
    });

    it("searches and populates patients for a valid query", async () => {
      const patient = { id: 1, name: "Somchai", ln: "Jaidee" };
      mockGetPatients.mockResolvedValue([patient]);
      const { result } = renderHook(() => usePatientSearch(makeForm(), hospitals));

      act(() => {
        result.current.debouncedSearchPatient("Somchai");
        result.current.debouncedSearchPatient.flush();
      });

      await waitFor(() => expect(result.current.patients).toEqual([patient]));
      expect(mockGetPatients).toHaveBeenCalledWith("Somchai");
    });

    it("catches a rejected search, logs it, and resets patients instead of throwing", async () => {
      mockGetPatients.mockRejectedValue(new Error("network error"));
      const { result } = renderHook(() => usePatientSearch(makeForm(), hospitals));

      act(() => {
        result.current.debouncedSearchPatient("Somchai");
        result.current.debouncedSearchPatient.flush();
      });

      await waitFor(() => expect(logger.error).toHaveBeenCalled());
      expect(result.current.patients).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });
  });

  describe("handleSelectSpecificHN", () => {
    it("sets patient_id/hn/hospital_id from a matching hospital name", () => {
      const form = makeForm();
      const { result } = renderHook(() => usePatientSearch(form, hospitals));
      const stopPropagation = vi.fn();

      act(() => {
        result.current.handleSelectSpecificHN(
          { stopPropagation } as unknown as React.MouseEvent,
          "General Hospital: HN12345",
          7,
        );
      });

      expect(stopPropagation).toHaveBeenCalled();
      expect(form.setFieldsValue).toHaveBeenCalledWith({
        patient_id: 7,
        hn: "HN12345",
        hospital_id: 1,
      });
    });

    it("does nothing for an hnItem without the expected ': ' separator", () => {
      const form = makeForm();
      const { result } = renderHook(() => usePatientSearch(form, hospitals));

      act(() => {
        result.current.handleSelectSpecificHN(
          { stopPropagation: vi.fn() } as unknown as React.MouseEvent,
          "malformed",
          7,
        );
      });

      expect(form.setFieldsValue).not.toHaveBeenCalled();
    });
  });

  describe("handlePatientCreationSuccess", () => {
    it("prepends the new patient, selects it, and backfills hn when the patient has one", () => {
      const form = makeForm();
      const { result } = renderHook(() => usePatientSearch(form, hospitals));
      const newPatient = { id: 9, name: "Malee", ln: "Somsri", hn: "HN99" };

      act(() => {
        result.current.handlePatientCreationSuccess(newPatient);
      });

      expect(result.current.patients).toEqual([newPatient]);
      expect(form.setFieldsValue).toHaveBeenCalledWith({
        patient_id: 9,
        hn: "HN99",
      });
    });

    it("falls back to the form's existing hn field when the new patient has none", () => {
      const form = makeForm();
      form.setFieldsValue({ hn: "TYPED-HN" });
      const { result } = renderHook(() => usePatientSearch(form, hospitals));
      const newPatient = { id: 9, name: "Malee" };

      act(() => {
        result.current.handlePatientCreationSuccess(newPatient);
      });

      expect(form.setFieldsValue).toHaveBeenLastCalledWith({
        patient_id: 9,
        hn: "TYPED-HN",
      });
    });

    it("prepends ahead of existing search results", () => {
      const form = makeForm();
      const { result } = renderHook(() => usePatientSearch(form, hospitals));
      const existing = { id: 1, name: "Existing" };
      const newPatient = { id: 2, name: "New" };

      act(() => {
        result.current.setPatients([existing]);
      });
      act(() => {
        result.current.handlePatientCreationSuccess(newPatient);
      });

      expect(result.current.patients).toEqual([newPatient, existing]);
    });
  });
});

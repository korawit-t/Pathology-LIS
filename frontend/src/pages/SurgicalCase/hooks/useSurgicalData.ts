import { useState, useCallback, useEffect } from "react";
import { message } from "antd";
import SurgicalCaseService from "../../../services/surgicalCaseService";
import DepartmentService from "../../../services/departmentService";
import { SurgicalCase } from "../../../types/surgical";
import logger from "../../../utils/logger";

export const useSurgicalData = () => {
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [hospitalFilter, setHospitalFilter] = useState<number | undefined>();
  const [schemeFilter, setSchemeFilter] = useState<number | undefined>();
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [reloadKey, setReloadKey] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const res = await DepartmentService.getDepartments(true);
        setDepartments(res);
      } catch (err) {
        logger.error("Dept Load Fail", err);
      }
    };
    fetchDepts();
  }, []);

  const fetchData = useCallback(
    async (page: number, search: string, status?: string, hospital_id?: number, medical_scheme_id?: number, date_from?: string, date_to?: string) => {
      setLoading(true);
      try {
        const skip = (page - 1) * pageSize;
        const res = await SurgicalCaseService.getCases({
          skip,
          limit: pageSize,
          search,
          status,
          hospital_id,
          medical_scheme_id,
          date_from,
          date_to,
        });
        setCases(res.items);
        setTotal(res.total);
      } catch {
        message.error("Failed to load cases");
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        fetchData(1, searchText, statusFilter, hospitalFilter, schemeFilter, dateFrom, dateTo);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText, statusFilter, hospitalFilter, schemeFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData(currentPage, searchText, statusFilter, hospitalFilter, schemeFilter, dateFrom, dateTo);
  }, [currentPage, reloadKey]);

  return {
    cases,
    total,
    currentPage,
    setCurrentPage,
    departments,
    loading,
    setSearchText,
    searchText,
    statusFilter,
    setStatusFilter,
    hospitalFilter,
    setHospitalFilter,
    schemeFilter,
    setSchemeFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    reload: () => setReloadKey((v) => v + 1),
  };
};

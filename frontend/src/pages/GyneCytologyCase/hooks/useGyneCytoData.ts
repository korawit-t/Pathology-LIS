import { useState, useCallback, useEffect } from "react";
import { message } from "antd";
import GyneCytologyCaseService from "../../../services/gyneCytoCaseService";
import { GyneCytologyCase } from "../../../types/gyne-cytology";
import logger from "../../../utils/logger";

export const useGyneCytoData = () => {
  const [cases, setCases] = useState<GyneCytologyCase[]>([]);
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

  const fetchData = useCallback(
    async (page: number, search: string, status?: string, hospital_id?: number, medical_scheme_id?: number, date_from?: string, date_to?: string) => {
      setLoading(true);
      try {
        const skip = (page - 1) * pageSize;
        const res = await GyneCytologyCaseService.getAll({
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
      } catch (err) {
        logger.error("Fetch Gyne Cases Error:", err);
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
    loading,
    searchText,
    setSearchText,
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

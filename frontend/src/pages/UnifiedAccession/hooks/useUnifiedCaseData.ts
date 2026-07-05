import { useState, useCallback, useEffect } from "react";
import { message } from "antd";
import UnifiedCaseService, { UnifiedCaseItem } from "../../../services/unifiedCaseService";
import logger from "../../../utils/logger";

export const useUnifiedCaseData = () => {
  const [items, setItems] = useState<UnifiedCaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [reloadKey, setReloadKey] = useState(0);
  const pageSize = 20;

  const fetchData = useCallback(
    async (page: number, search: string, date_from?: string, date_to?: string) => {
      setLoading(true);
      try {
        const skip = (page - 1) * pageSize;
        const res = await UnifiedCaseService.getAll({
          skip,
          limit: pageSize,
          search,
          date_from,
          date_to,
        });

        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        logger.error("Fetch Unified Cases Error:", err);
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
        fetchData(1, searchText, dateFrom, dateTo);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText, dateFrom, dateTo]);

  useEffect(() => {
    fetchData(currentPage, searchText, dateFrom, dateTo);
  }, [currentPage, reloadKey]);

  return {
    items,
    total,
    currentPage,
    setCurrentPage,
    pageSize,
    loading,
    searchText,
    setSearchText,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    reload: () => setReloadKey((v) => v + 1),
  };
};

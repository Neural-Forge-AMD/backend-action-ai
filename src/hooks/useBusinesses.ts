import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBusinesses, refreshFromEdgeFunction } from "../lib/api";
import type { Business, FetchResult } from "../lib/types";

export interface Notice {
  tone: "success" | "error" | "info";
  text: string;
}

export type LoadStatus = "loading" | "ready" | "error";

export function useBusinesses() {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fetchResults, setFetchResults] = useState<FetchResult[] | null>(null);
  const mounted = useRef(true);

  const loadTable = useCallback(async (): Promise<Business[]> => {
    const rows = await fetchBusinesses();
    const latest = rows
      .map((r) => r.last_fetched_at)
      .filter((t): t is string => Boolean(t))
      .sort()
      .reverse()[0];
    setBusinesses(rows);
    setLastUpdated(latest ?? null);
    return rows;
  }, []);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const results = await refreshFromEdgeFunction();
      const rows = await loadTable();
      if (!mounted.current) return;
      setFetchResults(results);

      const failed = results.filter((r) => r.status !== "ok");
      if (failed.length === 0) {
        setNotice({
          tone: "success",
          text:
            results.length > 0
              ? `All ${results.length} businesses refreshed from Google Maps.`
              : "Refresh complete — no business data was returned.",
        });
      } else if (rows.length > 0) {
        const okCount = results.length - failed.length;
        setNotice({
          tone: "error",
          text: `${okCount} of ${results.length} refreshed. ${failed
            .map((f) => f.name)
            .join(", ")} couldn't be updated — showing the last known data.`,
        });
      } else {
        setNotice({
          tone: "error",
          text: "No business data could be loaded yet. Give it a moment and try again.",
        });
      }
    } catch {
      if (mounted.current) {
        setNotice({
          tone: "error",
          text: "Failed to fetch the latest data. Showing the cached data instead.",
        });
      }
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [loadTable]);

  const loadInitial = useCallback(async () => {
    setStatus("loading");
    try {
      const rows = await loadTable();
      if (!mounted.current) return;
      if (rows.length === 0) {
        // First visit — nothing cached yet, pull fresh data once.
        await doRefresh();
      }
      setStatus("ready");
    } catch {
      if (mounted.current) setStatus("error");
    }
  }, [doRefresh, loadTable]);

  useEffect(() => {
    mounted.current = true;
    void loadInitial();
    return () => {
      mounted.current = false;
    };
  }, [loadInitial]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    businesses,
    status,
    refreshing,
    lastUpdated,
    notice,
    fetchResults,
    doRefresh,
    retry: loadInitial,
    clearNotice,
  };
}

import { useState, useCallback } from "react";

export interface DateFilterState {
  from: string | null;
  to: string | null;
  granularity: "daily" | "weekly" | "monthly";
}

export function useDateFilter() {
  const [filter, setFilter] = useState<DateFilterState>({
    from: null,
    to: null,
    granularity: "daily",
  });

  const applyFilter = useCallback((from: string | null, to: string | null, granularity: DateFilterState["granularity"] = "daily") => {
    setFilter({ from, to, granularity });
  }, []);

  const clearFilter = useCallback(() => {
    setFilter({ from: null, to: null, granularity: "daily" });
  }, []);

  const isActive = !!(filter.from || filter.to);

  const getQueryParams = useCallback((base: Record<string, any> = {}): Record<string, any> => {
    const p = { ...base };
    if (filter.from) p.date_from = filter.from;
    if (filter.to) p.date_to = filter.to;
    return p;
  }, [filter]);

  return { filter, isActive, applyFilter, clearFilter, getQueryParams };
}

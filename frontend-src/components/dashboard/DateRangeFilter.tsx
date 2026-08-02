"use client";
import { useState } from "react";
import { CalendarDays, Clock, X } from "lucide-react";

interface DateRangeFilterProps {
  isActive: boolean;
  onFilter: (from: string | null, to: string | null, granularity: "daily" | "weekly" | "monthly") => void;
  onClear: () => void;
}

export function DateRangeFilter({ isActive, onFilter, onClear }: DateRangeFilterProps) {
  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toDate, setToDate]     = useState("");
  const [toTime, setToTime]     = useState("");
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("daily");

  function buildDatetime(date: string, time: string): string | null {
    if (!date) return null;
    return time ? `${date}T${time}:00` : date;
  }

  function handleApply() {
    onFilter(
      buildDatetime(fromDate, fromTime),
      buildDatetime(toDate, toTime),
      granularity,
    );
  }

  function handleClear() {
    setFromDate(""); setFromTime("");
    setToDate("");   setToTime("");
    setGranularity("daily");
    onClear();
  }

  const inputCls = "rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm";

  return (
    <div className={`flex flex-wrap items-end gap-3 rounded-xl border px-4 py-3 ${isActive ? "border-accent bg-accent/5" : "border-border bg-card"}`}>
      <CalendarDays className="mb-1 h-4 w-4 shrink-0 text-muted" />

      {/* From date + time */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted">From date</label>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className={inputCls} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-[11px] font-medium text-muted">
          <Clock className="h-3 w-3" /> Time
        </label>
        <input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)}
          className={inputCls} />
      </div>

      <span className="mb-2 text-muted">→</span>

      {/* To date + time */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted">To date</label>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className={inputCls} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-[11px] font-medium text-muted">
          <Clock className="h-3 w-3" /> Time
        </label>
        <input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)}
          className={inputCls} />
      </div>

      {/* Group by */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted">Group by</label>
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as any)}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <button onClick={handleApply}
        className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90">
        Apply filter
      </button>
      {isActive && (
        <button onClick={handleClear}
          className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-sm text-muted hover:text-fg">
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
      {isActive && (
        <span className="mb-1 self-end text-xs font-medium text-accent">● Filter active</span>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import type { Ticket } from "@/types";

const PRIORITY: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-500", High: "bg-orange-500/15 text-orange-500",
  Medium: "bg-blue-500/15 text-blue-500", Low: "bg-gray-500/15 text-gray-500",
};
const STATUS: Record<string, string> = {
  Open: "bg-gray-500/15 text-gray-500", Assigned: "bg-blue-500/15 text-blue-500",
  "In Progress": "bg-indigo-500/15 text-indigo-500", Pending: "bg-yellow-500/15 text-yellow-600",
  Resolved: "bg-green-500/15 text-green-500", Closed: "bg-gray-400/15 text-gray-400",
};

export default function ORMQueuePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => { api.get("/tickets").then((r) => setTickets(r.data || [])).catch(() => {}); }, []);
  const rows = filter ? tickets.filter((t) => t.status === filter) : tickets;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ORM Queue</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm">
          <option value="">All statuses</option>
          {Object.keys(STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted">
            <tr>
              <th className="p-3">Title</th><th className="p-3">Priority</th>
              <th className="p-3">Status</th><th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-border/60 hover:bg-black/5 dark:hover:bg-white/5">
                <td className="p-3">
                  <Link href={`/orm/${t.id}`} className="text-accent hover:underline">{t.title}</Link>
                </td>
                <td className="p-3"><Badge className={PRIORITY[t.priority]}>{t.priority}</Badge></td>
                <td className="p-3"><Badge className={STATUS[t.status]}>{t.status}</Badge></td>
                <td className="p-3 text-muted">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted">No tickets</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

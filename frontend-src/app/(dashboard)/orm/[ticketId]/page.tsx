"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui/primitives";

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any>(null);

  function load() {
    api.get(`/tickets/${ticketId}`).then((r) => setTicket(r.data)).catch(() => {});
    api.get(`/tickets/${ticketId}/timeline`).then((r) => setTimeline(r.data || [])).catch(() => {});
    api.get(`/tickets/${ticketId}/suggestions`).then((r) => setSuggestions(r.data)).catch(() => {});
  }
  useEffect(load, [ticketId]);

  async function transition(status: string) {
    await api.put(`/tickets/${ticketId}`, { status }).catch(() => {});
    load();
  }
  async function resolve() { await api.post(`/tickets/${ticketId}/resolve`, {}).catch(() => {}); load(); }

  if (!ticket) return <p className="text-muted">Loading…</p>;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => router.back()} className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-muted hover:text-fg shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-semibold">{ticket.title}</h1>
            </div>
            <Badge className="bg-accent/15 text-accent">{ticket.status}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted">{ticket.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => transition("In Progress")}>Start</Button>
            <Button variant="ghost" onClick={() => transition("Pending")}>Pending</Button>
            <Button onClick={resolve}>Resolve</Button>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium">Timeline</h3>
          <ol className="space-y-2 text-sm">
            {timeline.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="text-muted">{new Date(e.at).toLocaleString()}</span>
                <span>{e.event_type} {e.from ? `${e.from} → ${e.to}` : e.to || ""}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Card>
        <h3 className="mb-3 text-sm font-medium">AI Suggestions</h3>
        {suggestions ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted">Suggested response</div>
              <p>{suggestions.suggested_response}</p>
            </div>
            <div>
              <div className="text-xs text-muted">Suggested action</div>
              <p>{suggestions.suggested_action}</p>
            </div>
            <div>
              <div className="text-xs text-muted">Escalation</div>
              <Badge className="bg-orange-500/15 text-orange-500">{suggestions.suggested_escalation}</Badge>
            </div>
          </div>
        ) : <p className="text-muted">Loading…</p>}
      </Card>
    </div>
  );
}

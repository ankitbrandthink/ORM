"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Radio, BarChart3, FileText, Building2, Settings, ChevronLeft,
  Upload, BellRing, CalendarDays, Users, Layers, Rss, MonitorCheck, MessageSquare,
  CreditCard, FileBarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", desc: "Snapshot & insights", icon: LayoutDashboard },
  { href: "/admin/clients", label: "Clients & Accounts", desc: "Add brands & social pages", icon: Building2 },
  { href: "/listening", label: "Posts & Comments", desc: "Add post links & read sentiment", icon: Radio },
  { href: "/analytics", label: "Social Insights", desc: "Narrative briefing & trends", icon: BarChart3 },
  { href: "/press", label: "Press Sources", desc: "RSS feeds & news channels", icon: Rss },
  { href: "/orm", label: "ORM Queue", desc: "Reply & ticket management", icon: MessageSquare },
  { href: "/reports/daily", label: "Daily Reports", desc: "EOD & sentiment per client", icon: CalendarDays },
  { href: "/reports/eod", label: "EOD Report", desc: "Comment deployment reports — per-client PDF", icon: FileBarChart2 },
  { href: "/reports", label: "Reports", desc: "Download & share PDFs", icon: FileText },
  { href: "/import", label: "Import Data", desc: "Google Sheets & CSV", icon: Upload },
  { href: "/admin/alerts", label: "WA Alerts", desc: "WhatsApp notifications", icon: BellRing },
  { href: "/admin/contacts", label: "Alert Contacts", desc: "Who gets notified", icon: Users },
  { href: "/admin/settings/social-sync", label: "Social Sync", desc: "Auto-fetch posts & comments", icon: Layers },
  { href: "/admin/billing", label: "API Usage & Billing", desc: "Claude token consumption & cost", icon: CreditCard },
  { href: "/admin/sessions", label: "Active Sessions", desc: "Devices & login locations", icon: MonitorCheck },
  { href: "/admin/users", label: "Settings", desc: "Team & access", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={cn("flex flex-col border-r border-border bg-card transition-all duration-200",
      collapsed ? "w-16" : "w-64")}>
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && <span className="font-semibold">ORM CMS</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="text-muted hover:text-fg"
          title={collapsed ? "Expand menu" : "Collapse menu"}>
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {NAV.map(({ href, label, desc, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} title={desc}
              className={cn("flex items-start gap-3 rounded-xl px-3 py-2 transition-colors",
                active ? "bg-accent/10 text-accent" : "text-fg hover:bg-black/5 dark:hover:bg-white/5")}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              {!collapsed && (
                <span className="leading-tight">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-[11px] text-muted">{desc}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="border-t border-border p-3 text-[11px] text-muted">
          Need help? Hover the <b>?</b> icons for plain-English tips.
        </div>
      )}
    </aside>
  );
}

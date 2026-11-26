import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, ClipboardList, CheckSquare, FileText, Send, Users,
  AlertTriangle, Clock, ArrowRight, Activity, ShieldCheck, MessageSquare, Database,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: () => (
    <AppShell allowed="super_admin">
      <AdminDashboard />
    </AppShell>
  ),
});

// ─── Colour tokens ────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string }> = {
  not_started:      { label: "Not Started",      color: "#94a3b8" },
  in_progress:      { label: "In Progress",       color: "#38bdf8" },
  submitted:        { label: "Submitted",          color: "#f59e0b" },
  under_review:     { label: "Under Review",       color: "#f97316" },
  rework_requested: { label: "Rework",             color: "#fb7185" },
  approved:         { label: "Approved",           color: "#34d399" },
  completed:        { label: "Completed",          color: "#10b981" },
  cancelled:        { label: "Cancelled",          color: "#cbd5e1" },
};

const TYPE_COLORS: Record<string, string> = {
  article:        "#6366f1",
  newsletter:     "#f59e0b",
  homepage_banner:"#ec4899",
  article_banner: "#8b5cf6",
  social_post:    "#10b981",
};

// ─── Data interfaces ──────────────────────────────────────────────────────────
interface DashData {
  kpis: { contracts: number; partners: number; tasks: number; pending: number; overdue: number; pendingKpi: number; openRequests: number };
  tasksByStatus: { status: string; count: number }[];
  tasksByType:   { type: string; count: number }[];
  weeklySubmissions: { label: string; count: number }[];
  partnerHealth: { id: string; name: string; total: number; completed: number; overdue: number }[];
  risks: { id: string; partner_name: string; end_date: string; reason: string }[];
  activity: { id: string; title: string; body: string | null; link: string | null; created_at: string }[];
}

// ─── Main component ───────────────────────────────────────────────────────────
function AdminDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    if (!profile) return;
    void loadData(profile.id).then(setData);
  }, [profile]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary text-sm">
        Loading dashboard…
      </div>
    );
  }

  const { kpis, tasksByStatus, tasksByType, weeklySubmissions, partnerHealth, risks, activity } = data;
  const totalActive = tasksByStatus.filter(s => !["completed","cancelled"].includes(s.status)).reduce((a, b) => a + b.count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Super Admin</p>
          <h1 className="mt-0.5 text-3xl font-bold tracking-tight">
            {greeting}, {profile?.full_name?.split(" ")[0] ?? "Admin"} 👋
          </h1>
          <p className="mt-1 text-sm text-text-tertiary">{today}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/manager/all-tasks"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card glass px-3.5 py-2 text-sm font-medium shadow-sm hover:bg-white/60 dark:hover:bg-white/10">
            <ClipboardList className="h-4 w-4" /> All Tasks
          </Link>
          <Link to="/manager/approvals"
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover">
            <CheckSquare className="h-4 w-4" /> Approvals
            {kpis.pending > 0 && <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-xs">{kpis.pending}</span>}
          </Link>
        </div>
      </div>

      {/* At a glance — clickable KPIs */}
      <section className="space-y-3">
        <SectionLabel>At a glance</SectionLabel>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard to="/contracts"          icon={FileText}      label="Active Contracts"  value={kpis.contracts} color="blue"   sub="Currently running" />
          <KpiCard to="/partners"           icon={Building2}     label="Content Partners"  value={kpis.partners}  color="violet" sub="Active partners" />
          <KpiCard to="/manager/all-tasks"  icon={ClipboardList} label="Tasks In Flight"   value={kpis.tasks}     color="amber"  sub="Across all contracts" />
          <KpiCard to="/manager/approvals"  icon={CheckSquare}   label="Awaiting Approval" value={kpis.pending}   color={kpis.pending > 0 ? "rose" : "green"} sub={kpis.pending > 0 ? "Needs review" : "Queue clear"} />
        </div>
      </section>

      {/* Needs attention — action items, each links straight to the fix */}
      <section className="space-y-3">
        <SectionLabel>Needs attention</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AttentionCard to="/manager/approvals"  icon={CheckSquare}    label="Awaiting approval" value={kpis.pending}      okText="All reviewed" />
          <AttentionCard to="/manager/all-tasks"  icon={AlertTriangle}  label="Overdue tasks"     value={kpis.overdue}      okText="On schedule" />
          <AttentionCard to="/manager/kpi-qc"     icon={ShieldCheck}    label="Pending KPI QC"    value={kpis.pendingKpi}   okText="All verified" />
          <AttentionCard to="/manager/requests"   icon={MessageSquare}  label="Partner requests"  value={kpis.openRequests} okText="None open" />
        </div>
      </section>

      {/* Delivery health */}
      <section className="space-y-3">
        <SectionLabel>Delivery health</SectionLabel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Task status donut */}
          <Card className="border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Task Status Breakdown</CardTitle>
                  <p className="text-xs text-text-tertiary">{totalActive} active tasks</p>
                </div>
                <Link to="/manager/all-tasks" className="text-xs font-medium text-primary hover:underline">View all →</Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <DonutChart segments={tasksByStatus} total={tasksByStatus.reduce((a, b) => a + b.count, 0)} />
                <div className="flex flex-col gap-1.5 text-xs min-w-0 w-full">
                  {tasksByStatus.map((s) => (
                    <Link key={s.status} to="/manager/all-tasks"
                      className="flex items-center gap-2 rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-secondary/60">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_META[s.status]?.color ?? "#94a3b8" }} />
                      <span className="text-text-secondary truncate">{STATUS_META[s.status]?.label ?? s.status}</span>
                      <span className="ml-auto font-semibold text-text-primary">{s.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deliverable type bars */}
          <Card className="border-border lg:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Deliverable Mix</CardTitle>
                  <p className="text-xs text-text-tertiary">Active tasks by content type</p>
                </div>
                <Link to="/manager/all-tasks" className="text-xs font-medium text-primary hover:underline">View all →</Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasksByType.length === 0 && <p className="py-6 text-center text-sm text-text-tertiary">No active tasks</p>}
              {tasksByType.map((t) => {
                const max = Math.max(...tasksByType.map((x) => x.count), 1);
                const pct = Math.round((t.count / max) * 100);
                const color = TYPE_COLORS[t.type] ?? "#94a3b8";
                return (
                  <div key={t.type}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium capitalize text-text-primary">{t.type.replace(/_/g, " ")}</span>
                      <span className="text-text-tertiary">{t.count} task{t.count !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Weekly submissions area chart */}
          <Card className="border-border lg:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Submission Volume</CardTitle>
                  <p className="text-xs text-text-tertiary">Last 8 weeks</p>
                </div>
                <Link to="/manager/submissions" className="text-xs font-medium text-primary hover:underline">View all →</Link>
              </div>
            </CardHeader>
            <CardContent>
              <AreaChart data={weeklySubmissions} />
            </CardContent>
          </Card>

          {/* Partner health — rows link to the partner */}
          <Card className="border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">Partner Health</CardTitle>
                <Link to="/partners" className="text-xs font-medium text-primary hover:underline">View all →</Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {partnerHealth.length === 0 && <p className="py-6 text-center text-sm text-text-tertiary">No partners</p>}
              {partnerHealth.map((p, i) => {
                const completionPct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
                return (
                  <Link key={`${p.id}-${i}`} to="/partners/$id" params={{ id: p.id }}
                    className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-secondary/60 transition-colors">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-text-primary truncate max-w-[120px]">{p.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.overdue > 0 && (
                          <span className="flex items-center gap-0.5 text-danger">
                            <AlertTriangle className="h-3 w-3" />{p.overdue}
                          </span>
                        )}
                        <span className="text-text-tertiary">{completionPct}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${completionPct}%`, background: completionPct === 100 ? "#10b981" : completionPct > 60 ? "#38bdf8" : "#f97316" }} />
                      </div>
                      <span className="text-[10px] text-text-tertiary shrink-0">{p.completed}/{p.total}</span>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contracts & activity */}
      <section className="space-y-3">
        <SectionLabel>Contracts &amp; activity</SectionLabel>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Contracts At Risk</CardTitle>
                  <p className="text-xs text-text-tertiary">Ending soon or with overdue tasks</p>
                </div>
                {risks.length > 0 && <Badge className="bg-danger-light text-danger">{risks.length} at risk</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {risks.length === 0 && (
                <div className="flex flex-col items-center py-8 gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                    <CheckSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm text-text-tertiary">All contracts healthy</p>
                </div>
              )}
              {risks.map((c) => (
                <Link key={c.id} to="/contracts/$id" params={{ id: c.id }}
                  className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning-light/30 px-4 py-3 hover:bg-warning-light/50 transition-colors dark:border-warning/30 dark:bg-warning/5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.partner_name}</div>
                    <div className="mt-0.5 text-xs text-text-tertiary">Ends {new Date(c.end_date).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-warning">{c.reason}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-text-tertiary" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <Clock className="h-4 w-4 text-text-tertiary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {activity.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No recent activity</p>}
              {activity.map((n) => (
                <a key={n.id} href={n.link ?? "#"}
                  className="block rounded-md border border-border bg-card px-3 py-2 hover:bg-secondary/50 transition-colors">
                  <div className="text-xs font-medium leading-snug">{n.title}</div>
                  {n.body && <div className="mt-0.5 truncate text-[11px] text-text-tertiary">{n.body}</div>}
                  <div className="mt-0.5 text-[10px] text-text-tertiary">{timeAgo(n.created_at)}</div>
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Jump to */}
      <section className="space-y-3">
        <SectionLabel>Jump to</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { to: "/manager/all-tasks",   icon: ClipboardList, label: "All Tasks" },
            { to: "/manager/submissions", icon: Send,          label: "All Submissions" },
            { to: "/manager/team",        icon: Users,         label: "Team Performance" },
            { to: "/manager/requests",    icon: MessageSquare, label: "Partner Requests" },
            { to: "/partners",            icon: Building2,     label: "Partners" },
            { to: "/admin/users",         icon: Users,         label: "Users" },
            { to: "/admin/backups",       icon: Database,      label: "Backups" },
            { to: "/admin/activity",      icon: Activity,      label: "Activity Log" },
          ].map((q) => (
            <Link key={q.to} to={q.to}
              className="flex items-center gap-2 rounded-xl border border-border bg-card glass card-elevated px-4 py-3 hover:bg-white/50 dark:hover:bg-white/10 transition-colors group">
              <q.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium">{q.label}</span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">{children}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ─── Attention card ───────────────────────────────────────────────────────────
function AttentionCard({ to, icon: Icon, label, value, okText }: {
  to: string; icon: typeof FileText; label: string; value: number; okText: string;
}) {
  const alert = value > 0;
  return (
    <Link to={to}
      className={
        "group flex flex-col gap-2.5 rounded-2xl border p-4 transition-colors " +
        (alert
          ? "border-warning/30 bg-warning-light/40 hover:bg-warning-light/60 dark:bg-warning/5"
          : "border-border bg-card glass card-elevated hover:bg-white/50 dark:hover:bg-white/10")
      }
    >
      <div className="flex items-center justify-between">
        <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl " + (alert ? "bg-warning/15 text-warning" : "bg-success-light text-success")}>
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div>
        <div className={"text-3xl font-bold leading-none tracking-tight " + (alert ? "text-warning" : "text-text-primary")}>{value}</div>
        <div className="mt-1.5 text-sm font-medium text-text-primary">{label}</div>
        <div className="text-[11px] text-text-tertiary">{alert ? "Tap to resolve →" : okText}</div>
      </div>
    </Link>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const COLOR_MAP = {
  blue:   { bg: "bg-blue-100 dark:bg-blue-950/40",   icon: "text-blue-600 dark:text-blue-400" },
  violet: { bg: "bg-violet-100 dark:bg-violet-950/40", icon: "text-violet-600 dark:text-violet-400" },
  amber:  { bg: "bg-amber-100 dark:bg-amber-950/40",  icon: "text-amber-600 dark:text-amber-400" },
  rose:   { bg: "bg-rose-100 dark:bg-rose-950/40",    icon: "text-rose-600 dark:text-rose-400" },
  green:  { bg: "bg-emerald-100 dark:bg-emerald-950/40", icon: "text-emerald-600 dark:text-emerald-400" },
};

function KpiCard({ icon: Icon, label, value, color, sub, to }: {
  icon: typeof FileText; label: string; value: number; color: keyof typeof COLOR_MAP; sub: string; to?: string;
}) {
  const c = COLOR_MAP[color];
  const inner = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-4xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-text-secondary">{sub}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.bg}`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
      {to && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          View <ArrowRight className="h-3 w-3" />
        </div>
      )}
    </CardContent>
  );

  if (to) {
    return (
      <Link to={to} className="group block">
        <Card className="border-border transition-all hover:-translate-y-0.5 hover:border-border-strong">{inner}</Card>
      </Link>
    );
  }
  return <Card className="border-border">{inner}</Card>;
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ segments, total }: { segments: { status: string; count: number }[]; total: number }) {
  const R = 44;
  const C = 2 * Math.PI * R; // circumference ≈ 276.5
  const cx = 56, cy = 56, size = 112;

  let offset = 0;
  const arcs = segments.map((s) => {
    const dash = total > 0 ? (s.count / total) * C : 0;
    const gap = C - dash;
    const rotation = (offset / C) * 360 - 90;
    offset += dash;
    return { ...s, dash, gap, rotation };
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor"
          strokeWidth="14" className="text-secondary opacity-60" />
        {arcs.map((a) => (
          <circle
            key={a.status}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={STATUS_META[a.status]?.color ?? "#94a3b8"}
            strokeWidth="14"
            strokeDasharray={`${a.dash} ${a.gap}`}
            strokeDashoffset={0}
            strokeLinecap="butt"
            transform={`rotate(${a.rotation} ${cx} ${cy})`}
          />
        ))}
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none">{total}</span>
        <span className="text-[10px] text-text-tertiary">total</span>
      </div>
    </div>
  );
}

// ─── Area Chart ───────────────────────────────────────────────────────────────
function AreaChart({ data }: { data: { label: string; count: number }[] }) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-text-tertiary">No submission data yet</p>;
  const W = 480, H = 100;
  const max = Math.max(...data.map((d) => d.count), 1);
  const pts = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * (W - 20) + 10,
    y: H - 10 - ((d.count / max) * (H - 20)),
    ...d,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`;

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" preserveAspectRatio="none" style={{ height: 100 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaGrad)" />
        <path d={line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r="3" fill="#6366f1" stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      {/* X-axis labels */}
      <div className="flex justify-between px-2 text-[10px] text-text-tertiary">
        {data.map((d) => <span key={d.label}>{d.label}</span>)}
      </div>
      {/* Y max hint */}
      <div className="flex justify-end text-[10px] text-text-tertiary">
        Max: {max} submissions/week
      </div>
    </div>
  );
}

// ─── Data fetching ────────────────────────────────────────────────────────────
async function loadData(userId: string): Promise<DashData> {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const eightWeeksAgo = new Date(Date.now() - 56 * 86400000).toISOString();

  const [
    { count: cContracts },
    { count: cPartners },
    { count: cTasks },
    { count: cPending },
    { count: cKpiQc },
    { count: cRequests },
    { data: allTasks },
    { data: recentSubs },
    { data: contracts },
    { data: notifs },
  ] = await Promise.all([
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("content_partners").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("tasks").select("id", { count: "exact", head: true }).not("status", "in", "(completed,cancelled)"),
    supabase.from("submissions").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
    supabase.from("kpi_snapshots").select("id", { count: "exact", head: true }).eq("status", "pending_qc"),
    supabase.from("partner_requests").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    supabase.from("tasks").select("id,status,deliverable_type,due_date,contract_id,is_extra"),
    supabase.from("submissions").select("id,submitted_at").gte("submitted_at", eightWeeksAgo).not("submitted_at", "is", null),
    supabase.from("contracts").select("id,end_date,status,content_partner_id").eq("status", "active"),
    supabase.from("notifications").select("id,title,body,link,created_at").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(15),
  ]);

  // Overdue active tasks (across everything)
  const overdueCount = (allTasks ?? []).filter(
    (t) => t.due_date < today && !["completed", "cancelled"].includes(t.status) && !t.is_extra,
  ).length;

  // Task status breakdown
  const statusCounts = new Map<string, number>();
  for (const t of allTasks ?? []) {
    statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1);
  }
  const tasksByStatus = Object.keys(STATUS_META)
    .filter((s) => statusCounts.has(s))
    .map((s) => ({ status: s, count: statusCounts.get(s)! }));

  // Deliverable type breakdown (active only)
  const typeCounts = new Map<string, number>();
  for (const t of (allTasks ?? []).filter((t) => !["completed", "cancelled"].includes(t.status))) {
    typeCounts.set(t.deliverable_type, (typeCounts.get(t.deliverable_type) ?? 0) + 1);
  }
  const tasksByType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Weekly submissions (last 8 weeks, Thursday-based)
  const weeklySubmissions = buildWeeklyBuckets(recentSubs ?? []);

  // Partner health
  const cList = contracts ?? [];
  const pIds = Array.from(new Set(cList.map((c) => c.content_partner_id)));
  const { data: parts } = pIds.length
    ? await supabase.from("content_partners").select("id,name").in("id", pIds)
    : { data: [] as { id: string; name: string }[] };
  const pMap = new Map((parts ?? []).map((p) => [p.id, p.name]));

  const partnerHealth = await Promise.all(
    cList.slice(0, 6).map(async (c) => {
      const [{ count: total }, { count: completed }, { count: overdue }] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("contract_id", c.id).eq("is_extra", false),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("contract_id", c.id).eq("status", "completed"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("contract_id", c.id).lt("due_date", today).not("status", "in", "(completed,cancelled)").eq("is_extra", false),
      ]);
      return { id: c.content_partner_id, name: pMap.get(c.content_partner_id) ?? "—", total: total ?? 0, completed: completed ?? 0, overdue: overdue ?? 0 };
    })
  );

  // Risk contracts
  const risks: DashData["risks"] = [];
  for (const c of cList) {
    const reasons: string[] = [];
    if (c.end_date < today) reasons.push("Ended but still active");
    else if (c.end_date <= twoWeeks) reasons.push(`Ends ${c.end_date}`);
    const { count: od } = await supabase
      .from("tasks").select("id", { count: "exact", head: true })
      .eq("contract_id", c.id).lt("due_date", today)
      .not("status", "in", "(completed,cancelled)").eq("is_extra", false);
    if ((od ?? 0) > 0) reasons.push(`${od} overdue task${od === 1 ? "" : "s"}`);
    if (reasons.length) risks.push({ id: c.id, partner_name: pMap.get(c.content_partner_id) ?? "—", end_date: c.end_date, reason: reasons.join(" · ") });
  }

  return {
    kpis: {
      contracts: cContracts ?? 0, partners: cPartners ?? 0, tasks: cTasks ?? 0, pending: cPending ?? 0,
      overdue: overdueCount, pendingKpi: cKpiQc ?? 0, openRequests: cRequests ?? 0,
    },
    tasksByStatus,
    tasksByType,
    weeklySubmissions,
    partnerHealth,
    risks: risks.slice(0, 8),
    activity: notifs ?? [],
  };
}

function buildWeeklyBuckets(subs: { submitted_at: string | null }[]): { label: string; count: number }[] {
  const buckets: { label: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(Date.now() - i * 7 * 86400000);
    const weekEnd   = new Date(Date.now() - (i - 1) * 7 * 86400000);
    const count = subs.filter((s) => {
      if (!s.submitted_at) return false;
      const d = new Date(s.submitted_at);
      return d >= weekStart && d < weekEnd;
    }).length;
    const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    buckets.push({ label, count });
  }
  return buckets;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

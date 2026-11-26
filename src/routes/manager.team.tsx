import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { Users, Send, CheckCircle2, TrendingUp, Clock, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/manager/team")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <Team />
    </AppShell>
  ),
});

interface PersonStats {
  id: string; name: string; role: string; avatar_url: string | null;
  assigned: number; submitted: number; approved: number; rejected: number;
  pending: number; approvalRate: number; submissionRate: number; avgDays: number;
}

type SortKey = "submitted" | "approvalRate" | "assigned" | "avgDays" | "name";

function rateColor(pct: number) {
  return pct >= 80 ? "success" : pct >= 50 ? "warning" : "danger";
}

function SummaryCard({ icon: Icon, label, value, sub, tone = "primary" }: {
  icon: typeof Users; label: string; value: string | number; sub?: string;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const cls = { primary: "bg-primary-light text-primary", success: "bg-success-light text-success", warning: "bg-warning-light text-warning", danger: "bg-danger-light text-danger" }[tone];
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm text-text-secondary">{label}</p>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", cls)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-text-tertiary">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ApprovalRing({ pct, hasData }: { pct: number; hasData: boolean }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const fill = hasData ? (pct / 100) * circ : 0;
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const textColor = pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger";
  return (
    <div className="relative flex items-center justify-center">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="5" className="stroke-secondary" />
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="5"
          stroke={color} strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-base font-bold leading-none tabular-nums", textColor)}>
          {hasData ? `${pct}%` : "—"}
        </span>
        <span className="text-[9px] text-text-tertiary mt-0.5">approval</span>
      </div>
    </div>
  );
}

function OutcomeBar({ approved, pending, rejected }: { approved: number; pending: number; rejected: number }) {
  const total = approved + pending + rejected;
  if (total === 0) return <p className="text-xs text-text-tertiary py-1">No submissions yet</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full gap-0.5">
        {approved > 0 && <div className="bg-success rounded-l-full" style={{ width: `${(approved / total) * 100}%` }} />}
        {pending > 0 && <div className="bg-primary" style={{ width: `${(pending / total) * 100}%` }} />}
        {rejected > 0 && <div className="bg-danger rounded-r-full" style={{ width: `${(rejected / total) * 100}%` }} />}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {approved > 0 && <span className="flex items-center gap-1 text-[10px] text-text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />{approved} approved</span>}
        {pending > 0 && <span className="flex items-center gap-1 text-[10px] text-text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />{pending} in review</span>}
        {rejected > 0 && <span className="flex items-center gap-1 text-[10px] text-text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-danger inline-block" />{rejected} rejected</span>}
      </div>
    </div>
  );
}

function MetricRow({ label, pct, barColor, value }: { label: string; pct: number; barColor: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-tertiary">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-text-primary">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Badges({ s }: { s: PersonStats }) {
  const badges: { label: string; color: string }[] = [];
  if (s.submitted > 0 && s.approvalRate === 100) badges.push({ label: "✦ Perfect", color: "bg-success-light text-success" });
  if (s.avgDays > 0 && s.avgDays <= 2) badges.push({ label: "⚡ Fast", color: "bg-warning-light text-warning" });
  if (s.submitted >= 5 && s.approvalRate >= 75) badges.push({ label: "★ Consistent", color: "bg-primary-light text-primary" });
  if (s.submitted >= 10) badges.push({ label: "↑ High output", color: "bg-primary-light text-primary" });
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {badges.map(b => (
        <span key={b.label} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", b.color)}>{b.label}</span>
      ))}
    </div>
  );
}

function PersonCard({ s }: { s: PersonStats }) {
  const color = rateColor(s.approvalRate);
  const headerAccent = color === "success" ? "from-success/10 to-transparent"
    : color === "warning" ? "from-warning/10 to-transparent"
    : "from-danger/10 to-transparent";
  const yieldRate = s.assigned ? Math.round((s.approved / s.assigned) * 100) : 0;
  const barColorApproval = color === "success" ? "bg-success" : color === "warning" ? "bg-warning" : "bg-danger";

  return (
    <Card className="border-border overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
      <CardContent className="p-0">

        {/* Header */}
        <div className={cn("bg-gradient-to-br px-4 pt-4 pb-3", headerAccent)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar src={s.avatar_url} name={s.name} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-snug truncate">{s.name}</p>
                <Badge variant="secondary" className="mt-0.5 text-[10px] capitalize">{s.role.replace(/_/g, " ")}</Badge>
                <Badges s={s} />
              </div>
            </div>
            <ApprovalRing pct={s.approvalRate} hasData={s.submitted > 0} />
          </div>
        </div>

        {/* 4-stat strip */}
        <div className="grid grid-cols-4 border-y border-border bg-secondary/20">
          {[
            { label: "Assigned", val: s.assigned, cls: "text-text-primary" },
            { label: "Submitted", val: s.submitted, cls: "text-text-primary" },
            { label: "Approved", val: s.approved, cls: "text-success" },
            { label: "Rejected", val: s.rejected, cls: s.rejected > 0 ? "text-danger" : "text-text-tertiary" },
          ].map(({ label, val, cls }) => (
            <div key={label} className="flex flex-col items-center py-3 gap-0.5">
              <span className={cn("text-xl font-bold tabular-nums leading-none", cls)}>{val}</span>
              <span className="text-[9px] text-text-tertiary uppercase tracking-wide">{label}</span>
            </div>
          ))}
        </div>

        {/* Outcome bar */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">Outcome breakdown</p>
          <OutcomeBar approved={s.approved} pending={s.pending} rejected={s.rejected} />
        </div>

        {/* Metric bars */}
        <div className="px-4 pt-1 pb-3 space-y-2.5">
          <MetricRow label="Approval rate" pct={s.submitted ? s.approvalRate : 0}
            barColor={barColorApproval} value={s.submitted ? `${s.approvalRate}%` : "—"} />
          <MetricRow label="Submission rate" pct={s.assigned ? s.submissionRate : 0}
            barColor="bg-primary" value={s.assigned ? `${s.submissionRate}%` : "—"} />
          <MetricRow label="Yield (approved / assigned)" pct={s.assigned ? yieldRate : 0}
            barColor="bg-success/70" value={s.assigned ? `${yieldRate}%` : "—"} />
        </div>

        {/* Footer strip */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 bg-secondary/10">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <Clock className="h-3.5 w-3.5" />
            <span>Avg turnaround</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-text-primary tabular-nums">
              {s.avgDays ? `${s.avgDays}d` : "—"}
            </span>
            {s.pending > 0 && (
              <span className="rounded-full bg-primary-light text-primary text-[10px] font-semibold px-2 py-0.5">
                {s.pending} pending review
              </span>
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "submitted", label: "Most submissions" },
  { key: "approvalRate", label: "Approval rate" },
  { key: "assigned", label: "Most assigned" },
  { key: "avgDays", label: "Fastest turnaround" },
  { key: "name", label: "Name A–Z" },
];

function Team() {
  const [stats, setStats] = useState<PersonStats[]>([]);
  const [q, setQ] = useState("");
  const [days, setDays] = useState(90);
  const [sort, setSort] = useState<SortKey>("submitted");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [{ data: tasks }, { data: subs }, { data: profs }] = await Promise.all([
        supabase.from("tasks").select("id,assigned_to,created_at,status").gte("created_at", since),
        supabase.from("submissions").select("id,submitted_by,submitted_at,status,task_id").gte("submitted_at", since),
        supabase.from("profiles").select("id,full_name,email,role,avatar_url"),
      ]);

      const userIds = Array.from(new Set([
        ...(tasks ?? []).map((t: any) => t.assigned_to).filter(Boolean),
        ...(subs ?? []).map((s: any) => s.submitted_by),
      ]));

      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const map = new Map<string, PersonStats>();
      for (const uid of userIds) {
        const p = profMap.get(uid);
        if (!p) continue;
        map.set(uid, { id: uid, name: p.full_name ?? p.email, role: p.role, avatar_url: p.avatar_url ?? null, assigned: 0, submitted: 0, approved: 0, rejected: 0, pending: 0, approvalRate: 0, submissionRate: 0, avgDays: 0 });
      }
      for (const t of (tasks ?? []) as any[]) {
        if (t.assigned_to && map.has(t.assigned_to)) map.get(t.assigned_to)!.assigned += 1;
      }

      const taskMap = new Map((tasks ?? []).map((t: any) => [t.id, t]));
      const daysSumByUser = new Map<string, { sum: number; n: number }>();
      for (const s of (subs ?? []) as any[]) {
        const st = map.get(s.submitted_by);
        if (!st) continue;
        st.submitted += 1;
        if (s.status === "approved") st.approved += 1;
        else if (s.status === "rejected" || s.status === "rework_requested") st.rejected += 1;
        else if (s.status === "submitted" || s.status === "under_review") st.pending += 1;
        if (!s.submitted_at) continue;
        const t: any = taskMap.get(s.task_id);
        if (!t) continue;
        const d = (new Date(s.submitted_at).getTime() - new Date(t.created_at).getTime()) / 86400000;
        const rec = daysSumByUser.get(s.submitted_by) ?? { sum: 0, n: 0 };
        rec.sum += d; rec.n += 1;
        daysSumByUser.set(s.submitted_by, rec);
      }
      for (const [uid, rec] of daysSumByUser.entries()) {
        const st = map.get(uid);
        if (!st) continue;
        st.avgDays = rec.n ? Math.round((rec.sum / rec.n) * 10) / 10 : 0;
      }
      for (const st of map.values()) {
        st.approvalRate = st.submitted ? Math.round((st.approved / st.submitted) * 100) : 0;
        st.submissionRate = st.assigned ? Math.round((st.submitted / st.assigned) * 100) : 0;
      }
      setStats(Array.from(map.values()));
      setLoading(false);
    })();
  }, [days]);

  const filtered = useMemo(() => {
    const list = stats.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()));
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "avgDays") return (a.avgDays || 999) - (b.avgDays || 999);
      return (b[sort] as number) - (a[sort] as number);
    });
  }, [stats, q, sort]);

  const totals = useMemo(() => ({
    submitted: stats.reduce((a, s) => a + s.submitted, 0),
    approved: stats.reduce((a, s) => a + s.approved, 0),
    assigned: stats.reduce((a, s) => a + s.assigned, 0),
    people: stats.length,
  }), [stats]);

  const overallRate = totals.submitted ? Math.round((totals.approved / totals.submitted) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Performance</h1>
        <p className="mt-1 text-sm text-text-secondary">Individual delivery stats — last {days} days</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={Users} label="People active" value={totals.people} sub={`in last ${days} days`} />
        <SummaryCard icon={Send} label="Total submissions" value={totals.submitted} sub={`${totals.assigned} tasks assigned`} />
        <SummaryCard icon={CheckCircle2} label="Approved" value={totals.approved} tone="success"
          sub={`${totals.submitted - totals.approved} still pending`} />
        <SummaryCard icon={TrendingUp} label="Team approval rate" value={`${overallRate}%`}
          tone={overallRate >= 80 ? "success" : overallRate >= 50 ? "warning" : "danger"}
          sub={overallRate >= 80 ? "On track" : overallRate >= 50 ? "Needs attention" : "Critical"} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Search team member…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-52" />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm text-text-primary">
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-text-tertiary" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm text-text-primary">
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <p className="ml-auto text-xs text-text-tertiary">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="py-16 text-center text-sm text-text-tertiary">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-tertiary">No activity in this period.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => <PersonCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}

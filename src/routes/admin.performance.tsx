import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Clock, ShieldCheck, TrendingUp, Users,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/admin/performance")({
  component: () => (
    <AppShell allowed={["super_admin", "manager"]}>
      <PerformancePage />
    </AppShell>
  ),
});

interface TaskRow { id: string; status: string; due_date: string; assigned_to: string | null; deliverable_type: string; contract_id: string; updated_at: string; }
interface SubRow { id: string; status: string; submitted_at: string | null; reviewed_at: string | null; submitted_by: string; task_id: string; }
interface ContractRow { id: string; status: string; end_date: string; content_partner_id: string; }
interface KpiRow { id: string; status: string; created_at: string; qc_approved_at: string | null; }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">{children}</p>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = "primary" }: {
  icon: typeof TrendingUp; label: string; value: string | number; sub?: string;
  tone?: "primary" | "warning" | "danger" | "success";
}) {
  const iconClass = tone === "danger" ? "bg-danger-light text-danger"
    : tone === "warning" ? "bg-warning-light text-warning"
    : tone === "success" ? "bg-success-light text-success"
    : "bg-primary-light text-primary";
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-text-secondary leading-snug">{label}</p>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", iconClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-text-tertiary">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PerformancePage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, { name: string; role: string; avatar_url: string | null }>>(new Map());
  const [partners, setPartners] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void (async () => {
      const [{ data: t }, { data: s }, { data: c }, { data: k }, { data: p }, { data: cp }] = await Promise.all([
        supabase.from("tasks").select("id,status,due_date,assigned_to,deliverable_type,contract_id,updated_at"),
        supabase.from("submissions").select("id,status,submitted_at,reviewed_at,submitted_by,task_id"),
        supabase.from("contracts").select("id,status,end_date,content_partner_id"),
        supabase.from("kpi_snapshots").select("id,status,created_at,qc_approved_at"),
        supabase.from("profiles").select("id,full_name,email,role,avatar_url"),
        supabase.from("content_partners").select("id,name"),
      ]);
      setTasks((t ?? []) as TaskRow[]);
      setSubs((s ?? []) as SubRow[]);
      setContracts((c ?? []) as ContractRow[]);
      setKpis((k ?? []) as KpiRow[]);
      setProfiles(new Map((p ?? []).map((u) => [u.id, { name: u.full_name ?? u.email, role: u.role, avatar_url: u.avatar_url ?? null }])));
      setPartners(new Map((cp ?? []).map((x) => [x.id, x.name])));
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const bottlenecks = useMemo(() => {
    const pendingApproval = subs.filter((s) => s.status === "submitted" || s.status === "under_review").length;
    const overdueTasks = tasks.filter((t) => t.due_date < today && !["completed", "cancelled", "expired"].includes(t.status)).length;
    const pendingKpiQc = kpis.filter((k) => k.status === "pending_qc").length;
    const reworkOpen = tasks.filter((t) => t.status === "rework_requested").length;
    return { pendingApproval, overdueTasks, pendingKpiQc, reworkOpen };
  }, [subs, tasks, kpis, today]);

  const reviewLatency = useMemo(() => {
    const recent = subs.filter((s) => s.status === "approved" && s.submitted_at && s.reviewed_at)
      .map((s) => (new Date(s.reviewed_at!).getTime() - new Date(s.submitted_at!).getTime()) / 3600000);
    if (!recent.length) return 0;
    return Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10;
  }, [subs]);

  const editorPerf = useMemo(() => {
    const map = new Map<string, { name: string; avatar_url: string | null; completed: number; rework: number; pending: number }>();
    for (const t of tasks) {
      if (!t.assigned_to) continue;
      const u = profiles.get(t.assigned_to);
      if (!u || u.role !== "editor") continue;
      const row = map.get(t.assigned_to) ?? { name: u.name, avatar_url: u.avatar_url, completed: 0, rework: 0, pending: 0 };
      if (t.status === "completed" || t.status === "approved") row.completed++;
      else if (t.status === "rework_requested") row.rework++;
      else if (!["cancelled", "expired"].includes(t.status)) row.pending++;
      map.set(t.assigned_to, row);
    }
    return Array.from(map.values()).sort((a, b) => b.completed - a.completed).slice(0, 8);
  }, [tasks, profiles]);

  const partnerHealth = useMemo(() => {
    const map = new Map<string, { name: string; active: number; ending: number; overdue: number }>();
    const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    for (const c of contracts) {
      const name = partners.get(c.content_partner_id) ?? "—";
      const row = map.get(c.content_partner_id) ?? { name, active: 0, ending: 0, overdue: 0 };
      if (c.status === "active") row.active++;
      if (c.status === "active" && c.end_date <= twoWeeks) row.ending++;
      const overdue = tasks.filter((t) => t.contract_id === c.id && t.due_date < today &&
        !["completed", "cancelled", "expired"].includes(t.status)).length;
      row.overdue += overdue;
      map.set(c.content_partner_id, row);
    }
    return Array.from(map.values()).sort((a, b) => b.overdue - a.overdue).slice(0, 8);
  }, [contracts, partners, tasks, today]);

  const deliveryByType = useMemo(() => {
    const types = ["article", "newsletter", "homepage_banner", "article_banner", "social_post"];
    return types.map((t) => {
      const list = tasks.filter((x) => x.deliverable_type === t);
      return {
        type: t.replace(/_/g, " "),
        completed: list.filter((x) => x.status === "completed" || x.status === "approved").length,
        pending: list.filter((x) => !["completed", "cancelled", "expired", "approved"].includes(x.status)).length,
      };
    });
  }, [tasks]);

  const submissionsByDay = useMemo(() => {
    const map = new Map<string, { date: string; submitted: number; approved: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      map.set(d, { date: d.slice(5), submitted: 0, approved: 0 });
    }
    for (const s of subs) {
      if (s.submitted_at) {
        const d = s.submitted_at.slice(0, 10);
        const row = map.get(d); if (row) row.submitted++;
      }
      if (s.reviewed_at && s.status === "approved") {
        const d = s.reviewed_at.slice(0, 10);
        const row = map.get(d); if (row) row.approved++;
      }
    }
    return Array.from(map.values());
  }, [subs]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => ["completed", "approved"].includes(t.status)).length;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Overview</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Performance</h1>
        <p className="mt-1 text-sm text-text-secondary">Cross-team delivery health, bottlenecks, and trends.</p>
      </div>

      {/* Bottleneck alerts */}
      <div className="space-y-3">
        <SectionLabel>Attention needed</SectionLabel>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard icon={Clock} label="Awaiting approval" value={bottlenecks.pendingApproval}
            sub={bottlenecks.pendingApproval > 0 ? "Submissions in queue" : "Queue clear"}
            tone={bottlenecks.pendingApproval > 5 ? "danger" : bottlenecks.pendingApproval > 0 ? "warning" : "success"} />
          <StatCard icon={AlertTriangle} label="Overdue tasks" value={bottlenecks.overdueTasks}
            sub={bottlenecks.overdueTasks > 0 ? "Past their due date" : "All on time"}
            tone={bottlenecks.overdueTasks > 0 ? "danger" : "success"} />
          <StatCard icon={ShieldCheck} label="Pending KPI QC" value={bottlenecks.pendingKpiQc}
            sub={bottlenecks.pendingKpiQc > 0 ? "Need manager sign-off" : "All reviewed"}
            tone={bottlenecks.pendingKpiQc > 0 ? "warning" : "success"} />
          <StatCard icon={CheckCircle2} label="Avg approval time" value={reviewLatency ? `${reviewLatency}h` : "—"}
            sub="Submission → approval" tone="primary" />
        </div>
      </div>

      {/* Overall delivery health */}
      <div className="space-y-3">
        <SectionLabel>Delivery health</SectionLabel>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard icon={TrendingUp} label="Overall completion" value={`${completionRate}%`}
            sub={`${completedTasks} of ${totalTasks} tasks done`}
            tone={completionRate >= 70 ? "success" : completionRate >= 40 ? "warning" : "danger"} />
          <StatCard icon={Users} label="Rework open" value={bottlenecks.reworkOpen}
            sub="Tasks in rework state" tone={bottlenecks.reworkOpen > 0 ? "warning" : "success"} />
          <StatCard icon={CheckCircle2} label="Total submissions" value={subs.length}
            sub={`${subs.filter(s => s.status === "approved").length} approved`} tone="primary" />
          <StatCard icon={TrendingUp} label="Active contracts" value={contracts.filter(c => c.status === "active").length}
            sub={`${contracts.length} total`} tone="primary" />
        </div>
      </div>

      {/* Editor + partner */}
      <div className="space-y-3">
        <SectionLabel>Team &amp; partners</SectionLabel>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Editor performance</CardTitle>
              <p className="text-xs text-text-tertiary">Tasks completed vs. pending vs. rework</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {editorPerf.length === 0 && <p className="py-6 text-center text-sm text-text-tertiary">No editor data yet.</p>}
              {editorPerf.map((e) => {
                const total = e.completed + e.pending + e.rework;
                const pct = total ? Math.round((e.completed / total) * 100) : 0;
                return (
                  <div key={e.name} className="rounded-lg border border-border px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar src={e.avatar_url} name={e.name} size="sm" />
                        <span className="text-sm font-medium">{e.name}</span>
                      </div>
                      <div className="flex gap-1.5 text-xs">
                        <Badge className="bg-success-light text-success border-0">{e.completed} done</Badge>
                        {e.pending > 0 && <Badge variant="secondary">{e.pending} open</Badge>}
                        {e.rework > 0 && <Badge className="bg-warning-light text-warning border-0">{e.rework} rework</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-text-tertiary w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Partner health</CardTitle>
              <p className="text-xs text-text-tertiary">Active contracts, upcoming endings, overdue tasks</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {partnerHealth.length === 0 && <p className="py-6 text-center text-sm text-text-tertiary">No partners yet.</p>}
              {partnerHealth.map((p) => {
                const status = p.overdue > 0 ? "danger" : p.ending > 0 ? "warning" : "success";
                const dotClass = status === "danger" ? "bg-danger" : status === "warning" ? "bg-warning" : "bg-success";
                return (
                  <div key={p.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    <div className="flex gap-1.5 text-xs">
                      <Badge variant="secondary">{p.active} active</Badge>
                      {p.ending > 0 && <Badge className="bg-warning-light text-warning border-0">{p.ending} ending</Badge>}
                      {p.overdue > 0 && <Badge className="bg-danger-light text-danger border-0">{p.overdue} overdue</Badge>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-3">
        <SectionLabel>Trends</SectionLabel>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submission throughput</CardTitle>
              <p className="text-xs text-text-tertiary">Submitted vs. approved — last 14 days</p>
            </CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={submissionsByDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--text-tertiary))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--text-tertiary))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="submitted" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="approved" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Delivery mix by type</CardTitle>
              <p className="text-xs text-text-tertiary">Completed vs. still in progress</p>
            </CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deliveryByType} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="type" tick={{ fontSize: 10 }} stroke="hsl(var(--text-tertiary))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--text-tertiary))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="completed" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="pending" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

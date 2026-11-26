import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Send, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/editor/performance")({
  component: () => (<AppShell allowed="editor"><Perf /></AppShell>),
});

function StatCard({ icon: Icon, label, value, sub, tone = "primary" }: {
  icon: typeof Send; label: string; value: string | number; sub?: string;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const iconClass = tone === "danger" ? "bg-danger-light text-danger"
    : tone === "warning" ? "bg-warning-light text-warning"
    : tone === "success" ? "bg-success-light text-success"
    : "bg-primary-light text-primary";
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-text-secondary">{label}</p>
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

function Perf() {
  const { profile } = useAuth();
  const [m, setM] = useState({ total: 0, approved: 0, rejected: 0, pending: 0, approval: "—", avgDays: "—", completedMonth: 0 });
  const [byMonth, setByMonth] = useState<{ label: string; count: number; approved: number }[]>([]);
  const [byType, setByType] = useState<{ type: string; count: number }[]>([]);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const { data: subs } = await supabase.from("submissions")
        .select("id,status,submission_type,submitted_at,created_at,task_id")
        .eq("submitted_by", profile.id);
      const all = subs ?? [];
      const approved = all.filter((s) => s.status === "approved").length;
      const rejected = all.filter((s) => ["rejected", "rework_requested"].includes(s.status)).length;
      const pending = all.filter((s) => ["submitted", "under_review"].includes(s.status)).length;
      const approval = approved + rejected > 0 ? `${Math.round((approved / (approved + rejected)) * 100)}%` : "—";

      const submitted = all.filter((s) => s.submitted_at);
      let avgDays: string = "—";
      if (submitted.length) {
        const taskIds = submitted.map((s) => s.task_id);
        const { data: tasks } = await supabase.from("tasks").select("id,created_at").in("id", taskIds);
        const tmap = new Map((tasks ?? []).map((t) => [t.id, t]));
        const days = submitted.map((s) => {
          const t = tmap.get(s.task_id);
          if (!t) return 0;
          return (new Date(s.submitted_at!).getTime() - new Date(t.created_at).getTime()) / 86400000;
        });
        avgDays = (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1);
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data: completedTasks } = await supabase.from("tasks").select("id")
        .eq("assigned_to", profile.id).eq("status", "completed").gte("updated_at", monthStart.toISOString());

      setM({ total: all.length, approved, rejected, pending, approval, avgDays, completedMonth: completedTasks?.length ?? 0 });

      const bins: { label: string; count: number; approved: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const inMonth = submitted.filter((s) => {
          const d = new Date(s.submitted_at!); return d >= start && d < end;
        });
        bins.push({
          label: start.toLocaleDateString(undefined, { month: "short" }),
          count: inMonth.length,
          approved: inMonth.filter(s => s.status === "approved").length,
        });
      }
      setByMonth(bins);

      const types: Record<string, number> = {};
      for (const s of submitted) types[s.submission_type] = (types[s.submission_type] ?? 0) + 1;
      setByType(Object.entries(types).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count));
    })();
  }, [profile]);

  const maxBar = Math.max(1, ...byMonth.map((b) => b.count));
  const typeTotal = byType.reduce((a, b) => a + b.count, 0);

  const approvalNum = m.approval === "—" ? null : parseInt(m.approval);
  const approvalTone = approvalNum === null ? "primary" : approvalNum >= 80 ? "success" : approvalNum >= 50 ? "warning" : "danger";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Performance</h1>
        <p className="mt-1 text-sm text-text-secondary">Your submission history and delivery stats</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Send} label="Total submissions" value={m.total} sub={`${m.pending} awaiting review`} />
        <StatCard icon={Trophy} label="Approval rate" value={m.approval}
          sub={`${m.approved} approved · ${m.rejected} rejected`} tone={approvalTone} />
        <StatCard icon={Clock} label="Avg days to submit" value={m.avgDays} sub="From task creation" />
        <StatCard icon={CheckCircle2} label="Completed this month" value={m.completedMonth} tone="success" sub="Tasks marked done" />
      </div>

      {/* Status breakdown */}
      {m.total > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Submission status breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-3 overflow-hidden rounded-full">
              {m.approved > 0 && <div className="bg-success transition-all" style={{ width: `${(m.approved / m.total) * 100}%` }} />}
              {m.pending > 0 && <div className="bg-primary transition-all" style={{ width: `${(m.pending / m.total) * 100}%` }} />}
              {m.rejected > 0 && <div className="bg-danger transition-all" style={{ width: `${(m.rejected / m.total) * 100}%` }} />}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-success" /><span className="text-text-secondary">Approved <strong className="text-text-primary">{m.approved}</strong></span></div>
              <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-primary" /><span className="text-text-secondary">In review <strong className="text-text-primary">{m.pending}</strong></span></div>
              <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-danger" /><span className="text-text-secondary">Rejected / rework <strong className="text-text-primary">{m.rejected}</strong></span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Monthly bar chart */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Submissions by month</CardTitle>
            <p className="text-xs text-text-tertiary">Last 6 months — submitted vs. approved</p>
          </CardHeader>
          <CardContent>
            {byMonth.every(b => b.count === 0)
              ? <p className="py-8 text-center text-sm text-text-tertiary">No submissions yet.</p>
              : (
                <div className="flex h-44 items-end gap-2">
                  {byMonth.map((b) => (
                    <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                      <div className="relative flex h-full w-full flex-col items-center justify-end gap-0.5">
                        <div className="w-full rounded-t-sm bg-success/30 overflow-hidden" style={{ height: `${(b.count / maxBar) * 100}%`, minHeight: b.count ? 4 : 2 }}>
                          <div className="w-full bg-success rounded-t-sm" style={{ height: `${b.count ? (b.approved / b.count) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-text-tertiary">{b.label}</span>
                      <span className="text-xs font-semibold tabular-nums">{b.count}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>

        {/* By type */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By content type</CardTitle>
            <p className="text-xs text-text-tertiary">Share of submissions per deliverable type</p>
          </CardHeader>
          <CardContent>
            {typeTotal === 0
              ? <p className="py-8 text-center text-sm text-text-tertiary">No submissions yet.</p>
              : (
                <div className="space-y-3">
                  {byType.map(({ type, count }) => {
                    const pct = Math.round((count / typeTotal) * 100);
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize font-medium">{type.replace(/_/g, " ")}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="tabular-nums">{count}</Badge>
                            <span className="text-text-tertiary w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-secondary/20">
        <CardContent className="p-4">
          <p className="text-xs text-text-tertiary">
            <strong className="text-text-secondary">Content performance metrics</strong> (clicks, impressions, engagement rate) will appear here once KPI data is available. KPIs are entered by Operations Support and verified by managers after publication.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

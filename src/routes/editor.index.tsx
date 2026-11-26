import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, ListChecks, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/editor/")({
  component: () => (
    <AppShell allowed="editor">
      <EditorDashboard />
    </AppShell>
  ),
});

interface QueueTask {
  id: string;
  title: string;
  deliverable_type: string;
  due_date: string;
  status: string;
  is_extra: boolean;
  contract_id: string;
  partner_name?: string;
}
interface Notif { id: string; title: string; body: string | null; link: string | null; created_at: string; }

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function EditorDashboard() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState({ dueToday: 0, overdue: 0, pendingReview: 0, rework: 0 });
  const [queue, setQueue] = useState<QueueTask[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [weeks, setWeeks] = useState<{ label: string; count: number }[]>([]);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const active = ["not_started", "in_progress", "rework_requested"] as const;

      const { data: dt } = await supabase.from("tasks").select("id", { count: "exact", head: false })
        .eq("assigned_to", profile.id).eq("due_date", today).in("status", active);
      const { data: od } = await supabase.from("tasks").select("id")
        .eq("assigned_to", profile.id).lt("due_date", today)
        .not("status", "in", "(completed,cancelled)");
      const { data: pr } = await supabase.from("submissions").select("id")
        .eq("submitted_by", profile.id).in("status", ["submitted", "under_review"]);
      const { data: rw } = await supabase.from("submissions").select("id")
        .eq("submitted_by", profile.id).in("status", ["rejected", "rework_requested"]);

      setCounts({
        dueToday: dt?.length ?? 0,
        overdue: od?.length ?? 0,
        pendingReview: pr?.length ?? 0,
        rework: rw?.length ?? 0,
      });

      const { data: q } = await supabase.from("tasks")
        .select("id,title,deliverable_type,due_date,status,is_extra,contract_id")
        .eq("assigned_to", profile.id)
        .not("status", "in", "(completed,cancelled)")
        .order("due_date", { ascending: true })
        .limit(8);
      const tasks = (q ?? []) as QueueTask[];
      const cids = Array.from(new Set(tasks.map((t) => t.contract_id)));
      if (cids.length) {
        const { data: cs } = await supabase.from("contracts").select("id,content_partner_id").in("id", cids);
        const pids = Array.from(new Set((cs ?? []).map((c) => c.content_partner_id)));
        const { data: ps } = await supabase.from("content_partners").select("id,name").in("id", pids);
        const pmap = new Map((ps ?? []).map((p) => [p.id, p.name]));
        const cmap = new Map((cs ?? []).map((c) => [c.id, pmap.get(c.content_partner_id) ?? ""]));
        setQueue(tasks.map((t) => ({ ...t, partner_name: cmap.get(t.contract_id) ?? "" })));
      } else {
        setQueue([]);
      }

      const { data: n } = await supabase.from("notifications")
        .select("id,title,body,link,created_at")
        .eq("recipient_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setNotifs((n ?? []) as Notif[]);

      // 4-week activity
      const fourWeeks = new Date(); fourWeeks.setDate(fourWeeks.getDate() - 28);
      const { data: completed } = await supabase.from("tasks")
        .select("updated_at")
        .eq("assigned_to", profile.id).eq("status", "completed")
        .gte("updated_at", fourWeeks.toISOString());
      const bins: { label: string; count: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const start = new Date(); start.setDate(start.getDate() - (i + 1) * 7);
        const end = new Date(); end.setDate(end.getDate() - i * 7);
        const c = (completed ?? []).filter((r) => {
          const d = new Date(r.updated_at);
          return d >= start && d < end;
        }).length;
        bins.push({ label: `W-${i}`, count: c });
      }
      setWeeks(bins);
    })();
  }, [profile]);

  const first = (profile?.full_name || profile?.email || "").split(" ")[0];
  const today = new Date().toISOString().slice(0, 10);
  const maxBar = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Editor workspace</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Welcome back, {first}.</h1>
        <p className="mt-1.5 text-sm text-text-secondary">Here's what needs your attention today.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard to="/editor/tasks" search={{ filter: "due_today" }} icon={Clock} label="Tasks due today" value={counts.dueToday} />
        <KpiCard to="/editor/tasks" search={{ filter: "overdue" }} icon={AlertTriangle} label="Overdue tasks" value={counts.overdue} accent={counts.overdue > 0 ? "danger" : undefined} />
        <KpiCard to="/editor/submissions" search={{ filter: "pending_review" }} icon={ListChecks} label="Pending review" value={counts.pendingReview} />
        <KpiCard to="/editor/submissions" search={{ filter: "rework" }} icon={RotateCcw} label="Rework needed" value={counts.rework} accent={counts.rework > 0 ? "danger" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">My queue</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {queue.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">All caught up. Nothing assigned right now.</p>}
            {queue.map((t) => {
              const overdue = t.due_date < today;
              const dueToday = t.due_date === today;
              const label = t.status === "not_started" ? "Start" : t.status === "in_progress" ? "Continue" : "View";
              return (
                <Link key={t.id} to="/editor/tasks/$id" params={{ id: t.id }} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{t.title}</span>
                      {t.is_extra && <span className="rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">Bonus</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                      <Badge variant="secondary" className="bg-secondary text-text-secondary">{(DELIVERABLE_LABEL_SINGULAR[t.deliverable_type] ?? t.deliverable_type.replace(/_/g, " "))}</Badge>
                      <span>{t.partner_name}</span>
                      <span>·</span>
                      <span className={cn(overdue && "font-semibold text-danger", dueToday && "font-semibold text-warning")}>
                        Due {new Date(t.due_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Badge className="rounded-md border border-border bg-card text-text-secondary hover:bg-card">{label}</Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notifs.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No activity yet.</p>}
            {notifs.map((n) => (
              <a key={n.id} href={n.link ?? "#"} className="block rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-secondary/50">
                <div className="text-sm font-medium leading-tight">{n.title}</div>
                {n.body && <div className="mt-1 truncate text-xs text-text-tertiary">{n.body}</div>}
                <div className="mt-1 text-[11px] text-text-tertiary">{relTime(n.created_at)}</div>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">This month at a glance</CardTitle></CardHeader>
        <CardContent>
          {weeks.every((w) => w.count === 0) ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Complete tasks to see your activity over time.</p>
          ) : (
            <div className="flex h-40 items-end gap-6 px-4">
              {weeks.map((w) => (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-full w-full items-end">
                    <div className="w-full rounded-t-md bg-primary transition-all" style={{ height: `${(w.count / maxBar) * 100}%`, minHeight: w.count > 0 ? "8px" : "2px" }} />
                  </div>
                  <div className="text-[11px] text-text-tertiary">{w.label}</div>
                  <div className="text-xs font-semibold">{w.count}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ to, search, icon: Icon, label, value, accent }: { to: string; search?: Record<string, string>; icon: typeof Clock; label: string; value: number; accent?: "danger" }) {
  return (
    <Link to={to} search={search as never} className="block">
      <Card className={cn("group cursor-pointer border-border bg-card transition-shadow hover:shadow-md", accent === "danger" && "border-danger/40")}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="text-sm font-medium text-text-secondary">{label}</div>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", accent === "danger" ? "bg-danger-light text-danger" : "bg-primary-light text-primary")}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div className={cn("mt-4 text-3xl font-bold tracking-tight", accent === "danger" && value > 0 ? "text-danger" : "text-text-primary")}>{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

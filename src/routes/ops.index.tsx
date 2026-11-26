import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { claimTask } from "@/lib/ops.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, ListChecks, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/ops/")({
  component: () => (
    <AppShell allowed={["ops_support", "super_admin"]}>
      <OpsDashboard />
    </AppShell>
  ),
});

interface Row { id: string; title: string; deliverable_type: string; due_date: string; status: string; is_extra: boolean; contract_id: string; assigned_to: string | null; partner_name?: string; }
interface Notif { id: string; title: string; body: string | null; link: string | null; created_at: string; }

function rel(iso: string) { const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return "just now"; if (d < 3600) return `${Math.floor(d/60)}m ago`; if (d < 86400) return `${Math.floor(d/3600)}h ago`; return `${Math.floor(d/86400)}d ago`; }

function OpsDashboard() {
  const { profile } = useAuth();
  const callClaim = useServerFn(claimTask);
  const [counts, setCounts] = useState({ newsletter: 0, social: 0, thisWeek: 0, rework: 0 });
  const [queue, setQueue] = useState<Row[]>([]);
  const [available, setAvailable] = useState<Row[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);

  async function load() {
    if (!profile) return;
    const active = ["not_started", "in_progress", "rework_requested"] as const;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

    const [nl, sp, tw, rw] = await Promise.all([
      supabase.from("tasks").select("id").eq("assigned_to", profile.id).eq("deliverable_type", "newsletter").in("status", active),
      supabase.from("tasks").select("id").eq("assigned_to", profile.id).eq("deliverable_type", "social_post").in("status", active),
      supabase.from("submissions").select("id").eq("submitted_by", profile.id).gte("submitted_at", weekAgo.toISOString()),
      supabase.from("submissions").select("id").eq("submitted_by", profile.id).in("status", ["rejected", "rework_requested"]),
    ]);
    setCounts({ newsletter: nl.data?.length ?? 0, social: sp.data?.length ?? 0, thisWeek: tw.data?.length ?? 0, rework: rw.data?.length ?? 0 });

    const { data: q } = await supabase.from("tasks")
      .select("id,title,deliverable_type,due_date,status,is_extra,contract_id,assigned_to")
      .eq("assigned_to", profile.id)
      .in("deliverable_type", ["newsletter", "social_post"])
      .in("status", active)
      .order("due_date", { ascending: true })
      .limit(10);
    const queueRows = (q ?? []) as Row[];
    queueRows.sort((a, b) => (a.status === "rework_requested" ? -1 : 1) - (b.status === "rework_requested" ? -1 : 1));

    const { data: av } = await supabase.from("tasks")
      .select("id,title,deliverable_type,due_date,status,is_extra,contract_id,assigned_to")
      .is("assigned_to", null)
      .in("deliverable_type", ["newsletter", "social_post"])
      .eq("status", "not_started")
      .order("due_date", { ascending: true })
      .limit(8);
    const availRows = (av ?? []) as Row[];

    const allCids = Array.from(new Set([...queueRows, ...availRows].map((r) => r.contract_id)));
    if (allCids.length) {
      const { data: cs } = await supabase.from("contracts").select("id,content_partner_id").in("id", allCids);
      const pids = Array.from(new Set((cs ?? []).map((c) => c.content_partner_id)));
      const { data: ps } = await supabase.from("content_partners").select("id,name").in("id", pids);
      const pmap = new Map((ps ?? []).map((p) => [p.id, p.name]));
      const cmap = new Map((cs ?? []).map((c) => [c.id, pmap.get(c.content_partner_id) ?? ""]));
      setQueue(queueRows.map((r) => ({ ...r, partner_name: cmap.get(r.contract_id) ?? "" })));
      setAvailable(availRows.map((r) => ({ ...r, partner_name: cmap.get(r.contract_id) ?? "" })));
    } else { setQueue(queueRows); setAvailable(availRows); }

    const { data: n } = await supabase.from("notifications").select("id,title,body,link,created_at").eq("recipient_id", profile.id).order("created_at", { ascending: false }).limit(10);
    setNotifs((n ?? []) as Notif[]);
  }
  useEffect(() => { void load(); }, [profile]);

  async function onClaim(id: string) {
    try { await callClaim({ data: { task_id: id } }); toast.success("Claimed."); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); }
  }

  const today = new Date().toISOString().slice(0, 10);
  const first = (profile?.full_name || profile?.email || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Operations workspace</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Welcome back, {first}.</h1>
        <p className="mt-1.5 text-sm text-text-secondary">Log URLs for published newsletters and social posts.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi to="/ops/queue" search={{ type: "newsletter" }} icon={Inbox} label="Newsletter tasks awaiting URL" value={counts.newsletter} />
        <Kpi to="/ops/queue" search={{ type: "social_post" }} icon={Inbox} label="Social tasks awaiting URL" value={counts.social} />
        <Kpi to="/ops/submissions" search={{ filter: "this_week" }} icon={Send} label="Submitted this week" value={counts.thisWeek} />
        <Kpi to="/ops/submissions" search={{ filter: "rework" }} icon={RotateCcw} label="Needs rework" value={counts.rework} accent={counts.rework > 0 ? "danger" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">URL queue</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {queue.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No tasks waiting on URL logging. Check the All Newsletters & Socials view for tasks to claim.</p>}
            {queue.map((t) => {
              const overdue = t.due_date < today; const dueToday = t.due_date === today;
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{t.title}</span>{t.is_extra && <span className="rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">Bonus</span>}{t.status === "rework_requested" && <Badge className="bg-danger-light text-danger">Rework</Badge>}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                      <Badge variant="secondary">{t.deliverable_type === "newsletter" ? "Newsletter" : "Social"}</Badge>
                      <span>{t.partner_name}</span><span>·</span>
                      <span className={cn(overdue && "font-semibold text-danger", dueToday && "font-semibold text-warning")}>Due {new Date(t.due_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Link to="/ops/tasks/$id" params={{ id: t.id }}><Button size="sm">Log URL</Button></Link>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Available to claim</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {available.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No unassigned newsletter or social tasks right now.</p>}
            {available.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                    <Badge variant="secondary">{t.deliverable_type === "newsletter" ? "Newsletter" : "Social"}</Badge>
                    <span>{t.partner_name}</span><span>·</span><span>Due {new Date(t.due_date).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void onClaim(t.id)}>Claim</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {notifs.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No activity yet.</p>}
          {notifs.map((n) => (
            <a key={n.id} href={n.link ?? "#"} className="block rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-secondary/50">
              <div className="text-sm font-medium leading-tight">{n.title}</div>
              {n.body && <div className="mt-1 truncate text-xs text-text-tertiary">{n.body}</div>}
              <div className="mt-1 text-[11px] text-text-tertiary">{rel(n.created_at)}</div>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ to, search, icon: Icon, label, value, accent }: { to: string; search?: Record<string, string>; icon: typeof Inbox; label: string; value: number; accent?: "danger" }) {
  return (
    <Link to={to} search={search as never} className="block">
      <Card className={cn("group cursor-pointer border-border bg-card transition-shadow hover:shadow-md", accent === "danger" && "border-danger/40")}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="text-sm font-medium text-text-secondary">{label}</div>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", accent === "danger" ? "bg-danger-light text-danger" : "bg-primary-light text-primary")}><Icon className="h-4 w-4" /></div>
          </div>
          <div className={cn("mt-4 text-3xl font-bold tracking-tight", accent === "danger" && value > 0 ? "text-danger" : "text-text-primary")}>{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
void ListChecks;

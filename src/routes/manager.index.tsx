import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, ListChecks, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/manager/")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <ManagerDashboard />
    </AppShell>
  ),
});

interface PendingSub {
  id: string;
  task_id: string;
  submitted_at: string;
  submitted_by: string;
  task_title: string;
  task_type: string;
  partner_name: string;
  submitter_name: string;
}
interface RiskContract {
  id: string;
  partner_name: string;
  start_date: string;
  end_date: string;
  reason: string;
}
interface Notif { id: string; title: string; body: string | null; link: string | null; created_at: string; }
interface PartnerReq { id: string; subject: string; kind: string; status: string; partner_name: string; created_at: string; }

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function relTime(iso: string) {
  const d = daysSince(iso);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function ManagerDashboard() {
  const { profile } = useAuth();
  const [kpis, setKpis] = useState({ pending: 0, approvedToday: 0, rejected: 0, myDue: 0 });
  const [queue, setQueue] = useState<PendingSub[]>([]);
  const [risks, setRisks] = useState<RiskContract[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [partnerReqs, setPartnerReqs] = useState<PartnerReq[]>([]);
  const [openReqCount, setOpenReqCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      // Contracts I own (or all for admin)
      const isAdmin = profile.role === "super_admin";
      let ownedContractIds: string[] | null = null;
      if (!isAdmin) {
        const { data: ow } = await supabase
          .from("contract_owners")
          .select("contract_id")
          .eq("profile_id", profile.id);
        ownedContractIds = (ow ?? []).map((o) => o.contract_id);
      }

      // Pending submissions
      let pq = supabase
        .from("submissions")
        .select("id,task_id,submitted_by,submitted_at,status,task:tasks!inner(title,deliverable_type,contract_id)")
        .in("status", ["submitted", "under_review"])
        .order("submitted_at", { ascending: true });
      const { data: pending } = await pq;
      type SubRow = {
        id: string; task_id: string; submitted_by: string; submitted_at: string | null; status: string;
        task: { title: string; deliverable_type: string; contract_id: string } | null;
      };
      let pendingRows = (pending ?? []) as unknown as SubRow[];
      if (ownedContractIds !== null) {
        const ids = new Set(ownedContractIds);
        pendingRows = pendingRows.filter((r) => r.task && ids.has(r.task.contract_id));
      }

      // Enrich pending with partner + submitter
      const contractIds = Array.from(new Set(pendingRows.map((r) => r.task?.contract_id).filter(Boolean) as string[]));
      const submitterIds = Array.from(new Set(pendingRows.map((r) => r.submitted_by)));
      const [{ data: cs }, { data: ps }] = await Promise.all([
        contractIds.length
          ? supabase.from("contracts").select("id,content_partner_id").in("id", contractIds)
          : Promise.resolve({ data: [] as Array<{ id: string; content_partner_id: string }> }),
        submitterIds.length
          ? supabase.from("profiles").select("id,full_name,email").in("id", submitterIds)
          : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string }> }),
      ]);
      const partnerIds = Array.from(new Set((cs ?? []).map((c) => c.content_partner_id)));
      const { data: parts } = partnerIds.length
        ? await supabase.from("content_partners").select("id,name").in("id", partnerIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const cMap = new Map((cs ?? []).map((c) => [c.id, c.content_partner_id]));
      const pMap = new Map((parts ?? []).map((p) => [p.id, p.name]));
      const subMap = new Map((ps ?? []).map((s) => [s.id, s.full_name ?? s.email]));

      const queueRows: PendingSub[] = pendingRows.slice(0, 10).map((r) => ({
        id: r.id,
        task_id: r.task_id,
        submitted_at: r.submitted_at ?? "",
        submitted_by: r.submitted_by,
        task_title: r.task?.title ?? "",
        task_type: r.task?.deliverable_type ?? "",
        partner_name: pMap.get(cMap.get(r.task?.contract_id ?? "") ?? "") ?? "—",
        submitter_name: subMap.get(r.submitted_by) ?? "Unknown",
      }));
      setQueue(queueRows);

      // KPIs
      const { count: pendCount } = await (async () => {
        return { count: pendingRows.length };
      })();
      const { data: appT } = await supabase
        .from("submissions")
        .select("id,reviewed_at")
        .eq("reviewed_by", profile.id)
        .eq("status", "approved")
        .gte("reviewed_at", today + "T00:00:00");
      const { data: rejW } = await supabase
        .from("submissions")
        .select("id")
        .eq("reviewed_by", profile.id)
        .in("status", ["rejected", "rework_requested"])
        .gte("reviewed_at", weekAgo);
      const { data: myDue } = await supabase
        .from("tasks")
        .select("id")
        .eq("assigned_to", profile.id)
        .gte("due_date", today)
        .lte("due_date", weekAhead)
        .in("status", ["not_started", "in_progress", "rework_requested"]);

      setKpis({
        pending: pendCount ?? 0,
        approvedToday: appT?.length ?? 0,
        rejected: rejW?.length ?? 0,
        myDue: myDue?.length ?? 0,
      });

      // Risk contracts
      let cQuery = supabase
        .from("contracts")
        .select("id,start_date,end_date,status,content_partner_id")
        .in("status", ["active", "draft"]);
      const { data: contractsAll } = await cQuery;
      let cList = contractsAll ?? [];
      if (ownedContractIds !== null) {
        const ids = new Set(ownedContractIds);
        cList = cList.filter((c) => ids.has(c.id));
      }
      const cPartIds = Array.from(new Set(cList.map((c) => c.content_partner_id)));
      const { data: cParts } = cPartIds.length
        ? await supabase.from("content_partners").select("id,name").in("id", cPartIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const cPartMap = new Map((cParts ?? []).map((p) => [p.id, p.name]));
      const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const riskList: RiskContract[] = [];
      for (const c of cList) {
        const reasons: string[] = [];
        if (c.end_date < today) reasons.push("Ended but still active");
        else if (c.end_date <= twoWeeks) reasons.push(`Ends ${c.end_date}`);
        // overdue tasks
        const { count: od } = await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("contract_id", c.id)
          .lt("due_date", today)
          .not("status", "in", "(completed,cancelled)")
          .eq("is_extra", false);
        if ((od ?? 0) > 0) reasons.push(`${od} overdue tasks`);
        if (reasons.length) {
          riskList.push({
            id: c.id,
            partner_name: cPartMap.get(c.content_partner_id) ?? "—",
            start_date: c.start_date,
            end_date: c.end_date,
            reason: reasons.join(" · "),
          });
        }
      }
      setRisks(riskList.slice(0, 8));

      const { data: n } = await supabase
        .from("notifications")
        .select("id,title,body,link,created_at")
        .eq("recipient_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setNotifs((n ?? []) as Notif[]);

      // Open partner requests (managers/admins see all via RLS)
      const { data: reqs } = await supabase
        .from("partner_requests")
        .select("id,subject,kind,status,content_partner_id,created_at")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false });
      const reqRows = reqs ?? [];
      setOpenReqCount(reqRows.length);
      const reqPartnerIds = Array.from(new Set(reqRows.map((r) => r.content_partner_id)));
      const { data: reqParts } = reqPartnerIds.length
        ? await supabase.from("content_partners").select("id,name").in("id", reqPartnerIds)
        : { data: [] as { id: string; name: string }[] };
      const reqPartMap = new Map((reqParts ?? []).map((p) => [p.id, p.name]));
      setPartnerReqs(
        reqRows.slice(0, 5).map((r) => ({
          id: r.id,
          subject: r.subject,
          kind: r.kind,
          status: r.status,
          partner_name: reqPartMap.get(r.content_partner_id) ?? "Partner",
          created_at: r.created_at,
        })),
      );
    })();
  }, [profile]);

  const first = (profile?.full_name || profile?.email || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Manager workspace</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Welcome back, {first}.</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/manager/approvals" className="block">
          <KpiCard icon={ListChecks} label="Pending review" value={kpis.pending} />
        </Link>
        <KpiCard icon={CheckCircle2} label="Approved today" value={kpis.approvedToday} />
        <KpiCard icon={AlertTriangle} label="Rejected / rework this week" value={kpis.rejected} accent={kpis.rejected > 0 ? "danger" : undefined} />
        <Link to="/manager/my-tasks" className="block">
          <KpiCard icon={Clock} label="My tasks due this week" value={kpis.myDue} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Approval queue</CardTitle>
            <Link to="/manager/approvals" className="text-xs text-primary hover:underline">View all →</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {queue.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No submissions waiting for your review.</p>}
            {queue.map((s) => {
              const d = s.submitted_at ? daysSince(s.submitted_at) : 0;
              return (
                <Link key={s.id} to="/manager/approvals/$submissionId" params={{ submissionId: s.id }}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.task_title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                      <Badge variant="secondary" className="capitalize">{s.task_type.replace(/_/g, " ")}</Badge>
                      <span>{s.partner_name}</span>
                      <span>·</span>
                      <span>{s.submitter_name}</span>
                    </div>
                  </div>
                  <div className={cn("text-xs", d > 3 ? "font-semibold text-danger" : "text-text-tertiary")}>
                    {d === 0 ? "today" : `${d}d waiting`}
                  </div>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Contracts at risk</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {risks.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">All your contracts are on track.</p>}
            {risks.map((c) => (
              <Link key={c.id} to="/contracts/$id" params={{ id: c.id }}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/50">
                <div>
                  <div className="text-sm font-medium">{c.partner_name}</div>
                  <div className="mt-1 text-xs text-text-tertiary">{c.start_date} → {c.end_date}</div>
                </div>
                <div className="text-xs text-warning">{c.reason}</div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              Partner requests
              {openReqCount > 0 && (
                <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary">{openReqCount} open</span>
              )}
            </CardTitle>
            <Link to="/manager/requests" className="text-xs text-primary hover:underline">View all →</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {partnerReqs.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No open partner requests.</p>}
            {partnerReqs.map((r) => (
              <Link key={r.id} to="/manager/requests"
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.subject}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    <Badge variant="secondary" className="capitalize">{r.kind.replace(/_/g, " ")}</Badge>
                    <span>{r.partner_name}</span>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] capitalize text-text-tertiary">{r.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: typeof Clock; label: string; value: number; accent?: "danger" }) {
  return (
    <Card className={cn("border-border bg-card transition-shadow hover:shadow-md", accent === "danger" && "border-danger/40")}>
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
  );
}

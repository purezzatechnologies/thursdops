import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { partnerActOnSubmission } from "@/lib/approvals.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, CheckCircle2, Clock, Activity, ExternalLink, Download, MessageSquarePlus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PendingApproval {
  id: string;
  task_id: string;
  task_title: string;
  deliverable_type: string;
  attachments: { kind: string; url: string; name?: string | null }[];
}

function pendingAtts(s: any): { kind: string; url: string; name?: string | null }[] {
  if (Array.isArray(s?.attachments) && s.attachments.length > 0) return s.attachments;
  const out: { kind: string; url: string; name?: string | null }[] = [];
  if ((s.submission_type === "url" || s.submission_type === "social_link") && s.url) out.push({ kind: s.submission_type, url: s.url });
  if (s.file_url) out.push({ kind: "file", url: s.file_url });
  if (s.screenshot_url) out.push({ kind: "screenshot", url: s.screenshot_url });
  return out;
}

export const Route = createFileRoute("/partner/")({
  component: () => (
    <AppShell allowed="content_partner">
      <PartnerDashboard />
    </AppShell>
  ),
});

interface ContractRow {
  id: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  status: string;
  total_articles: number;
  total_newsletters: number;
  total_homepage_banners: number;
  total_article_banners: number;
  total_social_posts: number;
  delivered: number;
  scheduled: number;
  promised: number;
}
interface RecentSub {
  id: string;
  task_id: string;
  task_title: string;
  deliverable_type: string;
  submission_type: string;
  url: string | null;
  file_url: string | null;
  reviewed_at: string;
}
interface UpcomingTask {
  id: string;
  title: string;
  deliverable_type: string;
  due_date: string;
  status: string;
}
interface PartnerReq {
  id: string;
  subject: string;
  kind: string;
  status: string;
  response: string | null;
  created_at: string;
}

function planTotal(c: ContractRow) {
  return c.total_articles + c.total_newsletters + c.total_homepage_banners + c.total_article_banners + c.total_social_posts;
}

function PartnerDashboard() {
  const { profile } = useAuth();
  const callAct = useServerFn(partnerActOnSubmission);
  const [kpis, setKpis] = useState({ active: 0, completed: 0, inProgress: 0, lastActivity: null as string | null });
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [recent, setRecent] = useState<RecentSub[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingTask[]>([]);
  const [requests, setRequests] = useState<PartnerReq[]>([]);
  const [openReqCount, setOpenReqCount] = useState(0);
  const [partnerName, setPartnerName] = useState<string>("");
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const { data: partnerRow } = await supabase.from("content_partners").select("id,name").maybeSingle();
      if (!partnerRow) return;
      setPartnerName(partnerRow.name);

      const { data: cRaw } = await supabase
        .from("contracts")
        .select("id,plan_type,start_date,end_date,status,total_articles,total_newsletters,total_homepage_banners,total_article_banners,total_social_posts")
        .eq("content_partner_id", partnerRow.id)
        .order("end_date", { ascending: false });

      const cList = cRaw ?? [];
      // Task counts per contract
      const enriched: ContractRow[] = [];
      for (const c of cList) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("status,is_extra")
          .eq("contract_id", c.id)
          .eq("is_extra", false);
        const delivered = (tasks ?? []).filter((t) => t.status === "completed").length;
        const scheduled = (tasks ?? []).filter((t) =>
          ["not_started", "in_progress", "submitted", "under_review", "rework_requested", "approved"].includes(t.status),
        ).length;
        enriched.push({ ...c, delivered, scheduled, promised: planTotal(c as ContractRow) });
      }
      setContracts(enriched);

      const activeCount = enriched.filter((c) => c.status === "active").length;
      const completedCount = enriched.reduce((a, c) => a + c.delivered, 0);
      const inProgressCount = enriched.reduce((a, c) => a + c.scheduled, 0);

      // Recent approved submissions
      const taskIds = enriched.flatMap((c) => c.id);
      // get task ids for partner contracts
      const { data: allTasks } = await supabase
        .from("tasks")
        .select("id,title,deliverable_type,contract_id")
        .in("contract_id", taskIds.length ? taskIds : ["00000000-0000-0000-0000-000000000000"]);
      const tMap = new Map((allTasks ?? []).map((t) => [t.id, t]));
      const tIds = (allTasks ?? []).map((t) => t.id);

      let recentSubs: RecentSub[] = [];
      let upcomingT: UpcomingTask[] = [];
      let lastActivity: string | null = null;
      let pending: PendingApproval[] = [];
      if (tIds.length) {
        const { data: pend } = await supabase
          .from("submissions")
          .select("id,task_id,submission_type,url,file_url,screenshot_url,attachments,status")
          .in("task_id", tIds)
          .eq("status", "sent_to_partner")
          .order("updated_at", { ascending: true });
        pending = (pend ?? []).map((s) => {
          const t = tMap.get(s.task_id);
          return {
            id: s.id,
            task_id: s.task_id,
            task_title: t?.title ?? "Untitled",
            deliverable_type: t?.deliverable_type ?? "",
            attachments: pendingAtts(s),
          };
        });
        const { data: subs } = await supabase
          .from("submissions")
          .select("id,task_id,submission_type,url,file_url,reviewed_at,status")
          .in("task_id", tIds)
          .eq("status", "approved")
          .order("reviewed_at", { ascending: false })
          .limit(10);
        recentSubs = (subs ?? []).map((s) => {
          const t = tMap.get(s.task_id);
          return {
            id: s.id,
            task_id: s.task_id,
            task_title: t?.title ?? "Untitled",
            deliverable_type: t?.deliverable_type ?? "",
            submission_type: s.submission_type,
            url: s.url,
            file_url: s.file_url,
            reviewed_at: s.reviewed_at!,
          };
        });
        lastActivity = recentSubs[0]?.reviewed_at ?? null;

        const today = new Date().toISOString().slice(0, 10);
        const { data: upT } = await supabase
          .from("tasks")
          .select("id,title,deliverable_type,due_date,status")
          .in("contract_id", enriched.filter((c) => c.status === "active").map((c) => c.id))
          .gte("due_date", today)
          .in("status", ["not_started", "in_progress", "rework_requested"])
          .order("due_date", { ascending: true })
          .limit(5);
        upcomingT = upT ?? [];
      }
      setRecent(recentSubs);
      setUpcoming(upcomingT);
      setPendingApprovals(pending);
      setKpis({ active: activeCount, completed: completedCount, inProgress: inProgressCount, lastActivity });

      // My requests (RLS scopes to this partner)
      const { data: reqs } = await supabase
        .from("partner_requests")
        .select("id,subject,kind,status,response,created_at")
        .order("created_at", { ascending: false });
      const reqRows = (reqs ?? []) as PartnerReq[];
      setRequests(reqRows.slice(0, 3));
      setOpenReqCount(reqRows.filter((r) => r.status === "open" || r.status === "in_progress").length);
    })();
  }, [profile, refresh]);

  async function handleDownload(fileUrl: string) {
    const { data, error } = await supabase.storage.from("submissions").createSignedUrl(fileUrl, 60);
    if (error || !data) return;
    window.open(data.signedUrl, "_blank");
  }

  const first = (profile?.full_name || profile?.email || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
          Partner portal · {partnerName}
        </div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Welcome back, {first}.</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={FileText} label="Active contracts" value={String(kpis.active)} />
        <Kpi icon={CheckCircle2} label="Deliverables completed" value={String(kpis.completed)} />
        <Kpi icon={Activity} label="Deliverables in progress" value={String(kpis.inProgress)} />
        <Kpi icon={Clock} label="Last activity" value={kpis.lastActivity ? new Date(kpis.lastActivity).toLocaleDateString() : "—"} />
      </div>

      {pendingApprovals.length > 0 && (
        <Card className="border-warning/40 bg-warning-light/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-warning" />
              Awaiting your final approval
              <span className="ml-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">{pendingApprovals.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.map((p) => (
              <PartnerApprovalItem key={p.id} item={p} callAct={callAct} onDone={() => setRefresh((x) => x + 1)} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Your contracts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {contracts.filter((c) => c.status === "active").length === 0 && (
              <p className="py-8 text-center text-sm text-text-tertiary">No active contracts.</p>
            )}
            {contracts.filter((c) => c.status === "active").map((c) => {
              const unscheduled = Math.max(c.promised - c.delivered - c.scheduled, 0);
              const total = Math.max(c.promised, 1);
              const dPct = (c.delivered / total) * 100;
              const sPct = (c.scheduled / total) * 100;
              const days = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86400000);
              return (
                <div key={c.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{partnerName}</span>
                        <Badge variant="outline" className="capitalize">{c.plan_type}</Badge>
                        <Badge className="bg-success-light text-success border-success/30">Active</Badge>
                      </div>
                      <div className="mt-1 text-xs text-text-tertiary">
                        {c.start_date} → {c.end_date} · {days > 0 ? `${days} days remaining` : "Ends today"}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/partner/contracts/$id" params={{ id: c.id }}>View details</Link>
                    </Button>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-success" style={{ width: `${dPct}%` }} />
                    <div className="-mt-2 h-full bg-primary opacity-60" style={{ width: `${sPct}%`, marginLeft: `${dPct}%` }} />
                  </div>
                  <p className="text-xs text-text-secondary">
                    <span className="font-semibold text-success">{c.delivered} delivered</span> ·{" "}
                    <span className="font-semibold text-primary">{c.scheduled} scheduled</span> ·{" "}
                    <span className="font-semibold text-text-tertiary">{unscheduled} unscheduled</span>{" "}
                    of {c.promised} promised
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent deliverables</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No approved deliverables yet. Your contract is on its way.</p>}
            {recent.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="text-sm font-medium leading-tight">{s.task_title}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-text-tertiary">
                  <Badge variant="outline" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[s.deliverable_type] ?? s.deliverable_type.replace(/_/g, " "))}</Badge>
                  <span>{new Date(s.reviewed_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {s.file_url && (
                    <button onClick={() => handleDownload(s.file_url!)} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                      Download <Download className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Coming up</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">All deliverables scheduled or completed.</p>}
            {upcoming.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                    <Badge variant="outline" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[t.deliverable_type] ?? t.deliverable_type.replace(/_/g, " "))}</Badge>
                    <span>{t.status === "in_progress" ? "In progress" : `Scheduled for ${t.due_date}`}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Your requests
              {openReqCount > 0 && (
                <span className="ml-2 rounded-full bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary">{openReqCount} open</span>
              )}
            </CardTitle>
            <Link to="/partner/requests" className="text-xs text-primary hover:underline">All →</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild size="sm" className="w-full">
              <Link to="/partner/requests">
                <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Raise a request
              </Link>
            </Button>
            {requests.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-tertiary">No requests yet. Ask a question or request a change.</p>
            ) : (
              requests.map((r) => (
                <Link key={r.id} to="/partner/requests"
                  className="block rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-secondary/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium">{r.subject}</div>
                    <span className="shrink-0 text-[11px] capitalize text-text-tertiary">{r.status.replace(/_/g, " ")}</span>
                  </div>
                  {r.response && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-success">
                      <ArrowRight className="h-3 w-3" /> Team replied
                    </div>
                  )}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PartnerApprovalItem({
  item,
  callAct,
  onDone,
}: {
  item: PendingApproval;
  callAct: ReturnType<typeof useServerFn<typeof partnerActOnSubmission>>;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [showBack, setShowBack] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: "approve" | "send_back") {
    setBusy(true);
    try {
      await callAct({ data: { submission_id: item.id, action, comments: comment.trim() || null } });
      toast.success(action === "approve" ? "Approved — thank you!" : "Sent back to the team.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{item.task_title}</div>
        <Badge variant="outline" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[item.deliverable_type] ?? item.deliverable_type.replace(/_/g, " "))}</Badge>
      </div>
      {item.attachments.length > 0 && (
        <div className="space-y-2">
          {item.attachments.map((a, i) => (
            a.kind === "screenshot" ? (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
                <img src={a.url} alt={a.name ?? "Screenshot"} className="max-h-56 rounded border border-border" />
              </a>
            ) : (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-primary underline">
                {a.name ?? a.url} <ExternalLink className="h-3 w-3" />
              </a>
            )
          ))}
        </div>
      )}
      {showBack && (
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What needs to change? (required)"
          maxLength={2000}
          rows={3}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {!showBack ? (
          <>
            <Button size="sm" className="bg-success hover:bg-success/90" disabled={busy} onClick={() => run("approve")}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning-light" disabled={busy} onClick={() => setShowBack(true)}>
              Send back
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning-light" disabled={busy || !comment.trim()} onClick={() => run("send_back")}>
              Confirm send back
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setShowBack(false); setComment(""); }}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <Card className={cn("border-border bg-card transition-shadow hover:shadow-md")}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="text-sm font-medium text-text-secondary">{label}</div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 text-3xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

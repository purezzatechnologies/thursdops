import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { ActivityFeed } from "@/components/activity-feed";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Info } from "lucide-react";
import { openSubmissionForReview, actOnSubmission, requestRecheck } from "@/lib/approvals.functions";

export const Route = createFileRoute("/manager/approvals/$submissionId")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <Review />
    </AppShell>
  ),
});

/** All attachments for a submission, falling back to the legacy single columns. */
function approvalAttachments(sub: SubmissionFull): { kind: string; url: string; name?: string | null }[] {
  if (Array.isArray(sub.attachments) && sub.attachments.length > 0) return sub.attachments;
  const out: { kind: string; url: string; name?: string | null }[] = [];
  if ((sub.submission_type === "url" || sub.submission_type === "social_link") && sub.url) out.push({ kind: sub.submission_type, url: sub.url });
  if (sub.file_url) out.push({ kind: "file", url: sub.file_url });
  if (sub.screenshot_url) out.push({ kind: "screenshot", url: sub.screenshot_url });
  return out;
}

interface SubmissionFull {
  id: string;
  task_id: string;
  status: string;
  submission_type: string;
  url: string | null;
  file_url: string | null;
  screenshot_url: string | null;
  attachments: { kind: string; url: string; name?: string | null }[] | null;
  text_content: string | null;
  notes: string | null;
  metadata: Record<string, string> | null;
  submitted_at: string | null;
  submitted_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comments: string | null;
  reviewing_by: string | null;
  reviewing_since: string | null;
  updated_at: string;
}

function Review() {
  const { submissionId } = Route.useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const callOpen = useServerFn(openSubmissionForReview);
  const callAct = useServerFn(actOnSubmission);
  const callRecheck = useServerFn(requestRecheck);

  const [sub, setSub] = useState<SubmissionFull | null>(null);
  const [task, setTask] = useState<{ id: string; title: string; deliverable_type: string; is_extra: boolean; contract_id: string; due_date: string } | null>(null);
  const [partner, setPartner] = useState<{ id: string; name: string } | null>(null);
  const [submitter, setSubmitter] = useState<{ id: string; name: string; role: string } | null>(null);
  const [authorStats, setAuthorStats] = useState<{ total: number; approved: number; rejected: number; rework: number } | null>(null);
  const [reviewerName, setReviewerName] = useState<string>("");
  const [lockHolder, setLockHolder] = useState<string>("");
  const [history, setHistory] = useState<SubmissionFull[]>([]);
  const [comments, setComments] = useState("");
  const [acting, setActing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: s } = await supabase.from("submissions").select("*").eq("id", submissionId).maybeSingle();
    if (!s) { setLoading(false); return; }
    setSub(s as SubmissionFull);
    const { data: t } = await supabase.from("tasks")
      .select("id,title,deliverable_type,is_extra,contract_id,due_date")
      .eq("id", s.task_id).maybeSingle();
    if (t) setTask({ ...t, contract_id: t.contract_id ?? "" });
    if (t && t.contract_id) {
      const { data: c } = await supabase.from("contracts").select("content_partner_id").eq("id", t.contract_id).maybeSingle();
      if (c) {
        const { data: p } = await supabase.from("content_partners").select("id,name").eq("id", c.content_partner_id).maybeSingle();
        if (p) setPartner(p);
      }
    }
    const { data: u } = await supabase.from("profiles").select("id,full_name,email,role").eq("id", s.submitted_by).maybeSingle();
    if (u) setSubmitter({ id: u.id, name: u.full_name ?? u.email, role: u.role });
    // Author performance: last 90 days of their submissions
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: prev } = await supabase.from("submissions")
      .select("status,submitted_at")
      .eq("submitted_by", s.submitted_by)
      .gte("submitted_at", since);
    if (prev) {
      const reviewed = prev.filter((x: any) => ["approved","rejected","rework_requested"].includes(x.status));
      setAuthorStats({
        total: reviewed.length,
        approved: reviewed.filter((x: any) => x.status === "approved").length,
        rejected: reviewed.filter((x: any) => x.status === "rejected").length,
        rework: reviewed.filter((x: any) => x.status === "rework_requested").length,
      });
    }
    if (s.reviewed_by) {
      const { data: r } = await supabase.from("profiles").select("full_name,email").eq("id", s.reviewed_by).maybeSingle();
      if (r) setReviewerName(r.full_name ?? r.email);
    }
    if (s.reviewing_by && s.reviewing_by !== profile?.id) {
      const { data: r } = await supabase.from("profiles").select("full_name,email").eq("id", s.reviewing_by).maybeSingle();
      if (r) setLockHolder(r.full_name ?? r.email);
    } else {
      setLockHolder("");
    }
    // History (prior submissions on same task)
    const { data: h } = await supabase.from("submissions")
      .select("*")
      .eq("task_id", s.task_id)
      .neq("id", s.id)
      .order("created_at", { ascending: false });
    setHistory((h ?? []) as SubmissionFull[]);
    setComments(s.review_comments ?? "");
    setLoading(false);
  }

  useEffect(() => { if (profile) void load(); /* eslint-disable-next-line */ }, [submissionId, profile]);

  // On mount: open for review (acquires soft lock if not author)
  useEffect(() => {
    if (!profile || !sub) return;
    if (sub.status !== "submitted" && sub.status !== "under_review") return;
    if (sub.submitted_by === profile.id) return;
    void callOpen({ data: { submission_id: submissionId } }).then(() => load()).catch(() => {});
    // eslint-disable-next-line
  }, [profile, sub?.id]);

  const act = async (action: "approve" | "reject" | "request_rework" | "send_to_partner") => {
    if (!sub) return;
    setActing(true);
    try {
      await callAct({
        data: {
          submission_id: sub.id,
          action,
          comments: comments.trim() || null,
          expected_updated_at: sub.updated_at,
        },
      });
      toast.success(
        action === "send_to_partner" ? "Sent to partner for final approval."
        : action === "reject" ? "Rejected."
        : action === "request_rework" ? "Sent back to the requester."
        : "Approved.",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
      await load();
    } finally {
      setActing(false);
    }
  }

  const recheck = async () => {
    if (!sub) return;
    setActing(true);
    try {
      await callRecheck({ data: { submission_id: sub.id, reason: comments.trim() || null } });
      toast.success("Re-check requested. It's back in the queue for another decision.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
      await load();
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-8 text-text-tertiary">Loading…</div>;
  if (!sub || !task) {
    return (
      <Card className="m-8 border-border p-12 text-center">
        <p className="text-sm text-text-secondary">Submission not found.</p>
        <Link to="/manager/approvals" className="mt-3 inline-block text-sm text-primary">← Back to Approval Queue</Link>
      </Card>
    );
  }

  const isAuthor = sub.submitted_by === profile?.id;
  const isManagerApproved = sub.status === "manager_approved";
  const isTerminal = sub.status === "approved" || sub.status === "rejected" || sub.status === "rework_requested" || sub.status === "sent_to_partner";
  const isNegative = sub.status === "rejected" || sub.status === "rework_requested";
  const waitingDays = sub.submitted_at ? Math.floor((Date.now() - new Date(sub.submitted_at).getTime()) / 86400000) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/manager/approvals" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to Approval Queue
      </Link>

      <div>
        <Link to="/manager/all-tasks/$id" params={{ id: task.id }} className="text-2xl font-bold tracking-tight hover:text-primary">{task.title}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[task.deliverable_type] ?? task.deliverable_type.replace(/_/g, " "))}</Badge>
          {task.is_extra && <Badge className="bg-primary-light text-primary">Bonus</Badge>}
          <Badge variant="outline" className="capitalize">{sub.status.replace(/_/g, " ")}</Badge>
          {partner && <Link to="/partners/$id" params={{ id: partner.id }} className="text-primary hover:underline">{partner.name}</Link>}
          <span className="text-text-tertiary">·</span>
          <Link to="/contracts/$id" params={{ id: task.contract_id }} className="text-primary hover:underline">View contract</Link>
          {submitter && (
            <>
              <span className="text-text-tertiary">·</span>
              <span>By {submitter.name} <span className="text-[10px] capitalize text-text-tertiary">({submitter.role.replace(/_/g, " ")})</span></span>
            </>
          )}
          {sub.submitted_at && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className={waitingDays > 3 ? "font-semibold text-danger" : ""}>{waitingDays}d waiting</span>
            </>
          )}
        </div>
      </div>

      {lockHolder && sub.status === "under_review" && !isAuthor && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-light/50 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div>{lockHolder} opened this submission recently. Coordinate before acting.</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3"><CardTitle className="text-base">Submission</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="secondary" className="capitalize">{sub.submission_type.replace(/_/g, " ")}</Badge>
              {sub.submission_type === "text" && sub.text_content && (
                <div className="whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm text-text-primary">{sub.text_content}</div>
              )}
              {sub.submission_type !== "text" && approvalAttachments(sub).length > 0 && (
                <div className="space-y-2">
                  {approvalAttachments(sub).map((a, i) => (
                    a.kind === "screenshot" ? (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
                        <img src={a.url} alt={a.name ?? "Screenshot"} className="max-h-96 rounded-md border border-border" />
                      </a>
                    ) : a.kind === "file" ? (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block text-primary underline">{a.name ?? "Download file"}</a>
                    ) : (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block break-all text-base text-primary underline">{a.url}</a>
                    )
                  ))}
                </div>
              )}
              {sub.metadata && Object.keys(sub.metadata).length > 0 && (
                <div className="rounded-md bg-secondary/40 p-3 text-xs">
                  {Object.entries(sub.metadata).map(([k, v]) => (
                    <div key={k}><span className="text-text-tertiary capitalize">{k.replace(/_/g, " ")}:</span> {String(v)}</div>
                  ))}
                </div>
              )}
              {sub.notes && (
                <div className="rounded-md bg-secondary/40 p-3 text-sm whitespace-pre-wrap">{sub.notes}</div>
              )}
            </CardContent>
          </Card>

          {history.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3"><CardTitle className="text-base">Previous submissions ({history.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {history.map((h) => (
                  <details key={h.id} className="rounded-md border border-border bg-card p-3 text-xs">
                    <summary className="flex cursor-pointer items-center justify-between">
                      <span className="font-medium">{h.submitted_at ? new Date(h.submitted_at).toLocaleString() : "Draft"}</span>
                      <Badge variant="outline" className="capitalize">{h.status.replace(/_/g, " ")}</Badge>
                    </summary>
                    {h.review_comments && <div className="mt-2 rounded bg-secondary p-2">"{h.review_comments}"</div>}
                    {h.url && <div className="mt-1"><a href={h.url} target="_blank" rel="noreferrer" className="text-primary underline">{h.url}</a></div>}
                  </details>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-border sticky top-4">
            <CardHeader className="pb-3"><CardTitle className="text-base">Decision</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isAuthor ? (
                isNegative ? (
                  <>
                    <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
                      <div className="font-medium capitalize">{sub.status.replace(/_/g, " ")}</div>
                      {reviewerName && <div className="text-xs text-text-tertiary">By {reviewerName}</div>}
                      {sub.review_comments && <div className="mt-2 text-xs">"{sub.review_comments}"</div>}
                    </div>
                    <Textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Why should this decision be rechecked?"
                      maxLength={2000}
                      rows={3}
                    />
                    <Button variant="outline" className="w-full" disabled={acting} onClick={recheck}>
                      Request re-check
                    </Button>
                    <div className="flex items-start gap-1.5 text-[11px] text-text-tertiary">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>Think this was a mistake? This sends it back to the queue for another manager to reconsider.</span>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-warning/30 bg-warning-light/50 p-3 text-sm text-text-primary">
                    You submitted this work. Another manager must review it.
                  </div>
                )
              ) : isManagerApproved ? (
                <>
                  <div className="rounded-md border border-success/30 bg-success-light/50 p-3 text-sm text-text-primary">
                    Approved{reviewerName ? ` by ${reviewerName}` : ""}. Ready to send to the partner for final approval.
                  </div>
                  <Textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Optional note (required if sending back for rework)"
                    maxLength={2000}
                    rows={3}
                  />
                  <Button className="w-full bg-success hover:bg-success/90" disabled={acting} onClick={() => act("send_to_partner")}>
                    Send to Partner
                  </Button>
                  <Button variant="outline" className="w-full border-warning/40 text-warning hover:bg-warning-light" disabled={acting} onClick={() => act("request_rework")}>
                    Request Rework
                  </Button>
                  <Button variant="outline" className="w-full border-danger/40 text-danger hover:bg-danger-light" disabled={acting} onClick={() => act("reject")}>
                    Reject
                  </Button>
                  <div className="flex items-start gap-1.5 pt-2 text-[11px] text-text-tertiary">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span><b>Send to Partner</b>: the partner gives final sign-off.<br />Or send it back for rework / reject if needed.</span>
                  </div>
                </>
              ) : isTerminal ? (
                <>
                  <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
                    <div className="font-medium capitalize">{sub.status.replace(/_/g, " ")}</div>
                    {reviewerName && <div className="text-xs text-text-tertiary">By {reviewerName}</div>}
                    {sub.review_comments && <div className="mt-2 text-xs">"{sub.review_comments}"</div>}
                  </div>
                  {isNegative && (
                    <>
                      <Textarea
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Reason for re-check (optional)"
                        maxLength={2000}
                        rows={3}
                      />
                      <Button variant="outline" className="w-full" disabled={acting} onClick={recheck}>
                        Request re-check
                      </Button>
                      <div className="flex items-start gap-1.5 text-[11px] text-text-tertiary">
                        <Info className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>Looks like a mistaken {sub.status === "rejected" ? "rejection" : "rework request"}? This sends it back to the queue for another decision.</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Comments (required for Reject / Request Rework)"
                    maxLength={2000}
                    rows={4}
                  />
                  <Button className="w-full bg-success hover:bg-success/90" disabled={acting} onClick={() => act("approve")}>
                    Approve
                  </Button>
                  <Button variant="outline" className="w-full border-warning/40 text-warning hover:bg-warning-light" disabled={acting} onClick={() => act("request_rework")}>
                    Request Rework
                  </Button>
                  <Button variant="outline" className="w-full border-danger/40 text-danger hover:bg-danger-light" disabled={acting} onClick={() => act("reject")}>
                    Reject
                  </Button>
                  <div className="flex items-start gap-1.5 pt-2 text-[11px] text-text-tertiary">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span><b>Approve</b>: signs off and updates the requester — then you can Send to Partner for final approval.<br /><b>Request Rework</b>: needs changes — goes back to the requester.<br /><b>Reject</b>: not usable — task returns to Not Started.</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {submitter && authorStats && authorStats.total > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3"><CardTitle className="text-base">Author context</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-text-secondary">{submitter.name} — last 90 days</div>
                <div className="flex items-center justify-between"><span className="text-text-tertiary">Reviewed</span><span className="font-semibold">{authorStats.total}</span></div>
                <div className="flex items-center justify-between"><span className="text-success">Approved</span><span className="font-semibold">{authorStats.approved} ({Math.round(authorStats.approved/authorStats.total*100)}%)</span></div>
                <div className="flex items-center justify-between"><span className="text-warning">Rework</span><span className="font-semibold">{authorStats.rework}</span></div>
                <div className="flex items-center justify-between"><span className="text-danger">Rejected</span><span className="font-semibold">{authorStats.rejected}</span></div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <ActivityFeed linkPrefixes={[`/manager/approvals/${submissionId}`]} title="Submission activity" />
    </div>
  );
}

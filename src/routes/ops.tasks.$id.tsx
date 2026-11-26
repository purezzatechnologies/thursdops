import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { ActivityFeed } from "@/components/activity-feed";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { saveSubmission } from "@/lib/submissions.functions";
import { claimTask } from "@/lib/ops.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/ops/tasks/$id")({
  component: () => (<AppShell allowed={["ops_support", "super_admin"]}><Workspace /></AppShell>),
});

interface Submission { id: string; submitted_by: string; submission_type: string; url: string | null; notes: string | null; metadata: Record<string, string> | null; status: string; submitted_at: string | null; created_at: string; reviewed_by: string | null; review_comments: string | null; }

function Workspace() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const callSave = useServerFn(saveSubmission);
  const callClaim = useServerFn(claimTask);

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any | null>(null);
  const [partner, setPartner] = useState<{ id: string; name: string } | null>(null);
  const [assigneeName, setAssigneeName] = useState<string>("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [type, setType] = useState<"url" | "social_link">("url");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [contentRole, setContentRole] = useState<string>("");
  const [issueId, setIssueId] = useState("");
  const [platform, setPlatform] = useState<string>("");
  const [postFormat, setPostFormat] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data: t } = await supabase.from("tasks")
      .select("id,title,brief,deliverable_type,status,priority,due_date,is_extra,contract_id,assigned_to")
      .eq("id", id).maybeSingle();
    if (!t) { setTask(null); setLoading(false); return; }
    setTask(t);

    if (t.assigned_to) {
      const { data: a } = await supabase.from("profiles").select("full_name,email").eq("id", t.assigned_to).maybeSingle();
      setAssigneeName(a?.full_name ?? a?.email ?? "");
    } else setAssigneeName("");

    if (t.contract_id) {
      const { data: c } = await supabase.from("contracts").select("content_partner_id").eq("id", t.contract_id).maybeSingle();
      if (c) {
        const { data: p } = await supabase.from("content_partners").select("id,name").eq("id", c.content_partner_id).maybeSingle();
        if (p) setPartner(p);
      }
    }

    const { data: subs } = await supabase.from("submissions")
      .select("id,submission_type,url,notes,metadata,status,submitted_at,created_at,reviewed_by,review_comments")
      .eq("task_id", id).order("created_at", { ascending: false });
    const list = (subs ?? []) as Submission[];
    setSubmissions(list);

    const mine = list.find((s) => s.status === "draft") ?? list.find((s) => s.status === "rejected" || s.status === "rework_requested");
    if (mine) {
      setType((mine.submission_type === "social_link" ? "social_link" : "url"));
      setUrl(mine.url ?? "");
      setNotes(mine.notes ?? "");
      const md = mine.metadata ?? {};
      setContentRole(md.newsletter_content_role ?? "");
      setIssueId(md.issue_identifier ?? "");
      setPlatform(md.social_platform ?? "");
      setPostFormat(md.post_format ?? "");
    } else {
      setType(t.deliverable_type === "social_post" ? "social_link" : "url");
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [id, profile]);

  async function onClaim() {
    try { await callClaim({ data: { task_id: id } }); toast.success("Claimed."); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); }
  }

  async function save(intent: "draft" | "submit") {
    setSaving(true);
    try {
      const metadata: Record<string, string> = {};
      if (task.deliverable_type === "newsletter") {
        if (contentRole) metadata.newsletter_content_role = contentRole;
        if (issueId) metadata.issue_identifier = issueId;
      } else if (task.deliverable_type === "social_post") {
        if (platform) metadata.social_platform = platform;
        if (postFormat) metadata.post_format = postFormat;
      }
      await callSave({ data: { task_id: id, submission_type: type, url: url || null, notes: notes || null, metadata: Object.keys(metadata).length ? metadata : null, intent } as any });
      toast.success(intent === "draft" ? "Draft saved." : "Submitted for approval.");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-text-tertiary">Loading…</div>;
  if (!task) return <Card className="m-8 border-border p-12 text-center"><p className="text-sm text-text-secondary">Task not found.</p></Card>;

  const isMine = task.assigned_to === profile?.id;
  const isUnassigned = !task.assigned_to;
  const canClaim = isUnassigned && task.status === "not_started" && profile?.role === "ops_support";
  const activeSub = submissions.find((s) => s.submitted_by === (profile?.id as any)) ?? submissions[0];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date < today && !["completed", "cancelled"].includes(task.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/ops/queue" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to URL Queue</Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[task.deliverable_type] ?? task.deliverable_type.replace(/_/g, " "))}</Badge>
          {task.is_extra && <Badge className="bg-primary-light text-primary">Bonus</Badge>}
          <Badge>{task.status.replace(/_/g, " ")}</Badge>
          {partner && <a href={`/partners/${partner.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{partner.name}</a>}
          <span className="text-text-tertiary">·</span>
          <a href={`/contracts/${task.contract_id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">View contract</a>
          <span className="text-text-tertiary">·</span>
          <span className={overdue ? "font-semibold text-danger" : ""}>Due {new Date(task.due_date).toLocaleDateString()}</span>
          <span className="text-text-tertiary">·</span>
          <span className="text-text-secondary">Assignee: {assigneeName || "Unassigned"}</span>
          {canClaim && <Button size="sm" variant="outline" onClick={() => void onClaim()}>Claim</Button>}
        </div>
      </div>

      {!isMine && !isUnassigned && (
        <Card className="border-warning/40 bg-warning-light p-4 text-sm text-warning-foreground">
          This task is assigned to {assigneeName}. You can view but not submit. Use the All Newsletters & Socials view to claim unassigned tasks instead.
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Brief</CardTitle></CardHeader>
        <CardContent><div className="whitespace-pre-wrap text-sm text-text-secondary">{task.brief || <span className="text-text-tertiary">No brief provided.</span>}</div></CardContent>
      </Card>

      {submissions.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Submission history</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {submissions.map((s) => (
              <div key={s.id} className="rounded-md border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : `Draft saved ${new Date(s.created_at).toLocaleDateString()}`}</span>
                  <Badge>{s.status.replace(/_/g, " ")}</Badge>
                </div>
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-primary hover:underline">{s.url}</a>}
                {s.review_comments && <div className="mt-2 rounded bg-secondary p-2 text-text-secondary">"{s.review_comments}"</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isMine && (
        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">Log the URL</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" checked={type === "url"} onChange={() => setType("url")} /> URL</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={type === "social_link"} onChange={() => setType("social_link")} /> Social link</label>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Published URL *</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>

            {task.deliverable_type === "newsletter" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">Newsletter content role *</label>
                  <Select value={contentRole} onValueChange={setContentRole}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="banner">Banner</SelectItem>
                      <SelectItem value="article_promotion">Article Promotion</SelectItem>
                      <SelectItem value="top_read_link">Top Read Link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Issue identifier</label>
                  <Input value={issueId} onChange={(e) => setIssueId(e.target.value)} placeholder="Newsletter #142 — Week 20" maxLength={200} />
                </div>
              </>
            )}

            {task.deliverable_type === "social_post" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">Platform *</label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select platform" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="pinterest">Pinterest</SelectItem>
                      <SelectItem value="twitter">Twitter / X</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Post format</label>
                  <Select value={postFormat} onValueChange={setPostFormat}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select format" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="photo">Photo</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="carousel">Carousel</SelectItem>
                      <SelectItem value="reel">Reel</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Optional notes for the reviewer." />

            <div className="flex gap-2">
              <Button variant="outline" disabled={saving} onClick={() => void save("draft")}>Save as Draft</Button>
              <Button disabled={saving} onClick={() => void save("submit")}>Submit for Approval</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Status</CardTitle></CardHeader>
        <CardContent className="text-sm text-text-secondary">
          {!activeSub && "No submission yet."}
          {activeSub?.status === "draft" && "Draft saved. Submit when ready."}
          {activeSub?.status === "submitted" && `Submitted on ${activeSub.submitted_at ? new Date(activeSub.submitted_at).toLocaleString() : ""}. Waiting for review.`}
          {activeSub?.status === "approved" && `Approved. Nothing more to do here.`}
          {(activeSub?.status === "rejected" || activeSub?.status === "rework_requested") && `Rework requested. Comments: "${activeSub.review_comments ?? ""}". Update and resubmit.`}
        </CardContent>
      </Card>
      <ActivityFeed linkPrefixes={[`/ops/tasks/${id}`, `/manager/approvals/`]} title="Task activity" />
    </div>
  );
}

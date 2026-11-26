import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { ActivityFeed } from "@/components/activity-feed";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { saveSubmission } from "@/lib/submissions.functions";
import { requestRecheck } from "@/lib/approvals.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/editor/tasks/$id")({
  component: () => (
    <AppShell allowed="editor">
      <Workspace />
    </AppShell>
  ),
});

type SubmissionType = "url" | "file" | "screenshot" | "social_link";

interface Submission {
  id: string;
  submission_type: SubmissionType;
  url: string | null;
  file_url: string | null;
  screenshot_url: string | null;
  notes: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_comments: string | null;
  created_at: string;
}

function Workspace() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const callSave = useServerFn(saveSubmission);
  const callRecheck = useServerFn(requestRecheck);

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any | null>(null);
  const [partner, setPartner] = useState<{ id: string; name: string } | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reviewerName, setReviewerName] = useState<string>("");

  const [type, setType] = useState<SubmissionType>("url");
  const [url, setUrl] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data: t } = await supabase.from("tasks")
      .select("id,title,brief,deliverable_type,status,priority,due_date,is_extra,contract_id,assigned_to")
      .eq("id", id).maybeSingle();
    if (!t || t.assigned_to !== profile.id) { setTask(null); setLoading(false); return; }
    setTask(t);

    if (t.contract_id) {
      const { data: c } = await supabase.from("contracts").select("content_partner_id").eq("id", t.contract_id).maybeSingle();
      if (c) {
        const { data: p } = await supabase.from("content_partners").select("id,name").eq("id", c.content_partner_id).maybeSingle();
        if (p) setPartner(p);
      }
    }

    const { data: subs } = await supabase.from("submissions")
      .select("id,submission_type,url,file_url,screenshot_url,notes,status,submitted_at,reviewed_at,reviewed_by,review_comments,created_at")
      .eq("task_id", id).eq("submitted_by", profile.id)
      .order("created_at", { ascending: false });
    const list = (subs ?? []) as Submission[];
    setSubmissions(list);

    // Pre-populate from draft, else rejected/rework, else approved (read-only)
    const draft = list.find((s) => s.status === "draft");
    const rework = list.find((s) => s.status === "rejected" || s.status === "rework_requested");
    const active = draft ?? rework ?? list[0];
    if (active) {
      setType(active.submission_type);
      setUrl(active.url ?? "");
      setFileUrl(active.file_url ?? "");
      setScreenshotUrl(active.screenshot_url ?? "");
      setNotes(active.notes ?? "");
      if (active.reviewed_by) {
        const { data: r } = await supabase.from("profiles").select("full_name,email").eq("id", active.reviewed_by).maybeSingle();
        setReviewerName(r?.full_name ?? r?.email ?? "Reviewer");
      }
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [id, profile]);

  async function upload(kind: "file" | "screenshot", f: File) {
    if (!profile) return;
    const path = `${profile.id}/${id}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage.from("submissions").upload(path, f, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("submissions").createSignedUrl ? await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365) : { data: null as any };
    const u = data?.signedUrl ?? path;
    if (kind === "file") setFileUrl(u); else setScreenshotUrl(u);
    toast.success("Uploaded.");
  }

  async function save(intent: "draft" | "submit") {
    setSaving(true);
    try {
      await callSave({
        data: {
          task_id: id, submission_type: type,
          url: url || null, file_url: fileUrl || null, screenshot_url: screenshotUrl || null,
          notes: notes || null, intent,
        },
      });
      toast.success(intent === "draft" ? "Draft saved." : "Submitted for approval.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally { setSaving(false); }
  }

  async function recheck(submissionId: string) {
    setSaving(true);
    try {
      await callRecheck({ data: { submission_id: submissionId, reason: notes || null } });
      toast.success("Re-check requested. A manager will take another look.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-text-tertiary">Loading…</div>;
  if (!task) return <Card className="m-8 border-border p-12 text-center"><p className="text-sm text-text-secondary">Task not found or not assigned to you.</p><Link to="/editor/tasks" className="mt-3 inline-block text-sm text-primary">← Back to My Tasks</Link></Card>;

  const activeSub = submissions.find((s) => s.status === "draft") ?? submissions[0];
  const readOnly = activeSub && (activeSub.status === "approved" || activeSub.status === "completed");
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date < today && !["completed", "cancelled"].includes(task.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/editor/tasks" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to My Tasks</Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[task.deliverable_type] ?? task.deliverable_type.replace(/_/g, " "))}</Badge>
          {task.is_extra && <Badge className="bg-primary-light text-primary">Bonus</Badge>}
          {task.priority === "high" && <Badge className="bg-danger-light text-danger">High priority</Badge>}
          <Badge>{task.status.replace(/_/g, " ")}</Badge>
          {partner && <a href={`/partners/${partner.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{partner.name}</a>}
          <span className="text-text-tertiary">·</span>
          <a href={`/contracts/${task.contract_id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">View contract</a>
          <span className="text-text-tertiary">·</span>
          <span className={overdue ? "font-semibold text-danger" : ""}>Due {new Date(task.due_date).toLocaleDateString()}</span>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Brief</CardTitle></CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm text-text-secondary">{task.brief || <span className="text-text-tertiary">No brief provided.</span>}</div>
        </CardContent>
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
                {s.review_comments && <div className="mt-2 rounded bg-secondary p-2 text-text-secondary">"{s.review_comments}"</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Your submission</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {readOnly ? (
            <p className="text-sm text-text-secondary">This submission has been {activeSub!.status}. No further edits possible.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                {(["url", "file", "screenshot", "social_link"] as SubmissionType[]).map((t) => (
                  <label key={t} className="flex items-center gap-1.5">
                    <input type="radio" checked={type === t} onChange={() => setType(t)} /> <span className="capitalize">{t.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>

              {(type === "url" || type === "social_link") && (
                <div>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={type === "url" ? "https://thursd.com/..." : "https://instagram.com/p/..."} />
                  <p className="mt-1 text-xs text-text-tertiary">{type === "url" ? "Paste the published URL from Thursd." : "Paste the URL of the published social media post."}</p>
                </div>
              )}
              {type === "file" && (
                <div>
                  <input type="file" accept=".doc,.docx,.pdf,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload("file", f); }} />
                  {fileUrl && <p className="mt-1 text-xs text-success">Uploaded ✓</p>}
                </div>
              )}
              {type === "screenshot" && (
                <div>
                  <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload("screenshot", f); }} />
                  {screenshotUrl && <p className="mt-1 text-xs text-success">Uploaded ✓</p>}
                </div>
              )}

              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Optional notes for the reviewer." />

              <div className="flex gap-2">
                <Button variant="outline" disabled={saving} onClick={() => void save("draft")}>Save as Draft</Button>
                <Button disabled={saving} onClick={() => void save("submit")}>Submit for Approval</Button>
              </div>

              {(activeSub?.status === "rejected" || activeSub?.status === "rework_requested") && (
                <div className="mt-2 space-y-1.5 rounded-md border border-border bg-secondary/30 p-3">
                  <p className="text-xs text-text-secondary">
                    Think this {activeSub.status === "rejected" ? "rejection" : "rework request"} was a mistake?
                    Ask a manager to check the decision again — no changes needed. Add why in the notes above.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void recheck(activeSub.id)}
                  >
                    Request re-check of this decision
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Status</CardTitle></CardHeader>
        <CardContent className="text-sm text-text-secondary">
          {!activeSub && "No submission yet. Fill the form above and save a draft or submit."}
          {activeSub?.status === "draft" && "You have a draft for this task. Submit when you're ready for review."}
          {activeSub?.status === "submitted" && `Submitted on ${activeSub.submitted_at ? new Date(activeSub.submitted_at).toLocaleString() : ""}. Waiting for review.`}
          {activeSub?.status === "under_review" && `Currently being reviewed${reviewerName ? ` by ${reviewerName}` : ""}.`}
          {activeSub?.status === "approved" && `Approved${reviewerName ? ` by ${reviewerName}` : ""}. Nothing more to do here.`}
          {activeSub?.status === "rejected" && `Rejected${reviewerName ? ` by ${reviewerName}` : ""}. Comments: "${activeSub.review_comments ?? ""}". Update and resubmit.`}
          {activeSub?.status === "rework_requested" && `Rework requested${reviewerName ? ` by ${reviewerName}` : ""}. Comments: "${activeSub.review_comments ?? ""}". Update and resubmit.`}
        </CardContent>
      </Card>
      <ActivityFeed linkPrefixes={[`/editor/tasks/${id}`, `/manager/approvals/`]} title="Task activity" />
    </div>
  );
}

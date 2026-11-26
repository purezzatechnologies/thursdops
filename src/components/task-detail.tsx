import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { saveSubmission } from "@/lib/submissions.functions";
import { updateTaskStatus } from "@/lib/contracts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CopyToNewsletterDialog } from "@/components/copy-to-newsletter-dialog";
import { FeaturedImagePicker } from "@/components/featured-image-picker";
import { ActivityFeed } from "@/components/activity-feed";
import { TaskActionButtons } from "@/components/task-actions";

type AttachmentKind = "url" | "social_link" | "file" | "screenshot";
interface Attachment {
  kind: AttachmentKind;
  url: string;
  name?: string | null;
}

/** Normalise a submission row to an attachments list, falling back to the
 * legacy single url/file_url/screenshot_url columns for older records. */
function attachmentsFromSubmission(s: any): Attachment[] {
  if (Array.isArray(s?.attachments) && s.attachments.length > 0) {
    return s.attachments as Attachment[];
  }
  const out: Attachment[] = [];
  if ((s.submission_type === "url" || s.submission_type === "social_link") && s.url) {
    out.push({ kind: s.submission_type, url: s.url });
  }
  if (s.file_url) out.push({ kind: "file", url: s.file_url });
  if (s.screenshot_url) out.push({ kind: "screenshot", url: s.screenshot_url });
  return out;
}

/**
 * Full task detail body — shared by the task detail route and the kanban
 * quick-view popup so both always show the exact same sections.
 * `onChanged` fires after mutations (featured image, submission) so a host
 * board can refresh.
 */
export function TaskDetail({ id, onChanged, onClose }: { id: string; onChanged?: () => void; onClose?: () => void }) {
  const { profile } = useAuth();
  const callSave = useServerFn(saveSubmission);
  const callUpdateStatus = useServerFn(updateTaskStatus);

  const [task, setTask] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [assignee, setAssignee] = useState<string>("");
  const [assigneeRole, setAssigneeRole] = useState<string | null>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Submission form (only used when current user is assignee)
  const [type, setType] = useState<"text" | "url" | "file" | "screenshot" | "social_link">("text");
  const [text, setText] = useState("");
  const [items, setItems] = useState<Attachment[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  async function load() {
    setLoading(true);
    const { data: t } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
    if (!t) { setTask(null); setLoading(false); return; }
    setTask(t);
    if (t.contract_id) {
      const { data: c } = await supabase.from("contracts").select("content_partner_id").eq("id", t.contract_id).maybeSingle();
      if (c) {
        const { data: p } = await supabase.from("content_partners").select("id,name").eq("id", c.content_partner_id).maybeSingle();
        setPartner(p);
      }
    } else {
      setPartner(null);
    }
    let fetchedAssigneeRole: string | null = null;
    if (t.assigned_to) {
      const { data: a } = await supabase.from("profiles").select("full_name,email,role").eq("id", t.assigned_to).maybeSingle();
      setAssignee(a?.full_name ?? a?.email ?? "");
      fetchedAssigneeRole = a?.role ?? null;
      setAssigneeRole(fetchedAssigneeRole);
    } else {
      setAssignee("");
      setAssigneeRole(null);
    }
    const { data: s } = await supabase.from("submissions").select("*").eq("task_id", id).order("created_at", { ascending: false });
    setSubs(s ?? []);
    // Pre-populate from draft if assignee or privileged (managers can't act on other managers' tasks)
    const userIsPrivileged = profile?.role === "super_admin"
      || (profile?.role === "manager" && fetchedAssigneeRole !== "manager" && fetchedAssigneeRole !== "super_admin");
    if (t.assigned_to === profile?.id || userIsPrivileged) {
      const draft = (s ?? []).find((x: any) => x.status === "draft");
      const rework = (s ?? []).find((x: any) => x.status === "rejected" || x.status === "rework_requested");
      const active = draft ?? rework;
      if (active) {
        setType(active.submission_type);
        setText(active.text_content ?? "");
        setItems(attachmentsFromSubmission(active));
        setNotes(active.notes ?? "");
      }
    }
    setLoading(false);
  }
  useEffect(() => { if (profile) void load(); /* eslint-disable-next-line */ }, [id, profile]);

  async function uploadMany(kind: "file" | "screenshot", files: File[]) {
    if (!profile || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${profile.id}/${id}/${Date.now()}-${i}-${f.name}`;
        const { error } = await supabase.storage.from("submissions").upload(path, f, { upsert: true });
        if (error) throw error;
        const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365);
        uploaded.push({ kind, url: data?.signedUrl ?? path, name: f.name });
      }
      setItems((prev) => [...prev, ...uploaded]);
      toast.success(uploaded.length > 1 ? `${uploaded.length} ${kind === "screenshot" ? "screenshots" : "files"} uploaded.` : "Uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally { setUploading(false); }
  }

  function addLink() {
    const u = linkDraft.trim();
    if (!u) return;
    setItems((prev) => [...prev, { kind: type === "social_link" ? "social_link" : "url", url: u }]);
    setLinkDraft("");
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save(intent: "draft" | "submit") {
    setSaving(true);
    try {
      await callSave({ data: { task_id: id, submission_type: type, text_content: text || null, attachments: items, notes: notes || null, intent } });
      toast.success(intent === "draft" ? "Draft saved." : "Submitted for approval.");
      if (intent === "submit") {
        // clear form so the next submission starts fresh
        setText(""); setItems([]); setLinkDraft(""); setNotes(""); setType("text");
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally { setSaving(false); }
  }

  async function changeStatus(newStatus: string) {
    setStatusUpdating(true);
    try {
      await callUpdateStatus({ data: { task_id: id, status: newStatus as any } });
      setTask({ ...task, status: newStatus });
      onChanged?.();
      toast.success("Status updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status.");
    } finally { setStatusUpdating(false); }
  }

  if (loading && !task) return <div className="p-8 text-text-tertiary">Loading…</div>;
  if (!task) return <Card className="border-border p-12 text-center"><p>Task not found.</p></Card>;

  const isAssignee = task.assigned_to === profile?.id;
  const assigneeIsManager = assigneeRole === "manager" || assigneeRole === "super_admin";
  // Managers can only exercise privileged access over non-manager assignees; super_admin has no restriction
  const isPrivileged = profile?.role === "super_admin"
    || (profile?.role === "manager" && !assigneeIsManager);
  const canSubmit = isAssignee || isPrivileged;
  const canEditImage = isPrivileged || isAssignee;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date < today && !["completed", "cancelled"].includes(task.status);
  const draftSub = subs.find((s: any) => s.status === "draft");
  const pendingSubs = subs.filter((s: any) => s.status === "submitted" || s.status === "under_review");
  const taskTerminal = task.status === "completed" || task.status === "cancelled";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
          <div className="flex items-center gap-2">
            <TaskActionButtons
              task={{ id: task.id, status: task.status }}
              onChanged={() => { void load(); onChanged?.(); }}
              onDeleted={onClose}
            />
            {task.deliverable_type === "article" && (
              <CopyToNewsletterDialog
                sourceTaskId={task.id}
                defaultTitle={task.title}
                onCreated={() => void load()}
              />
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[task.deliverable_type] ?? task.deliverable_type.replace(/_/g, " "))}</Badge>
          {task.is_extra && <Badge className="bg-primary-light text-primary">Bonus</Badge>}
          {task.copied_from_task_id && <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">Copied from article</Badge>}
          {canSubmit ? (
            <Select value={task.status} onValueChange={changeStatus} disabled={statusUpdating}>
              <SelectTrigger className="h-6 w-auto gap-1 rounded-full border-border px-2.5 py-0 text-xs font-medium capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["not_started","in_progress","submitted","under_review","rework_requested","approved","completed","cancelled"] as const).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="capitalize">{task.status.replace(/_/g, " ")}</Badge>
          )}
          {partner && <Link to="/partners/$id" params={{ id: partner.id }} className="text-primary hover:underline">{partner.name}</Link>}
          {task.contract_id && <><span className="text-text-tertiary">·</span>
            <Link to="/contracts/$id" params={{ id: task.contract_id }} className="text-primary hover:underline">View contract</Link></>}
          <span className="text-text-tertiary">·</span>
          <span>Assignee: {assignee || <span className="text-text-tertiary">Unassigned</span>}</span>
          <span className="text-text-tertiary">·</span>
          <span className={overdue ? "font-semibold text-danger" : ""}>Due {new Date(task.due_date).toLocaleDateString()}</span>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Featured image</CardTitle></CardHeader>
        <CardContent>
          <FeaturedImagePicker
            taskId={task.id}
            value={task.featured_image_url ?? null}
            canEdit={canEditImage}
            onChange={(u) => { setTask({ ...task, featured_image_url: u }); onChanged?.(); }}
          />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Brief</CardTitle></CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm text-text-secondary">{task.brief || <span className="text-text-tertiary">No brief provided.</span>}</div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Approval queue</CardTitle>
            {pendingSubs.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {pendingSubs.length} pending
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {subs.length === 0 && <p className="text-sm text-text-tertiary">No submissions yet.</p>}
          {subs.map((s: any) => {
            const isPending = s.status === "submitted" || s.status === "under_review";
            const isApproved = s.status === "approved" || s.status === "completed";
            const isRejected = s.status === "rejected";
            const isRework = s.status === "rework_requested";
            const rowCls = isPending
              ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20"
              : isApproved
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
              : isRejected
              ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20"
              : isRework
              ? "border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20"
              : "border-border bg-card";
            return (
              <div key={s.id} className={`rounded-md border p-3 text-xs ${rowCls}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium shrink-0">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "Draft"}</span>
                    <span className="text-text-tertiary capitalize">{s.submission_type.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="capitalize">{s.status.replace(/_/g, " ")}</Badge>
                    {isPending && (
                      <Link to="/manager/approvals/$submissionId" params={{ submissionId: s.id }}>
                        <Button size="sm" variant="outline" className="h-6 text-[11px]">Review ↗</Button>
                      </Link>
                    )}
                  </div>
                </div>
                {s.submission_type === "text" && s.text_content && (
                  <div className="mt-2 whitespace-pre-wrap rounded bg-secondary/60 p-2 text-text-secondary">{s.text_content}</div>
                )}
                {attachmentsFromSubmission(s).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {attachmentsFromSubmission(s).map((a, i) => (
                      a.kind === "screenshot" ? (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
                          <img src={a.url} alt={a.name ?? "Screenshot"} className="max-h-48 rounded border border-border" />
                        </a>
                      ) : (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block break-all text-primary underline">{a.name ?? a.url}</a>
                      )
                    ))}
                  </div>
                )}
                {s.review_comments && (
                  <div className="mt-2 rounded bg-secondary/60 p-2 italic text-text-secondary">"{s.review_comments}"</div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canSubmit && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {draftSub ? "Continue draft" : "New submission"}
            </CardTitle>
            {pendingSubs.length > 0 && (
              <p className="text-xs text-text-tertiary mt-1">
                {pendingSubs.length} submission{pendingSubs.length > 1 ? "s" : ""} already in review — you can still submit additional work.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {taskTerminal ? (
              <p className="text-sm text-text-secondary">This task is {task.status}. No further submissions accepted.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 text-sm">
                  {(["text", "url", "file", "screenshot", "social_link"] as const).map((tt) => (
                    <label key={tt} className="flex items-center gap-1.5">
                      <input type="radio" checked={type === tt} onChange={() => { setType(tt); setItems([]); setLinkDraft(""); }} /> <span className="capitalize">{tt.replace(/_/g, " ")}</span>
                    </label>
                  ))}
                </div>
                {type === "text" && (
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} rows={5} placeholder="Write your update…" />
                )}
                {(type === "url" || type === "social_link") && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={linkDraft}
                        onChange={(e) => setLinkDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                        placeholder={type === "social_link" ? "https://instagram.com/p/…" : "https://…"}
                      />
                      <Button type="button" variant="outline" onClick={addLink} disabled={!linkDraft.trim()}>Add</Button>
                    </div>
                    {items.length > 0 && (
                      <ul className="space-y-1">
                        {items.map((it, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
                            <a href={it.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary underline">{it.url}</a>
                            <button type="button" onClick={() => removeItem(i)} className="shrink-0 px-1 text-text-tertiary hover:text-danger" aria-label="Remove link">✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-text-tertiary">Add as many links as you need — all are submitted together for approval.</p>
                  </div>
                )}
                {(type === "file" || type === "screenshot") && (
                  <div className="space-y-2">
                    <FileUploadButton
                      accept={type === "file" ? ".doc,.docx,.pdf,.zip,.png,.jpg,.jpeg" : "image/png,image/jpeg,image/webp"}
                      disabled={uploading}
                      multiple
                      onFiles={(files) => void uploadMany(type, files)}
                      label={type === "file" ? "Add files" : "Add screenshots"}
                    />
                    {uploading && <p className="text-xs text-text-tertiary">Uploading…</p>}
                    {items.length > 0 && (
                      <ul className="space-y-2">
                        {items.map((it, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
                            {it.kind === "screenshot" ? (
                              <a href={it.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2">
                                <img src={it.url} alt={it.name ?? "Screenshot"} className="h-12 w-12 shrink-0 rounded border border-border object-cover" />
                                <span className="min-w-0 truncate text-xs text-primary underline">{it.name ?? "screenshot"}</span>
                              </a>
                            ) : (
                              <a href={it.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-primary underline">{it.name ?? "file"}</a>
                            )}
                            <button type="button" onClick={() => removeItem(i)} className="shrink-0 px-1 text-text-tertiary hover:text-danger" aria-label="Remove">✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-text-tertiary">Select multiple at once — each is uploaded and stored at original size.</p>
                  </div>
                )}
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Optional notes for the reviewer." />
                <div className="flex gap-2">
                  <Button variant="outline" disabled={saving} onClick={() => void save("draft")}>Save Draft</Button>
                  <Button disabled={saving} onClick={() => void save("submit")}>Submit for Approval</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <ActivityFeed linkPrefixes={[`/manager/all-tasks/${id}`, `/manager/approvals/`]} title="Task activity" />
    </div>
  );
}

/** Styled file picker: a real button that opens the native file dialog, plus
 * the selected filename. Replaces the unstyled default `<input type="file">`. */
function FileUploadButton({
  accept,
  disabled,
  onFiles,
  label,
  multiple,
}: {
  accept: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
  multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string>("");
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) {
            setName(files.length === 1 ? files[0].name : `${files.length} files selected`);
            onFiles(files);
          }
          if (ref.current) ref.current.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()} className="gap-1.5">
        <Upload className="h-3.5 w-3.5" /> {label}
      </Button>
      <span className="truncate text-xs text-text-tertiary">{name || "No file chosen"}</span>
    </div>
  );
}

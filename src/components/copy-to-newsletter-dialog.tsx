import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { copyArticleToNewsletter } from "@/lib/tasks-create.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, X } from "lucide-react";

interface Props {
  sourceTaskId: string;
  defaultTitle: string;
  onCreated?: (newTaskId: string) => void;
}

export function CopyToNewsletterDialog({ sourceTaskId, defaultTitle, onCreated }: Props) {
  const callCopy = useServerFn(copyArticleToNewsletter);
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [title, setTitle] = useState(`[Copied] ${defaultTitle}`);
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,role")
        .in("role", ["ops_support", "manager", "super_admin", "editor"])
        .order("full_name", { ascending: true });
      setPeople(
        (data ?? [])
          .filter((p: any) => p.id)
          .map((p: any) => ({ id: p.id, name: p.full_name ?? p.email ?? "—", role: p.role })),
      );
    })();
    setTitle(`[Copied] ${defaultTitle}`);
  }, [open, defaultTitle]);

  async function uploadImage(f: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "anon";
      const path = `${uid}/copy-to-newsletter/${sourceTaskId}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("submissions").upload(path, f, { upsert: true });
      if (error) throw error;
      const { data } = await supabase.storage.from("submissions").createSignedUrl(path, 60 * 60 * 24 * 365);
      setImageUrl(data?.signedUrl ?? path);
      toast.success("Image uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!dueDate || !assignedTo) {
      toast.error("Due date and assignee are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await callCopy({
        data: {
          source_task_id: sourceTaskId,
          due_date: dueDate,
          assigned_to: assignedTo,
          title_override: title || null,
          reference_image_url: imageUrl || null,
        },
      });
      toast.success("Newsletter task created from article.");
      setOpen(false);
      setDueDate("");
      setAssignedTo("");
      setImageUrl("");
      onCreated?.(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="h-4 w-4" /> Copy to Newsletter
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy article to newsletter</DialogTitle>
            <DialogDescription>
              Creates a new newsletter task with the same brief. The original article task stays untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Newsletter title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
            </div>
            <div className="space-y-1">
              <Label>
                Due date <span className="text-danger">*</span>
              </Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <p className="text-[11px] text-text-tertiary">
                The newsletter task will land on the Thu→Wed week containing this date.
              </p>
            </div>
            <div className="space-y-1">
              <Label>
                Assign to <span className="text-danger">*</span>
              </Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="ml-1 text-xs text-text-tertiary">({p.role.replace(/_/g, " ")})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reference image (optional)</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                }}
              />
              {uploading && <p className="text-xs text-text-tertiary">Uploading…</p>}
              {imageUrl && (
                <div className="mt-2 space-y-2">
                  <img
                    src={imageUrl}
                    alt="Reference preview"
                    className="max-h-48 rounded border border-border object-contain"
                  />
                  <div className="flex items-center gap-3 text-xs">
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      Open in new tab ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      className="inline-flex items-center gap-1 text-text-tertiary hover:text-danger"
                    >
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving || uploading}>
              {saving ? "Creating…" : "Create newsletter task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

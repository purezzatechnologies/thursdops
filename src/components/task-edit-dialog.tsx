import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateTask } from "@/lib/contracts.functions";
import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Edit a task's fields (title, brief, assignee, due date, priority, extra). The
 * deliverable type is fixed once a task exists, so it's shown read-only. Used to
 * tweak a duplicated task before working on it. Managers / super-admins only. */
export function TaskEditDialog({
  taskId,
  open,
  onOpenChange,
  onSaved,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const callUpdate = useServerFn(updateTask);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [isExtra, setIsExtra] = useState(false);
  const [deliverableType, setDeliverableType] = useState("");
  const [assignees, setAssignees] = useState<{ id: string; name: string; role: string }[]>([]);

  useEffect(() => {
    if (!open || !taskId) return;
    setLoading(true);
    void (async () => {
      const { data: t } = await supabase
        .from("tasks")
        .select("title,brief,due_date,assigned_to,priority,is_extra,deliverable_type")
        .eq("id", taskId)
        .maybeSingle();
      if (t) {
        setTitle(t.title ?? "");
        setBrief(t.brief ?? "");
        setDueDate(t.due_date ?? "");
        setAssignee(t.assigned_to ?? "");
        setPriority(((t.priority as "low" | "normal" | "high") ?? "normal"));
        setIsExtra(!!t.is_extra);
        setDeliverableType(t.deliverable_type ?? "");
        const includeOps = t.deliverable_type === "newsletter" || t.deliverable_type === "social_post";
        const roles = includeOps
          ? ["editor", "manager", "super_admin", "ops_support"]
          : ["editor", "manager", "super_admin"];
        const { data: profs } = await supabase
          .from("profiles").select("id,full_name,email,role").in("role", roles).eq("is_active", true).order("full_name");
        setAssignees((profs ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.email, role: p.role })));
      }
      setLoading(false);
    })();
  }, [open, taskId]);

  async function save() {
    if (!taskId) return;
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (!dueDate) { toast.error("Due date is required."); return; }
    setSaving(true);
    try {
      await callUpdate({
        data: {
          id: taskId,
          title: title.trim(),
          brief: brief || null,
          assigned_to: assignee || null,
          due_date: dueDate,
          priority,
          is_extra: isExtra,
        },
      });
      toast.success("Task updated.");
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit task</DialogTitle></DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-sm text-text-tertiary">Loading…</div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-xs">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Brief</Label>
              <Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={5000} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">Deliverable type</Label>
                <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-text-secondary">
                  {DELIVERABLE_LABEL_SINGULAR[deliverableType] ?? deliverableType.replace(/_/g, " ")}
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Due date *</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">Assignee</Label>
                <Select value={assignee || "_none"} onValueChange={(v) => setAssignee(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Unassigned</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} <span className="text-text-tertiary">({a.role.replace(/_/g, " ")})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "normal" | "high")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isExtra} onCheckedChange={(v) => setIsExtra(v === true)} />
              Extra (bonus delivery beyond contract promises)
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

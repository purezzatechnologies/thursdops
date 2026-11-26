import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createTask } from "@/lib/tasks-create.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DELIVERABLE_LABELS, DELIVERABLE_CHANNELS, CONTRACT_BUCKET_TYPES } from "@/lib/contract-display";

type DType = string;

export function TaskCreateDialog({
  open, onOpenChange, onCreated, defaultDueDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: () => void;
  /** Pre-fill the due date (e.g. when creating from a specific week column). */
  defaultDueDate?: string;
}) {
  const callCreate = useServerFn(createTask);
  const today = () => new Date().toISOString().slice(0, 10);
  const [origin, setOrigin] = useState<"contract" | "editorial">("contract");
  const [contractId, setContractId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverableType, setDeliverableType] = useState<DType>("article");
  const [dueDate, setDueDate] = useState<string>(() => defaultDueDate ?? today());
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [saving, setSaving] = useState(false);

  // When the dialog opens, seed the due date from the caller (week column) or today.
  useEffect(() => {
    if (open) setDueDate(defaultDueDate ?? today());
  }, [open, defaultDueDate]);

  const [contracts, setContracts] = useState<{ id: string; label: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [{ data: cs }, { data: us }] = await Promise.all([
        supabase.from("contracts").select("id,content_partner_id,plan_type,start_date").eq("status", "active").order("start_date", { ascending: false }).limit(100),
        supabase.from("profiles").select("id,full_name,email").eq("is_active", true).order("full_name"),
      ]);
      const pIds = Array.from(new Set((cs ?? []).map((c: any) => c.content_partner_id)));
      const { data: ps } = pIds.length ? await supabase.from("content_partners").select("id,name").in("id", pIds) : { data: [] as any[] };
      const pMap = new Map((ps ?? []).map((p: any) => [p.id, p.name]));
      setContracts((cs ?? []).map((c: any) => ({
        id: c.id,
        label: `${pMap.get(c.content_partner_id) ?? "—"} · ${c.plan_type} · ${c.start_date}`,
      })));
      setUsers((us ?? []).map((u: any) => ({ id: u.id, name: u.full_name ?? u.email })));
    })();
  }, [open]);

  function reset() {
    setOrigin("contract"); setContractId(""); setTitle(""); setDescription("");
    setDeliverableType("article"); setDueDate(defaultDueDate ?? today());
    setAssignedTo(""); setPriority("normal");
  }

  async function submit() {
    if (!title.trim()) return toast.error("Title is required.");
    if (origin === "contract" && !contractId) return toast.error("Select a contract.");
    setSaving(true);
    try {
      await callCreate({
        data: {
          origin,
          contract_id: origin === "contract" ? contractId : null,
          title: title.trim(),
          description: description.trim() || null,
          deliverable_type: deliverableType,
          due_date: dueDate,
          assigned_to: assignedTo || null,
          priority,
          is_extra: false,
        },
      });
      toast.success("Task created.");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>Create a contract-linked or standalone editorial task.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Task type *</Label>
            <Select value={origin} onValueChange={(v) => { setOrigin(v as any); setDeliverableType("article"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="editorial">Editorial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {origin === "contract" && (
            <div>
              <Label className="mb-1.5 block">Contract *</Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger><SelectValue placeholder="Choose contract" /></SelectTrigger>
                <SelectContent>
                  {contracts.length === 0 && <div className="px-3 py-2 text-xs text-text-tertiary">No active contracts</div>}
                  {contracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="mb-1.5 block">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Deliverable type</Label>
              <Select value={deliverableType} onValueChange={(v) => setDeliverableType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {origin === "contract" ? (
                    // Contract deliverables use the planner buckets so promised/
                    // delivered stays accurate.
                    CONTRACT_BUCKET_TYPES.map((k) => (
                      <SelectItem key={k} value={k}>{DELIVERABLE_LABELS[k]}</SelectItem>
                    ))
                  ) : (
                    // Editorial deliverables can use the full vocabulary.
                    DELIVERABLE_CHANNELS.map((group) => (
                      <SelectGroup key={group.channel}>
                        <SelectLabel>{group.channel}</SelectLabel>
                        {group.types.map((k) => (
                          <SelectItem key={`${group.channel}-${k}`} value={k}>{DELIVERABLE_LABELS[k]}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Due date *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Assignee</Label>
              <Select value={assignedTo || "__none__"} onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

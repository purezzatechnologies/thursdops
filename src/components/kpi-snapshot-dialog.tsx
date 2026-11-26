import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { saveKpiSnapshot } from "@/lib/kpi.functions";
import { useConfirm } from "@/components/confirm-dialog";

export interface KpiSnapshot {
  id: string;
  recorded_date: string;
  clicks: number;
  impressions: number;
  engagement_rate: number | null;
  notes: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onClose: (changed: boolean) => void;
  submissionId: string;
  taskTitle: string;
  submissionType?: string;
  url?: string | null;
  approvedAt?: string | null;
  /** When provided, dialog opens in Edit mode. */
  initialSnapshots?: KpiSnapshot[];
  /** Optionally pre-select a snapshot to edit. */
  initialSnapshotId?: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function fmt(n: number | null | undefined) {
  if (n == null) return "";
  return n.toLocaleString();
}

export function KpiSnapshotDialog({
  open,
  onClose,
  submissionId,
  taskTitle,
  submissionType,
  url,
  approvedAt,
  initialSnapshots,
  initialSnapshotId,
}: Props) {
  const callSave = useServerFn(saveKpiSnapshot);
  const confirm = useConfirm();
  const editMode = !!(initialSnapshots && initialSnapshots.length);
  const [snapId, setSnapId] = useState<string>(initialSnapshotId ?? initialSnapshots?.[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [clicks, setClicks] = useState("");
  const [impressions, setImpressions] = useState("");
  const [er, setEr] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const current = editMode ? initialSnapshots!.find((s) => s.id === snapId) ?? initialSnapshots![0] : null;

  useEffect(() => {
    if (!open) return;
    if (editMode && current) {
      setSnapId(current.id);
      setDate(current.recorded_date);
      setClicks(String(current.clicks));
      setImpressions(String(current.impressions));
      setEr(current.engagement_rate != null ? String(current.engagement_rate) : "");
      setNotes(current.notes ?? "");
    } else {
      setDate(todayStr());
      setClicks(""); setImpressions(""); setEr(""); setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snapId]);

  async function handleSave() {
    const clicksN = Number(clicks);
    const impN = Number(impressions);
    const erN = er === "" ? null : Number(er);
    if (!date) return toast.error("Recorded date is required.");
    if (!Number.isFinite(clicksN) || clicksN < 0 || !Number.isInteger(clicksN)) return toast.error("Clicks must be a non-negative integer.");
    if (!Number.isFinite(impN) || impN < 0 || !Number.isInteger(impN)) return toast.error("Impressions must be a non-negative integer.");
    if (erN != null && (erN < 0 || erN > 100)) return toast.error("Engagement rate must be 0-100.");
    if (new Date(date).getTime() > Date.now()) return toast.error("Recorded date cannot be in the future.");

    if (editMode && current?.status === "qc_approved") {
      const ok = await confirm({
        title: "Reset to Pending QC?",
        description: "Editing will reset this snapshot to Pending QC. Partners won't see updated numbers until a manager re-approves.",
        confirmText: "Edit anyway",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await callSave({
        data: {
          snapshot_id: editMode ? snapId : null,
          submission_id: submissionId,
          recorded_date: date,
          clicks: clicksN,
          impressions: impN,
          engagement_rate: erN,
          notes: notes.trim() || null,
        },
      });
      toast.success(editMode ? "Snapshot updated. Pending QC." : "Snapshot saved. Pending QC.");
      onClose(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editMode ? `Edit Snapshot — ${taskTitle}` : `Add Snapshot — ${taskTitle}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs space-y-1.5">
            {submissionType && (
              <div className="flex items-center gap-2"><span className="text-text-tertiary">Type:</span> <Badge variant="outline" className="capitalize">{submissionType.replace(/_/g, " ")}</Badge></div>
            )}
            {url && (
              <div className="flex gap-2 min-w-0">
                <span className="text-text-tertiary shrink-0">URL:</span>
                <a href={url} target="_blank" rel="noreferrer" className="text-primary underline truncate min-w-0" title={url}>{url}</a>
              </div>
            )}
            {approvedAt && (
              <div><span className="text-text-tertiary">Approved:</span> {new Date(approvedAt).toLocaleDateString()}</div>
            )}
          </div>

          {editMode && initialSnapshots && initialSnapshots.length > 1 && (
            <div>
              <Label>Snapshot</Label>
              <Select value={snapId} onValueChange={setSnapId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {initialSnapshots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.recorded_date} — {s.status.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Recorded date *</Label>
              <Input id="date" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="er">Engagement rate (%)</Label>
              <Input id="er" type="number" step="0.01" min="0" max="100" value={er} onChange={(e) => setEr(e.target.value)} />
              {current?.engagement_rate != null && <div className="mt-1 text-[11px] text-text-tertiary">Previous: {current.engagement_rate}%</div>}
            </div>
            <div>
              <Label htmlFor="clicks">Clicks *</Label>
              <Input id="clicks" type="number" min="0" value={clicks} onChange={(e) => setClicks(e.target.value)} />
              {current && <div className="mt-1 text-[11px] text-text-tertiary">Previous: {fmt(current.clicks)}</div>}
            </div>
            <div>
              <Label htmlFor="imp">Impressions *</Label>
              <Input id="imp" type="number" min="0" value={impressions} onChange={(e) => setImpressions(e.target.value)} />
              {current && <div className="mt-1 text-[11px] text-text-tertiary">Previous: {fmt(current.impressions)}</div>}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pulled from GA on 16-May, or Mailchimp open count." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editMode ? "Save changes" : "Save snapshot"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

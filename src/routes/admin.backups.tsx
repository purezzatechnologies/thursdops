import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import {
  listBackups, createBackupNow, ensureAutoBackup, getBackupPayload, deleteBackup, restoreBackup,
  getBackupInterval, setBackupInterval,
} from "@/lib/admin-backups.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Database, Download, RotateCcw, Trash2, Clock, ShieldCheck, Timer } from "lucide-react";
import { fromNow } from "@/lib/format";

function intervalLabel(h: number) {
  if (h === 1) return "Every hour";
  if (h === 24) return "Every 24 hours (daily)";
  return `Every ${h} hours`;
}

export const Route = createFileRoute("/admin/backups")({
  component: () => (
    <AppShell allowed="super_admin">
      <BackupsPage />
    </AppShell>
  ),
});

interface BackupRow {
  id: string;
  created_at: string;
  kind: string;
  label: string | null;
  record_count: number;
}

function downloadJson(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function BackupsPage() {
  const { profile } = useAuth();
  const callList = useServerFn(listBackups);
  const callCreate = useServerFn(createBackupNow);
  const callEnsure = useServerFn(ensureAutoBackup);
  const callPayload = useServerFn(getBackupPayload);
  const callDelete = useServerFn(deleteBackup);
  const callRestore = useServerFn(restoreBackup);
  const callGetInterval = useServerFn(getBackupInterval);
  const callSetInterval = useServerFn(setBackupInterval);

  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
  const [intervalHours, setIntervalHours] = useState<number>(6);
  const [intervalOptions, setIntervalOptions] = useState<number[]>([1, 2, 3, 4, 6, 8, 12, 24]);

  async function load() {
    if (!profile) return;
    const r = await callList();
    setBackups(r.backups as BackupRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      try {
        const iv = await callGetInterval();
        setIntervalHours(iv.hours);
        setIntervalOptions(iv.options);
      } catch { /* non-fatal */ }
      try { await callEnsure(); } catch { /* non-fatal */ }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function changeInterval(hours: number) {
    setBusy("interval");
    try {
      await callSetInterval({ data: { hours } });
      setIntervalHours(hours);
      toast.success(`Automatic backups set to ${intervalLabel(hours).toLowerCase()}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update schedule.");
    } finally { setBusy(""); }
  }

  async function backupNow() {
    setBusy("create");
    try {
      await callCreate({ data: { label: label.trim() || null } });
      toast.success("Backup created.");
      setLabel("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed.");
    } finally { setBusy(""); }
  }

  async function download(b: BackupRow) {
    setBusy(b.id + ":dl");
    try {
      const snap = await callPayload({ data: { id: b.id } });
      downloadJson(`thursdops-backup-${b.created_at.slice(0, 19).replace(/[:T]/g, "-")}.json`, snap);
      toast.success("Backup downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    } finally { setBusy(""); }
  }

  async function remove(b: BackupRow) {
    setBusy(b.id + ":del");
    try {
      await callDelete({ data: { id: b.id } });
      toast.success("Backup deleted.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally { setBusy(""); }
  }

  async function doRestore(b: BackupRow) {
    setBusy(b.id + ":restore");
    try {
      const r = await callRestore({ data: { id: b.id } });
      toast.success(`Restored ${r.inserted} records from this backup.`);
      setRestoreTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed.");
    } finally { setBusy(""); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backups</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Automatic snapshots run <span className="font-medium">{intervalLabel(intervalHours).toLowerCase()}</span>.
          Restore any point-in-time backup below. Login accounts are never affected.
        </p>
      </div>

      {/* Schedule */}
      <Card className="border-border">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary">
              <Timer className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">Backup schedule</div>
              <div className="text-xs text-text-tertiary">How often an automatic backup is taken.</div>
            </div>
          </div>
          <Select
            value={String(intervalHours)}
            onValueChange={(v) => void changeInterval(Number(v))}
            disabled={busy !== ""}
          >
            <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {intervalOptions.map((h) => (
                <SelectItem key={h} value={String(h)}>{intervalLabel(h)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Create */}
      <Card className="border-border">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label (e.g. before contract import)"
            maxLength={120}
            className="flex-1"
          />
          <Button disabled={busy !== ""} onClick={() => void backupNow()}>
            <Database className="mr-1.5 h-4 w-4" /> {busy === "create" ? "Backing up…" : "Back up now"}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <p className="py-10 text-center text-sm text-text-tertiary">Loading…</p>
      ) : backups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Database className="h-6 w-6 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">No backups yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((b) => (
            <Card key={b.id} className="border-border">
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={b.kind === "manual" ? "secondary" : "outline"}
                      className={b.kind === "auto" ? "border-info/30 text-info" : ""}
                    >
                      {b.kind === "manual" ? "Manual" : "Auto"}
                    </Badge>
                    <span className="text-sm font-medium">{b.label ?? "Snapshot"}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                    <Clock className="h-3 w-3" />
                    <span title={new Date(b.created_at).toLocaleString()}>{fromNow(b.created_at)}</span>
                    <span>·</span>
                    <span>{b.record_count} records</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => setRestoreTarget(b)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== ""} onClick={() => void download(b)} title="Download JSON">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="text-text-tertiary hover:text-danger"
                    disabled={busy !== ""}
                    onClick={() => void remove(b)}
                    title="Delete backup"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5 text-[11px] text-text-tertiary">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
        <span>Super-admin only. The newest 16 automatic backups are kept; manual backups are kept until you delete them.</span>
      </div>

      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces <strong>all current business data</strong> (partners, contracts, tasks, submissions, KPIs,
              requests, notifications) with the snapshot from{" "}
              <strong>{restoreTarget ? new Date(restoreTarget.created_at).toLocaleString() : ""}</strong>{" "}
              ({restoreTarget?.record_count} records). Login accounts stay intact. Consider backing up now first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy.endsWith(":restore")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (restoreTarget) void doRestore(restoreTarget); }}
              disabled={busy.endsWith(":restore")}
              className="bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]"
            >
              {busy.endsWith(":restore") ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

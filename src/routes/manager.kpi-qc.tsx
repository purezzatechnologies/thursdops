import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck, Clock, TrendingUp, AlertTriangle, ExternalLink } from "lucide-react";
import { listKpiQcQueue, approveKpiSnapshots, rejectKpiSnapshot } from "@/lib/kpi.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/manager/kpi-qc")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <KpiQcPage />
    </AppShell>
  ),
});

type Row = Awaited<ReturnType<typeof listKpiQcQueue>>["rows"][number];

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}
function delta(curr: number, prev: number | null | undefined) {
  if (prev == null || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  return pct;
}

function KpiQcPage() {
  const { profile } = useAuth();
  const callList = useServerFn(listKpiQcQueue);
  const callApprove = useServerFn(approveKpiSnapshots);
  const callReject = useServerFn(rejectKpiSnapshot);

  // You can't QC a KPI you entered yourself.
  const isMine = (r: Row) => !!profile && r.entered_by_id === profile.id;

  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState({ pending: 0, myActionsThisWeek: 0, avgWaitingHours: null as number | null });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [entererFilter, setEntererFilter] = useState("all");

  // Distinct partners / enterers present in the current queue, for the filters.
  const partners = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.partner_id) m.set(r.partner_id, r.partner_name);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const enterers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.entered_by_id) m.set(r.entered_by_id, r.entered_by_name);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const visibleRows = useMemo(
    () => rows.filter((r) =>
      (partnerFilter === "all" || r.partner_id === partnerFilter) &&
      (entererFilter === "all" || r.entered_by_id === entererFilter),
    ),
    [rows, partnerFilter, entererFilter],
  );
  const selectableVisible = visibleRows.filter((r) => !isMine(r));

  const load = async () => {
    try {
      const r = await callList({ data: {} });
      setRows(r.rows as Row[]);
      setStats(r.stats);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load.");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    const allSelected = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id));
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableVisible.map((r) => r.id)));
  }

  async function approveSelected() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const res = await callApprove({ data: { ids: [...selected] } });
      toast.success(`Approved ${res.updated} snapshot${res.updated === 1 ? "" : "s"}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReject() {
    if (!rejectFor) return;
    if (rejectComment.trim().length < 1) {
      toast.error("Comments are required.");
      return;
    }
    setBusy(true);
    try {
      await callReject({ data: { id: rejectFor.id, comments: rejectComment.trim() } });
      toast.success("Snapshot rejected. Entered-by has been notified.");
      setRejectFor(null);
      setRejectComment("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
          Manager workspace
        </div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">KPI QC queue</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Verify newly entered KPI snapshots before partners see them.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard
          icon={ShieldCheck}
          label="Pending QC"
          value={stats.pending}
          accent={stats.pending > 0 ? "warn" : undefined}
        />
        <StatCard icon={TrendingUp} label="My actions (7d)" value={stats.myActionsThisWeek} />
        <StatCard
          icon={Clock}
          label="Avg wait to QC (30d)"
          value={stats.avgWaitingHours != null ? `${stats.avgWaitingHours}h` : "—"}
        />
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Snapshots awaiting QC</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">{selected.size} selected</span>
            <Button size="sm" disabled={!selected.size || busy} onClick={approveSelected}>
              Approve selected
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All partners</SelectItem>
                  {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={entererFilter} onValueChange={setEntererFilter}>
                <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All enterers</SelectItem>
                  {enterers.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {(partnerFilter !== "all" || entererFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setPartnerFilter("all"); setEntererFilter("all"); }}
                  className="text-xs font-medium text-text-tertiary hover:text-text-primary"
                >
                  Clear
                </button>
              )}
              <span className="ml-auto text-xs text-text-tertiary">{visibleRows.length} of {rows.length}</span>
            </div>
          )}
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-text-tertiary">
              Nothing waiting for QC. 🎉
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-text-tertiary">
              No snapshots match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-secondary/30 text-[11px] uppercase tracking-wide text-text-tertiary">
                  <tr>
                    <th className="w-10 px-4 py-2.5">
                      <Checkbox
                        checked={selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id))}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left">Task</th>
                    <th className="px-3 py-2.5 text-left">Partner</th>
                    <th className="px-3 py-2.5 text-left">Date</th>
                    <th className="px-3 py-2.5 text-right">Clicks</th>
                    <th className="px-3 py-2.5 text-right">Impressions</th>
                    <th className="px-3 py-2.5 text-right">ER %</th>
                    <th className="px-3 py-2.5 text-left">Entered by</th>
                    <th className="px-3 py-2.5 text-left">Waiting</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleRows.map((r) => {
                    const clicksDelta = delta(r.clicks, r.previous?.clicks ?? null);
                    const wait = Math.floor(r.waiting_hours);
                    return (
                      <tr key={r.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggle(r.id)}
                            disabled={isMine(r)}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            to="/ops/kpi/submission/$submissionId"
                            params={{ submissionId: r.submission_id }}
                            className="text-sm font-medium hover:underline"
                          >
                            {r.task_title}
                          </Link>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-tertiary">
                            <Badge variant="outline" className="capitalize">
                              {DELIVERABLE_LABEL_SINGULAR[String(r.deliverable_type)] ?? String(r.deliverable_type).replace(/_/g, " ")}
                            </Badge>
                            {r.url && (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                URL <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-text-secondary">{r.partner_name}</td>
                        <td className="px-3 py-3 text-text-secondary">{r.recorded_date}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {fmt(r.clicks)}
                          {clicksDelta != null && (
                            <div
                              className={cn(
                                "text-[10px]",
                                clicksDelta >= 0 ? "text-success" : "text-danger",
                              )}
                            >
                              {clicksDelta >= 0 ? "+" : ""}
                              {clicksDelta.toFixed(0)}%
                            </div>
                          )}
                          {r.previous && (
                            <div className="text-[10px] text-text-tertiary">
                              prev {fmt(r.previous.clicks)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {fmt(r.impressions)}
                          {r.previous && (
                            <div className="text-[10px] text-text-tertiary">
                              prev {fmt(r.previous.impressions)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.engagement_rate != null ? `${r.engagement_rate}%` : "—"}
                        </td>
                        <td className="px-3 py-3 text-text-secondary">
                          <div>{r.entered_by_name}</div>
                          <div className="text-[10px] text-text-tertiary capitalize">
                            {r.entered_by_role.replace(/_/g, " ")}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "text-xs",
                              wait > 48 ? "font-semibold text-danger" : "text-text-tertiary",
                            )}
                          >
                            {wait < 1 ? "<1h" : `${wait}h`}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {isMine(r) ? (
                              <span className="self-center text-[11px] text-text-tertiary" title="You entered this KPI — another manager must verify it.">
                                You entered this
                              </span>
                            ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await callApprove({ data: { ids: [r.id] } });
                                  toast.success("Approved.");
                                  await load();
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Failed.");
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Approve
                            </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:bg-danger-light hover:text-danger"
                              onClick={() => {
                                setRejectFor(r);
                                setRejectComment("");
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!rejectFor}
        onOpenChange={(o) => {
          if (!o) {
            setRejectFor(null);
            setRejectComment("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Reject snapshot
            </DialogTitle>
          </DialogHeader>
          {rejectFor && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
                <div className="font-medium text-text-primary">{rejectFor.task_title}</div>
                <div className="mt-1 text-text-tertiary">
                  {rejectFor.recorded_date} · {fmt(rejectFor.clicks)} clicks ·{" "}
                  {fmt(rejectFor.impressions)} impressions
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary">
                  Comments to entered-by *
                </label>
                <Textarea
                  rows={4}
                  maxLength={500}
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="Explain what should change."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={submitReject}
              disabled={busy || !rejectComment.trim()}
              className="bg-danger text-white hover:bg-danger/90"
            >
              Reject snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock;
  label: string;
  value: number | string;
  accent?: "warn";
}) {
  return (
    <Card
      className={cn(
        "border-border bg-card transition-shadow hover:shadow-md",
        accent === "warn" && "border-warning/40",
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="text-sm font-medium text-text-secondary">{label}</div>
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              accent === "warn" ? "bg-warning-light text-warning" : "bg-primary-light text-primary",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 text-3xl font-bold tabular-nums tracking-tight text-text-primary">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

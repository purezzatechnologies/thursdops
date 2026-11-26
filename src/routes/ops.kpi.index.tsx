import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiSnapshotDialog, type KpiSnapshot } from "@/components/kpi-snapshot-dialog";
import { listKpiQueue, getKpiSubmissionDetail } from "@/lib/kpi.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ops/kpi/")({
  component: () => (<AppShell allowed={["ops_support","manager","super_admin"]}><KpiPage /></AppShell>),
});

interface Row {
  submission_id: string; task_id: string; task_title: string; contract_id: string | null;
  deliverable_type: string; submission_type: string; url: string | null;
  partner_id: string | null; partner_name: string; approved_at: string | null;
  metadata: Record<string, string> | null;
  latest_snapshot: { id: string; recorded_date: string; clicks: number; impressions: number; engagement_rate: number | null; status: string; days_since: number | null } | null;
}

function daysClass(d: number | null) {
  if (d == null) return "text-text-tertiary";
  if (d <= 7) return "text-success";
  if (d <= 14) return "text-warning";
  return "text-danger font-semibold";
}

function qcBadge(status: string | undefined) {
  if (!status) return null;
  const map: Record<string, string> = {
    pending_qc: "bg-warning-light text-warning",
    qc_approved: "bg-success-light text-success",
    qc_rejected: "bg-danger-light text-danger",
  };
  return <Badge className={cn("capitalize border-0", map[status])}>{status.replace("qc_", "").replace("_", " ")}</Badge>;
}

function KpiPage() {
  const callList = useServerFn(listKpiQueue);
  const callDetail = useServerFn(getKpiSubmissionDetail);
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState({ awaitingFirst: 0, overdue: 0, myPending: 0, recentlyRejected: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [rejectedOnly, setRejectedOnly] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; row: Row | null; mode: "add" | "edit"; snaps: KpiSnapshot[] }>({ open: false, row: null, mode: "add", snaps: [] });

  async function load() {
    setLoading(true);
    try {
      const r = await callList({ data: {} });
      setRows(r.rows as Row[]);
      setStats(r.stats);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const types = useMemo(() => Array.from(new Set(rows.map(r => r.deliverable_type))), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (q && !r.task_title.toLowerCase().includes(q.toLowerCase()) && !r.partner_name.toLowerCase().includes(q.toLowerCase())) return false;
    if (type !== "all" && r.deliverable_type !== type) return false;
    if (staleOnly) {
      const stale = !r.latest_snapshot || (r.latest_snapshot.days_since ?? 0) > 7;
      if (!stale) return false;
    }
    if (rejectedOnly && r.latest_snapshot?.status !== "qc_rejected") return false;
    return true;
  }).sort((a, b) => {
    const da = a.latest_snapshot?.days_since ?? 9999;
    const db = b.latest_snapshot?.days_since ?? 9999;
    return db - da;
  }), [rows, q, type, staleOnly, rejectedOnly]);

  const grouped = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of filtered) {
      const k = r.partner_name;
      const arr = g.get(k) ?? []; arr.push(r); g.set(k, arr);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  async function openAdd(row: Row) {
    setDialog({ open: true, row, mode: "add", snaps: [] });
  }
  async function openEdit(row: Row) {
    const d = await callDetail({ data: { submission_id: row.submission_id } });
    setDialog({ open: true, row, mode: "edit", snaps: (d.snapshots as KpiSnapshot[]) });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="KPI Entry" subtitle="Record clicks, impressions, and engagement for approved submissions." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { l: "Awaiting first snapshot", v: stats.awaitingFirst, alert: stats.awaitingFirst > 0 },
          { l: "Snapshots overdue this week", v: stats.overdue, alert: stats.overdue > 5 },
          { l: "My pending QC", v: stats.myPending, alert: false },
          { l: "Recently rejected", v: stats.recentlyRejected, alert: stats.recentlyRejected > 0 },
        ].map(k => (
          <Card key={k.l} className="border-border">
            <CardContent className="p-5">
              <div className="text-xs text-text-tertiary">{k.l}</div>
              <div className={cn("mt-2 text-2xl font-bold", k.alert && "text-danger")}>{k.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Search task or partner…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
            <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={type} onChange={e => setType(e.target.value)}>
              <option value="all">All types</option>
              {types.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary"><input type="checkbox" checked={staleOnly} onChange={e => setStaleOnly(e.target.checked)} /> Stale only</label>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary"><input type="checkbox" checked={rejectedOnly} onChange={e => setRejectedOnly(e.target.checked)} /> Rejected only</label>
            <span className="ml-auto text-xs text-text-tertiary">{filtered.length} submission(s)</span>
          </div>

          {loading ? (
            <div className="py-10 text-center text-text-tertiary">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="py-10 text-center text-text-tertiary">No approved submissions match your filters.</div>
          ) : grouped.map(([partner, partnerRows]) => (
            <details key={partner} open className="rounded-md border border-border bg-card">
              <summary className="cursor-pointer px-4 py-2 text-sm font-semibold">{partner} <span className="text-xs text-text-tertiary">({partnerRows.length})</span></summary>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Latest snapshot</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">ER%</TableHead>
                    <TableHead>QC</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnerRows.map(r => {
                    const l = r.latest_snapshot;
                    return (
                      <TableRow key={r.submission_id}>
                        <TableCell>
                          <Link to="/ops/kpi/submission/$submissionId" params={{ submissionId: r.submission_id }} className="font-medium text-primary hover:underline">{r.task_title}</Link>
                          {r.url && <div className="text-[11px] text-text-tertiary truncate max-w-[200px]"><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></div>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[r.deliverable_type] ?? r.deliverable_type.replace(/_/g, " "))}</Badge></TableCell>
                        <TableCell className="text-xs">{r.approved_at ? new Date(r.approved_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className={cn("text-xs", daysClass(l?.days_since ?? null))}>
                          {l ? `${l.recorded_date} (${l.days_since}d ago)` : "No snapshots yet"}
                        </TableCell>
                        <TableCell className="text-right">{l ? l.clicks.toLocaleString() : ""}</TableCell>
                        <TableCell className="text-right">{l ? l.impressions.toLocaleString() : ""}</TableCell>
                        <TableCell className="text-right">{l?.engagement_rate != null ? `${l.engagement_rate}%` : ""}</TableCell>
                        <TableCell>{qcBadge(l?.status)}</TableCell>
                        <TableCell className="text-right">
                          {!l || l.status === "qc_approved" ? (
                            <Button size="sm" variant="outline" onClick={() => openAdd(r)}>Add snapshot</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Update</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </details>
          ))}
        </CardContent>
      </Card>

      {dialog.row && (
        <KpiSnapshotDialog
          open={dialog.open}
          onClose={(changed) => { setDialog(d => ({ ...d, open: false })); if (changed) void load(); }}
          submissionId={dialog.row.submission_id}
          taskTitle={dialog.row.task_title}
          submissionType={dialog.row.submission_type}
          url={dialog.row.url}
          approvedAt={dialog.row.approved_at}
          initialSnapshots={dialog.mode === "edit" ? dialog.snaps : undefined}
        />
      )}
    </div>
  );
}

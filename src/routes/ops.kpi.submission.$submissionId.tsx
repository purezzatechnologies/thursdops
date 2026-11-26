import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiSnapshotDialog, type KpiSnapshot } from "@/components/kpi-snapshot-dialog";
import { getKpiSubmissionDetail } from "@/lib/kpi.functions";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/ops/kpi/submission/$submissionId")({
  component: () => (<AppShell allowed={["ops_support","manager","super_admin","editor"]}><Detail /></AppShell>),
});

function Detail() {
  const { submissionId } = Route.useParams();
  const callDetail = useServerFn(getKpiSubmissionDetail);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; mode: "add" | "edit"; snapshotId?: string }>({ open: false, mode: "add" });

  async function load() {
    setLoading(true);
    try { setData(await callDetail({ data: { submission_id: submissionId } })); }
    catch { setData(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [submissionId]);

  if (loading) return <div className="p-8 text-text-tertiary">Loading…</div>;
  if (!data) return <div className="p-8 text-text-tertiary">Submission not found or you don't have access.</div>;

  const canWrite = data.role === "ops_support" || data.role === "manager" || data.role === "super_admin";
  const snaps = data.snapshots as Array<KpiSnapshot & { entered_by_name: string; qc_approved_by_name: string | null; qc_approved_at: string | null }>;
  const chart = [...snaps].sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/ops/kpi" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{data.task?.title ?? "Submission"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {data.task?.deliverable_type && <Badge variant="outline" className="capitalize">{(DELIVERABLE_LABEL_SINGULAR[data.task.deliverable_type] ?? data.task.deliverable_type.replace(/_/g, " "))}</Badge>}
          {data.partner && <span className="text-primary">{data.partner.name}</span>}
          {data.submission.url && <a href={data.submission.url} target="_blank" rel="noreferrer" className="text-primary underline truncate max-w-xs">{data.submission.url}</a>}
          {data.submission.approved_at && <span className="text-text-tertiary">Approved {new Date(data.submission.approved_at).toLocaleDateString()}</span>}
          {data.submitter && <span className="text-text-tertiary">By {data.submitter.name}</span>}
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Trend</CardTitle></CardHeader>
        <CardContent>
          {chart.length === 0 ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-text-tertiary">No snapshots yet.</p>
              {canWrite && <Button onClick={() => setDialog({ open: true, mode: "add" })}>+ Add first snapshot</Button>}
            </div>
          ) : chart.length < 2 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">Add more snapshots to see a trend over time.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="recorded_date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="hsl(var(--primary))" name="Clicks" />
                  <Line yAxisId="right" type="monotone" dataKey="impressions" stroke="hsl(var(--foreground))" name="Impressions" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Snapshots</CardTitle>
          {canWrite && snaps.length > 0 && <Button size="sm" onClick={() => setDialog({ open: true, mode: "add" })}>+ Add snapshot</Button>}
        </CardHeader>
        <CardContent>
          {snaps.length === 0 ? <p className="text-sm text-text-tertiary">None yet.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">ER%</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entered by</TableHead>
                  <TableHead>QC by</TableHead>
                  <TableHead>Notes</TableHead>
                  {canWrite && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {snaps.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{s.recorded_date}</TableCell>
                    <TableCell className="text-right">{s.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{s.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{s.engagement_rate != null ? `${s.engagement_rate}%` : "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{s.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-xs">{s.entered_by_name}</TableCell>
                    <TableCell className="text-xs">{s.qc_approved_by_name ?? "—"}{s.qc_approved_at && <div className="text-text-tertiary">{new Date(s.qc_approved_at).toLocaleDateString()}</div>}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={s.notes ?? ""}>{s.notes ?? ""}</TableCell>
                    {canWrite && <TableCell><Button size="sm" variant="ghost" onClick={() => setDialog({ open: true, mode: "edit", snapshotId: s.id })}>Edit</Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Edit history</CardTitle></CardHeader>
        <CardContent>
          {data.edits.length === 0 ? <p className="text-sm text-text-tertiary">No edits yet. Original entries do not appear here — only subsequent changes.</p> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>When</TableHead><TableHead>Field</TableHead><TableHead>Old</TableHead><TableHead>New</TableHead><TableHead>By</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.edits.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{new Date(e.edited_at).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{e.field_name.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-xs">{e.old_value ?? "—"}</TableCell>
                    <TableCell className="text-xs">{e.new_value ?? "—"}</TableCell>
                    <TableCell className="text-xs">{e.edited_by_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialog.open && data.task && (
        <KpiSnapshotDialog
          open
          onClose={(changed) => { setDialog({ open: false, mode: "add" }); if (changed) void load(); }}
          submissionId={submissionId}
          taskTitle={data.task.title}
          submissionType={data.submission.submission_type}
          url={data.submission.url}
          approvedAt={data.submission.approved_at}
          initialSnapshots={dialog.mode === "edit" ? (snaps as KpiSnapshot[]) : undefined}
          initialSnapshotId={dialog.snapshotId}
        />
      )}
    </div>
  );
}

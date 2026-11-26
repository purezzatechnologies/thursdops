import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/manager/submissions")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <AllSubs />
    </AppShell>
  ),
});

function AllSubs() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id,task_id,status,submission_type,submitted_at,submitted_by,reviewed_by,reviewed_at,review_comments,metadata,task:tasks!inner(title,deliverable_type,contract_id)")
        .order("submitted_at", { ascending: false })
        .limit(500);
      const raw = (data ?? []) as any[];
      const sIds = Array.from(new Set(raw.map(r => r.submitted_by).filter(Boolean)));
      const rIds = Array.from(new Set(raw.map(r => r.reviewed_by).filter(Boolean)));
      const cIds = Array.from(new Set(raw.map(r => r.task?.contract_id).filter(Boolean)));
      const allIds = Array.from(new Set([...sIds, ...rIds]));
      const [{ data: ps }, { data: cs }] = await Promise.all([
        allIds.length ? supabase.from("profiles").select("id,full_name,email,role").in("id", allIds) : Promise.resolve({ data: [] as any[] }),
        cIds.length ? supabase.from("contracts").select("id,content_partner_id").in("id", cIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const pIds = Array.from(new Set((cs ?? []).map((c: any) => c.content_partner_id)));
      const { data: parts } = pIds.length ? await supabase.from("content_partners").select("id,name").in("id", pIds) : { data: [] as any[] };
      const pMap = new Map((ps ?? []).map((p: any) => [p.id, p]));
      const cMap = new Map((cs ?? []).map((c: any) => [c.id, c.content_partner_id]));
      const ptMap = new Map((parts ?? []).map((p: any) => [p.id, p.name]));
      setRows(raw.map(r => ({
        ...r,
        submitter: pMap.get(r.submitted_by),
        reviewer: r.reviewed_by ? pMap.get(r.reviewed_by) : null,
        partner_name: ptMap.get(cMap.get(r.task?.contract_id ?? "") ?? "") ?? "—",
      })));
    })();
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (status !== "all" && r.status !== status) return false;
    if (dateFrom && (!r.submitted_at || r.submitted_at < dateFrom)) return false;
    return true;
  }), [rows, status, dateFrom]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Submissions</h1>
        <p className="mt-1 text-sm text-text-secondary">{filtered.length} submission{filtered.length === 1 ? "" : "s"}</p>
      </div>
      <Card className="border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {["draft","submitted","under_review","approved","rejected","rework_requested"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-36" />
        </div>
      </Card>
      <Card className="border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase text-text-tertiary">
            <tr>
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Task</th><th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Submitter</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3">Reviewer</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-text-tertiary">No submissions.</td></tr>}
            {filtered.slice(0, 100).map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                <td className="px-4 py-3 text-text-tertiary text-xs">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <Link to="/manager/all-tasks/$id" params={{ id: r.task_id }} className="font-medium hover:text-primary">{r.task?.title ?? "—"}</Link>
                </td>
                <td className="px-4 py-3 text-text-secondary">{r.partner_name}</td>
                <td className="px-4 py-3 text-text-secondary">{r.submitter?.full_name ?? r.submitter?.email ?? "—"}</td>
                <td className="px-4 py-3 capitalize text-text-secondary">{r.submission_type.replace(/_/g," ")}</td>
                <td className="px-4 py-3"><Badge variant="secondary" className="capitalize">{r.status.replace(/_/g," ")}</Badge></td>
                <td className="px-4 py-3 text-text-secondary">{r.reviewer?.full_name ?? r.reviewer?.email ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

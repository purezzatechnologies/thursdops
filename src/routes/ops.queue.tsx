import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/ops/queue")({
  validateSearch: (s: Record<string, unknown>) => ({ type: s.type as string | undefined }),
  component: () => (<AppShell allowed={["ops_support", "super_admin"]}><Queue /></AppShell>),
});

interface Row { id: string; title: string; deliverable_type: string; due_date: string; status: string; is_extra: boolean; contract_id: string; updated_at: string; partner_name?: string; }

function Queue() {
  const { profile } = useAuth();
  const search = Route.useSearch();
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState<string>(search.type ?? "both");
  const [status, setStatus] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [reworkOnly, setReworkOnly] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const active = ["not_started", "in_progress", "rework_requested"] as const;
      const { data } = await supabase.from("tasks")
        .select("id,title,deliverable_type,due_date,status,is_extra,contract_id,updated_at")
        .eq("assigned_to", profile.id)
        .in("deliverable_type", ["newsletter", "social_post"])
        .in("status", active)
        .order("due_date", { ascending: true });
      const list = (data ?? []) as Row[];
      const cids = Array.from(new Set(list.map((r) => r.contract_id)));
      const { data: cs } = cids.length ? await supabase.from("contracts").select("id,content_partner_id").in("id", cids) : { data: [] };
      const pids = Array.from(new Set((cs ?? []).map((c) => c.content_partner_id)));
      const { data: ps } = pids.length ? await supabase.from("content_partners").select("id,name").in("id", pids) : { data: [] };
      const pmap = new Map((ps ?? []).map((p) => [p.id, p.name]));
      const cmap = new Map((cs ?? []).map((c) => [c.id, pmap.get(c.content_partner_id) ?? ""]));
      setRows(list.map((r) => ({ ...r, partner_name: cmap.get(r.contract_id) ?? "" })));
    })();
  }, [profile]);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = rows.filter((r) => {
    if (type !== "both" && r.deliverable_type !== type) return false;
    if (status !== "all" && r.status !== status) return false;
    if (overdueOnly && !(r.due_date < today)) return false;
    if (reworkOnly && r.status !== "rework_requested") return false;
    return true;
  }).sort((a, b) => {
    const sp = (s: string) => s === "rework_requested" ? 0 : s === "not_started" ? 1 : 2;
    const d = sp(a.status) - sp(b.status);
    return d !== 0 ? d : a.due_date.localeCompare(b.due_date);
  });
  const paged = filtered.slice(page * 25, (page + 1) * 25);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">URL Queue</h1>
      <Card className="border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Newsletters & socials</SelectItem>
              <SelectItem value="newsletter">Newsletter</SelectItem>
              <SelectItem value="social_post">Social post</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="rework_requested">Rework requested</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm"><Input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="h-4 w-4" />Overdue only</label>
          <label className="flex items-center gap-2 text-sm"><Input type="checkbox" checked={reworkOnly} onChange={(e) => setReworkOnly(e.target.checked)} className="h-4 w-4" />Rework only</label>
        </div>
      </Card>
      <Card className="overflow-hidden border-border">
        {paged.length === 0 ? (
          <p className="p-12 text-center text-sm text-text-tertiary">No tasks in your queue.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase text-text-tertiary">
              <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Partner</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const overdue = r.due_date < today;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-4 py-3"><div className="font-medium">{r.title}</div>{r.is_extra && <span className="rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">Bonus</span>}</td>
                    <td className="px-4 py-3"><Badge variant="secondary">{r.deliverable_type === "newsletter" ? "Newsletter" : "Social"}</Badge></td>
                    <td className="px-4 py-3 text-text-secondary">{r.partner_name}</td>
                    <td className={`px-4 py-3 ${overdue ? "font-semibold text-danger" : ""}`}>{new Date(r.due_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><Badge>{r.status.replace(/_/g, " ")}</Badge></td>
                    <td className="px-4 py-3 text-right"><Link to="/ops/tasks/$id" params={{ id: r.id }}><Button size="sm">Log URL</Button></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {filtered.length > 25 && (
        <div className="flex items-center justify-between text-sm text-text-tertiary">
          <span>Page {page + 1} of {Math.ceil(filtered.length / 25)}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" variant="outline" disabled={(page + 1) * 25 >= filtered.length} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      )}
    </div>
  );
}

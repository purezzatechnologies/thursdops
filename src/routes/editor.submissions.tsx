import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/editor/submissions")({
  validateSearch: (s: Record<string, unknown>) => ({ filter: s.filter as string | undefined }),
  component: () => (<AppShell allowed="editor"><History /></AppShell>),
});

interface Row {
  id: string; task_id: string; submission_type: string; status: string;
  submitted_at: string | null; created_at: string;
  reviewed_at: string | null; reviewed_by: string | null; review_comments: string | null;
  task_title?: string; partner_name?: string; reviewer_name?: string;
}

function History() {
  const { profile } = useAuth();
  const search = Route.useSearch();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(
    search.filter === "pending_review" ? "pending" : search.filter === "rework" ? "rework" : "all"
  );

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const { data } = await supabase.from("submissions")
        .select("id,task_id,submission_type,status,submitted_at,created_at,reviewed_at,reviewed_by,review_comments")
        .eq("submitted_by", profile.id)
        .order("created_at", { ascending: false });
      const list = (data ?? []) as Row[];
      const taskIds = Array.from(new Set(list.map((r) => r.task_id)));
      const reviewerIds = Array.from(new Set(list.map((r) => r.reviewed_by).filter(Boolean) as string[]));
      const { data: tasks } = taskIds.length ? await supabase.from("tasks").select("id,title,contract_id").in("id", taskIds) : { data: [] };
      const cids = Array.from(new Set((tasks ?? []).map((t) => t.contract_id).filter((v): v is string => !!v)));
      const { data: cs } = cids.length ? await supabase.from("contracts").select("id,content_partner_id").in("id", cids) : { data: [] };
      const pids = Array.from(new Set((cs ?? []).map((c) => c.content_partner_id)));
      const { data: ps } = pids.length ? await supabase.from("content_partners").select("id,name").in("id", pids) : { data: [] };
      const { data: rs } = reviewerIds.length ? await supabase.from("profiles").select("id,full_name,email").in("id", reviewerIds) : { data: [] };
      const pmap = new Map((ps ?? []).map((p) => [p.id, p.name]));
      const cmap = new Map((cs ?? []).map((c) => [c.id, pmap.get(c.content_partner_id) ?? ""]));
      const tmap = new Map((tasks ?? []).map((t) => [t.id, { title: t.title, partner: (t.contract_id ? cmap.get(t.contract_id) : "") ?? "" }]));
      const rmap = new Map((rs ?? []).map((r) => [r.id, r.full_name ?? r.email]));
      setRows(list.map((r) => ({
        ...r,
        task_title: tmap.get(r.task_id)?.title,
        partner_name: tmap.get(r.task_id)?.partner,
        reviewer_name: r.reviewed_by ? rmap.get(r.reviewed_by) ?? undefined : undefined,
      })));
    })();
  }, [profile]);

  const filtered = rows.filter((r) => {
    if (q && !(r.task_title ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (status === "pending" && !["submitted", "under_review"].includes(r.status)) return false;
    if (status === "rework" && !["rejected", "rework_requested"].includes(r.status)) return false;
    if (!["all", "pending", "rework"].includes(status) && r.status !== status) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">My Submissions</h1>
      <Card className="border-border p-4">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search task title…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending review</SelectItem>
              <SelectItem value="rework">Rework / Rejected</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>
      <Card className="overflow-hidden border-border">
        {filtered.length === 0 ? (
          <p className="p-12 text-center text-sm text-text-tertiary">No submissions yet. Submit your first piece of work from a task.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase text-text-tertiary">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Task</th><th className="px-4 py-3">Partner</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reviewer</th><th className="px-4 py-3">Comments</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3 text-xs">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : `Draft ${new Date(r.created_at).toLocaleDateString()}`}</td>
                  <td className="px-4 py-3"><Link to="/editor/tasks/$id" params={{ id: r.task_id }} className="font-medium hover:text-primary">{r.task_title}</Link></td>
                  <td className="px-4 py-3 text-text-secondary">{r.partner_name}</td>
                  <td className="px-4 py-3 capitalize">{r.submission_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3"><Badge>{r.status.replace(/_/g, " ")}</Badge></td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{r.reviewer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary" title={r.review_comments ?? ""}>{(r.review_comments ?? "").slice(0, 80)}{(r.review_comments?.length ?? 0) > 80 ? "…" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

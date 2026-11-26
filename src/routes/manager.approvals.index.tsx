import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/manager/approvals/")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <ApprovalQueue />
    </AppShell>
  ),
});

interface Row {
  id: string;
  task_id: string;
  status: string;
  submission_type: string;
  submitted_at: string | null;
  submitted_by: string;
  reviewing_by: string | null;
  reviewing_since: string | null;
  task_title: string;
  deliverable_type: string;
  is_extra: boolean;
  contract_id: string;
  partner_id: string;
  partner_name: string;
  submitter_name: string;
  submitter_role: string;
}

function ApprovalQueue() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  // All managers see every pending approval by default; "Mine to review" is an
  // optional filter to narrow to contracts they own.
  const [mineOnly, setMineOnly] = useState(false);
  const [partner, setPartner] = useState("all");
  const [type, setType] = useState("all");
  const [submitter, setSubmitter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 25;

  useEffect(() => {
    if (!profile) return;
    setMineOnly(profile.role === "manager");
  }, [profile]);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data: subs } = await supabase
      .from("submissions")
      .select("id,task_id,status,submission_type,submitted_at,submitted_by,reviewing_by,reviewing_since,task:tasks!inner(title,deliverable_type,is_extra,contract_id)")
      .in("status", ["submitted", "under_review", "manager_approved"])
      .order("submitted_at", { ascending: true });
    type Raw = {
      id: string; task_id: string; status: string; submission_type: string;
      submitted_at: string | null; submitted_by: string;
      reviewing_by: string | null; reviewing_since: string | null;
      task: { title: string; deliverable_type: string; is_extra: boolean; contract_id: string } | null;
    };
    const raw = (subs ?? []) as unknown as Raw[];
    const cIds = Array.from(new Set(raw.map((r) => r.task?.contract_id).filter(Boolean) as string[]));
    const sIds = Array.from(new Set(raw.map((r) => r.submitted_by)));
    const [{ data: cs }, { data: ps }] = await Promise.all([
      cIds.length ? supabase.from("contracts").select("id,content_partner_id").in("id", cIds) : Promise.resolve({ data: [] as any[] }),
      sIds.length ? supabase.from("profiles").select("id,full_name,email,role").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const pIds = Array.from(new Set((cs ?? []).map((c: any) => c.content_partner_id)));
    const { data: parts } = pIds.length
      ? await supabase.from("content_partners").select("id,name").in("id", pIds)
      : { data: [] as any[] };
    const cMap = new Map((cs ?? []).map((c: any) => [c.id, c.content_partner_id]));
    const pMap = new Map((parts ?? []).map((p: any) => [p.id, p.name]));
    const sMap = new Map((ps ?? []).map((s: any) => [s.id, { name: s.full_name ?? s.email, role: s.role }]));
    const out: Row[] = raw.map((r) => {
      const pid = cMap.get(r.task?.contract_id ?? "") ?? "";
      return {
        id: r.id, task_id: r.task_id, status: r.status, submission_type: r.submission_type,
        submitted_at: r.submitted_at, submitted_by: r.submitted_by,
        reviewing_by: r.reviewing_by, reviewing_since: r.reviewing_since,
        task_title: r.task?.title ?? "", deliverable_type: r.task?.deliverable_type ?? "",
        is_extra: r.task?.is_extra ?? false, contract_id: r.task?.contract_id ?? "",
        partner_id: pid, partner_name: pMap.get(pid) ?? "—",
        submitter_name: sMap.get(r.submitted_by)?.name ?? "Unknown",
        submitter_role: sMap.get(r.submitted_by)?.role ?? "",
      };
    });
    setRows(out);

    if (mineOnly && profile.role === "manager") {
      // already filtered in client below via mineOnly + owners
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [profile]);

  // For mineOnly: get owned contracts
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const { data } = await supabase.from("contract_owners").select("contract_id").eq("profile_id", profile.id);
      setOwnedIds(new Set((data ?? []).map((o) => o.contract_id)));
    })();
  }, [profile]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (mineOnly && !ownedIds.has(r.contract_id)) return false;
      if (partner !== "all" && r.partner_id !== partner) return false;
      if (type !== "all" && r.deliverable_type !== type) return false;
      if (submitter !== "all" && r.submitted_by !== submitter) return false;
      if (dateFrom && (!r.submitted_at || r.submitted_at < dateFrom)) return false;
      if (dateTo && (!r.submitted_at || r.submitted_at > dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [rows, mineOnly, ownedIds, partner, type, submitter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const slice = filtered.slice((page - 1) * perPage, page * perPage);

  const partners = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.partner_id, r.partner_name));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);
  const submitters = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.submitted_by, r.submitter_name));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  function waitingLabel(iso: string | null) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return `${d}d ${h}h`;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approval queue</h1>
        <p className="mt-1 text-sm text-text-secondary">{filtered.length} submission{filtered.length === 1 ? "" : "s"} awaiting review</p>
      </div>

      <Card className="border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={partner} onValueChange={setPartner}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Partner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All partners</SelectItem>
              {partners.filter((p) => p.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {["article", "newsletter", "homepage_banner", "article_banner", "social_post"].map((t) =>
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={submitter} onValueChange={setSubmitter}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Submitter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All submitters</SelectItem>
              {submitters.filter((s) => s.id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-36" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-36" />
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Mine to review
          </label>
        </div>
      </Card>

      {loading ? (
        <Card className="border-border p-12 text-center text-sm text-text-tertiary">Loading…</Card>
      ) : slice.length === 0 ? (
        <Card className="border-border p-12 text-center text-sm text-text-tertiary">No submissions waiting for review.</Card>
      ) : (
        <Card className="border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-text-tertiary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Task</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Partner</th>
                  <th className="px-4 py-3 font-semibold">Submitter</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 font-semibold">Waiting</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => {
                  const waitingDays = r.submitted_at ? (Date.now() - new Date(r.submitted_at).getTime()) / 86400000 : 0;
                  const lockedByOther =
                    r.reviewing_by &&
                    r.reviewing_by !== profile?.id &&
                    r.reviewing_since &&
                    Date.now() - new Date(r.reviewing_since).getTime() < 30 * 60 * 1000;
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <Link to="/manager/all-tasks/$id" params={{ id: r.task_id }} className="font-medium hover:text-primary">
                          {r.task_title}
                        </Link>
                        {r.is_extra && <Badge className="ml-2 bg-primary-light text-primary text-[9px]">Bonus</Badge>}
                        {lockedByOther && <div className="mt-1 text-[10px] text-warning">Being reviewed</div>}
                      </td>
                      <td className="px-4 py-3 capitalize text-text-secondary">{(DELIVERABLE_LABEL_SINGULAR[r.deliverable_type] ?? r.deliverable_type.replace(/_/g, " "))}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.partner_name}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {r.submitter_name}
                        <span className="ml-1 text-[10px] capitalize text-text-tertiary">({r.submitter_role.replace(/_/g, " ")})</span>
                      </td>
                      <td className="px-4 py-3 text-text-tertiary">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}</td>
                      <td className={cn("px-4 py-3", waitingDays > 3 && "font-semibold text-danger")}>{waitingLabel(r.submitted_at)}</td>
                      <td className="px-4 py-3"><Badge variant="secondary" className="capitalize">{r.status.replace(/_/g, " ")}</Badge></td>
                      <td className="px-4 py-3">
                        <Link to="/manager/approvals/$submissionId" params={{ submissionId: r.id }}>
                          <Button size="sm">Review</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-tertiary">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                <Button size="sm" variant="ghost" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

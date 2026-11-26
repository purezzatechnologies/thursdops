import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Edit, FileText, LayoutGrid, Plus, Rows3, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  contractStatusTone,
  PLAN_TYPE_LABELS,
  shortId,
} from "@/lib/contract-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/contracts/")({
  component: () => (
    <AppShell allowed={["super_admin", "manager", "editor", "ops_support"]}>
      <ContractsList />
    </AppShell>
  ),
});

interface Row {
  id: string;
  plan_type: string;
  status: string;
  start_date: string;
  end_date: string;
  partner_id: string;
  partner_name: string;
  totals: number;
  delivered: number;
  scheduled: number;
  owners: { id: string; name: string }[];
}

const PAGE = 24;

/** Human "12 days left" / "Ended 3 days ago" label + urgency tone. */
function endLabel(end: string, status: string): { text: string; tone: "ok" | "soon" | "over" } {
  const days = Math.round((new Date(end).getTime() - Date.now()) / 86400000);
  if (["completed", "cancelled", "expired"].includes(status)) {
    return { text: new Date(end).toLocaleDateString(), tone: "ok" };
  }
  if (days < 0) return { text: `Ended ${Math.abs(days)}d ago`, tone: "over" };
  if (days === 0) return { text: "Ends today", tone: "soon" };
  if (days <= 7) return { text: `${days}d left`, tone: "soon" };
  return { text: `${days}d left`, tone: "ok" };
}

function ContractsList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [myOnly, setMyOnly] = useState(profile?.role === "manager");
  const [sortBy, setSortBy] = useState<"end_asc" | "start_desc" | "partner">("end_asc");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"cards" | "table">("cards");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: contracts }, { data: parts }] = await Promise.all([
      supabase
        .from("contracts")
        .select("id,plan_type,status,start_date,end_date,content_partner_id,total_articles,total_newsletters,total_homepage_banners,total_article_banners,total_social_posts")
        .order("end_date", { ascending: true }),
      supabase.from("content_partners").select("id,name").order("name"),
    ]);

    setPartners(parts ?? []);
    const partnerMap = new Map((parts ?? []).map((p) => [p.id, p.name]));

    const contractIds = (contracts ?? []).map((c) => c.id);
    // fetch all tasks for these contracts to compute progress aggregate
    const taskCounts = new Map<string, { delivered: number; scheduled: number }>();
    if (contractIds.length) {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("contract_id,status,is_extra")
        .in("contract_id", contractIds)
        .eq("is_extra", false);
      for (const t of tasks ?? []) {
        if (!t.contract_id) continue;
        const cur = taskCounts.get(t.contract_id) ?? { delivered: 0, scheduled: 0 };
        if (t.status === "completed") cur.delivered++;
        else if (
          ["not_started", "in_progress", "submitted", "under_review", "rework_requested", "approved"].includes(t.status)
        )
          cur.scheduled++;
        taskCounts.set(t.contract_id, cur);
      }
    }

    // owners
    const ownersByContract = new Map<string, { id: string; name: string }[]>();
    if (contractIds.length) {
      const { data: ow } = await supabase
        .from("contract_owners")
        .select("contract_id,profile_id")
        .in("contract_id", contractIds);
      const oprofIds = Array.from(new Set((ow ?? []).map((o) => o.profile_id)));
      const profMap = new Map<string, string>();
      if (oprofIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", oprofIds);
        for (const p of profs ?? []) profMap.set(p.id, p.full_name ?? p.email);
      }
      for (const o of ow ?? []) {
        const arr = ownersByContract.get(o.contract_id) ?? [];
        arr.push({ id: o.profile_id, name: profMap.get(o.profile_id) ?? "—" });
        ownersByContract.set(o.contract_id, arr);
      }
    }

    const result: Row[] = (contracts ?? []).map((c) => {
      const totals =
        (c.total_articles ?? 0) +
        (c.total_newsletters ?? 0) +
        (c.total_homepage_banners ?? 0) +
        (c.total_article_banners ?? 0) +
        (c.total_social_posts ?? 0);
      const tc = taskCounts.get(c.id) ?? { delivered: 0, scheduled: 0 };
      return {
        id: c.id,
        plan_type: c.plan_type,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        partner_id: c.content_partner_id,
        partner_name: partnerMap.get(c.content_partner_id) ?? "—",
        totals,
        delivered: tc.delivered,
        scheduled: tc.scheduled,
        owners: ownersByContract.get(c.id) ?? [],
      };
    });

    setRows(result);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    if (partnerFilter !== "all") r = r.filter((x) => x.partner_id === partnerFilter);
    if (myOnly && profile) r = r.filter((x) => x.owners.some((o) => o.id === profile.id));
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      r = r.filter(
        (x) =>
          x.partner_name.toLowerCase().includes(term) ||
          x.id.toLowerCase().includes(term),
      );
    }
    const sorted = [...r];
    if (sortBy === "end_asc") sorted.sort((a, b) => a.end_date.localeCompare(b.end_date));
    else if (sortBy === "start_desc") sorted.sort((a, b) => b.start_date.localeCompare(a.start_date));
    else sorted.sort((a, b) => a.partner_name.localeCompare(b.partner_name));
    return sorted;
  }, [rows, statusFilter, partnerFilter, myOnly, q, sortBy, profile]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Contracts"
        subtitle="Manage content partnership contracts and deliverables."
        actions={
          <Button onClick={() => navigate({ to: "/contracts/new" })}>
            <Plus className="mr-1.5 h-4 w-4" /> New Contract
          </Button>
        }
      />

      <Card className="mb-5 border-border">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search partner name or contract ID"
              className="pl-9"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-text-tertiary">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-text-tertiary">Partner</Label>
            <Select value={partnerFilter} onValueChange={(v) => { setPartnerFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All partners</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-text-tertiary">Sort by</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="end_asc">End date (soonest)</SelectItem>
                <SelectItem value="start_desc">Start date (newest)</SelectItem>
                <SelectItem value="partner">Partner name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pl-3">
            <Switch checked={myOnly} onCheckedChange={(v) => { setMyOnly(v); setPage(1); }} id="myc" />
            <Label htmlFor="myc" className="text-sm">My contracts only</Label>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
            <button
              onClick={() => setView("cards")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${view === "cards" ? "bg-card text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"}`}
              aria-label="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${view === "table" ? "bg-card text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"}`}
              aria-label="Table view"
            >
              <Rows3 className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </CardContent>
      </Card>

      {!loading && (
        <div className="mb-3 flex items-center justify-between px-1 text-xs text-text-tertiary">
          <span>{filtered.length} contract{filtered.length === 1 ? "" : "s"}{statusFilter !== "all" ? ` · ${statusFilter}` : ""}</span>
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-sm text-text-tertiary">Loading…</div>
      )}

      {!loading && pageRows.length === 0 && (
        <Card className="border-border">
          <CardContent className="py-14">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary"><FileText className="h-5 w-5" /></div>
              <div className="text-sm font-semibold">No contracts found</div>
              <div className="mt-1 text-xs text-text-tertiary">Adjust your filters, or create a new contract.</div>
              <Button className="mt-4" onClick={() => navigate({ to: "/contracts/new" })}>
                <Plus className="mr-1.5 h-4 w-4" /> Create a contract
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card view */}
      {!loading && pageRows.length > 0 && view === "cards" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((r) => (
            <ContractCard key={r.id} r={r} onOpen={() => navigate({ to: "/contracts/$id", params: { id: r.id } })} />
          ))}
        </div>
      )}

      {/* Table view */}
      {!loading && pageRows.length > 0 && view === "table" && (
        <Card className="border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                  <TableHead>ID</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Owners</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => {
                  const pct = r.totals === 0 ? 0 : Math.min(100, Math.round(((r.delivered + r.scheduled) / r.totals) * 100));
                  const deliveredPct = r.totals === 0 ? 0 : Math.round((r.delivered / r.totals) * 100);
                  return (
                    <TableRow key={r.id} className="h-16 cursor-pointer hover:bg-secondary/40" onClick={() => navigate({ to: "/contracts/$id", params: { id: r.id } })}>
                      <TableCell className="font-mono text-xs text-text-secondary">{shortId(r.id)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Link to="/partners/$id" params={{ id: r.partner_id }} className="font-medium text-text-primary hover:text-primary hover:underline">
                          {r.partner_name}
                        </Link>
                      </TableCell>
                      <TableCell><StatusBadge tone="neutral">{PLAN_TYPE_LABELS[r.plan_type] ?? r.plan_type}</StatusBadge></TableCell>
                      <TableCell className="text-sm">{new Date(r.start_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{new Date(r.end_date).toLocaleDateString()}</TableCell>
                      <TableCell><StatusBadge tone={contractStatusTone(r.status)}>{r.status}</StatusBadge></TableCell>
                      <TableCell className="w-[180px]">
                        <div className="text-[11px] text-text-tertiary">{r.delivered}/{r.totals} delivered · {pct}%</div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div className="h-full bg-success" style={{ width: `${deliveredPct}%` }} />
                          <div className="-mt-1.5 h-full bg-info" style={{ width: `${pct - deliveredPct}%`, marginLeft: `${deliveredPct}%` }} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex -space-x-1.5">
                          {r.owners.slice(0, 3).map((o) => (
                            <div key={o.id} title={o.name} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary-light text-[10px] font-semibold text-primary">
                              {o.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                            </div>
                          ))}
                          {r.owners.length > 3 && (
                            <div className="flex h-7 items-center rounded-full border-2 border-card bg-secondary px-2 text-[10px] font-semibold text-text-secondary" title={r.owners.slice(3).map((o) => o.name).join(", ")}>
                              +{r.owners.length - 3}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Link to="/contracts/$id" params={{ id: r.id }} className="text-sm font-medium text-primary hover:underline">View</Link>
                        <Link to="/contracts/$id/edit" params={{ id: r.id }} className="ml-3 text-sm font-medium text-text-secondary hover:text-text-primary">Edit</Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!loading && pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <div className="text-text-tertiary">Page {page} of {pageCount} · {filtered.length} total</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<string, { dot: string; text: string }> = {
  active: { dot: "bg-success", text: "text-success" },
  completed: { dot: "bg-info", text: "text-info" },
  expired: { dot: "bg-warning", text: "text-warning" },
  cancelled: { dot: "bg-text-tertiary", text: "text-text-tertiary" },
  draft: { dot: "bg-text-tertiary", text: "text-text-tertiary" },
};

/** A single contract as an editorial "spec-sheet" card. */
function ContractCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const pct = r.totals === 0 ? 0 : Math.min(100, Math.round(((r.delivered + r.scheduled) / r.totals) * 100));
  const unscheduled = Math.max(0, r.totals - r.delivered - r.scheduled);
  const end = endLabel(r.end_date, r.status);
  const endToneCls =
    end.tone === "over" ? "text-danger" : end.tone === "soon" ? "text-warning" : "text-text-tertiary";
  const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.draft;
  const deliveredPct = r.totals === 0 ? 0 : Math.round((r.delivered / r.totals) * 100);
  const scheduledPct = Math.max(0, pct - deliveredPct);

  return (
    <Card
      className="group relative flex cursor-pointer flex-col overflow-hidden border-border card-hover transition-all hover:-translate-y-0.5"
      onClick={onOpen}
    >
      <CardContent className="flex h-full flex-col p-0">
        {/* Masthead: plan · id  |  status */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            {PLAN_TYPE_LABELS[r.plan_type] ?? r.plan_type} · #{shortId(r.id)}
          </span>
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${st.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {r.status}
          </span>
        </div>

        {/* Headline: partner name */}
        <div className="px-5 pt-2">
          <Link
            to="/partners/$id"
            params={{ id: r.partner_id }}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-xl font-bold leading-tight tracking-tight text-text-primary hover:text-primary"
          >
            {r.partner_name}
          </Link>
          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(r.start_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })}
            {" → "}
            {new Date(r.end_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })}
            <span className={`ml-0.5 font-semibold ${endToneCls}`}>· {end.text}</span>
          </div>
        </div>

        {/* Completion */}
        <div className="px-5 pt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Completion</span>
            <span className="text-[11px] text-text-tertiary">
              <b className="text-text-primary">{r.delivered + r.scheduled}</b> of {r.totals} · <b className="text-text-primary">{pct}%</b>
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-success" style={{ width: `${deliveredPct}%` }} />
            <div className="h-full bg-info" style={{ width: `${scheduledPct}%` }} />
          </div>
        </div>

        {/* Spec grid */}
        <div className="mx-5 mt-4 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-secondary/30">
          <Spec value={r.delivered} label="Delivered" tone="text-success" />
          <Spec value={r.scheduled} label="Scheduled" tone="text-info" />
          <Spec value={unscheduled} label="To plan" tone="text-text-secondary" />
        </div>

        {/* Ticket footer */}
        <div className="mt-auto flex items-center justify-between border-t border-dashed border-border px-5 py-3.5">
          {r.owners.length > 0 ? (
            <div className="flex items-center -space-x-2" title={r.owners.map((o) => o.name).join(", ")}>
              {r.owners.slice(0, 3).map((o) => (
                <div key={o.id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary-light text-[10px] font-semibold text-primary">
                  {o.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                </div>
              ))}
              {r.owners.length > 3 && (
                <div className="flex h-7 items-center rounded-full border-2 border-card bg-secondary px-1.5 text-[10px] font-semibold text-text-secondary">
                  +{r.owners.length - 3}
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-tertiary"><Users className="h-3.5 w-3.5" /> Unassigned</span>
          )}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Link to="/contracts/$id/edit" params={{ id: r.id }} className="rounded-lg p-2 text-text-tertiary hover:bg-secondary hover:text-text-primary" title="Edit contract">
              <Edit className="h-4 w-4" />
            </Link>
            <Link to="/contracts/$id" params={{ id: r.id }} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary hover:underline">
              Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Spec({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="px-2 py-2.5 text-center">
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">{label}</div>
    </div>
  );
}

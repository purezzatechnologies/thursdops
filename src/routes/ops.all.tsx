import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { claimTask } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, List, Calendar as CalendarIcon } from "lucide-react";

export const Route = createFileRoute("/ops/all")({
  component: () => (<AppShell allowed={["ops_support", "super_admin"]}><AllNS /></AppShell>),
});

interface Row { id: string; title: string; deliverable_type: string; due_date: string; status: string; is_extra: boolean; contract_id: string; assigned_to: string | null; partner_name?: string; assignee_name?: string | null; }

function AllNS() {
  const { profile } = useAuth();
  const callClaim = useServerFn(claimTask);
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState("both");
  const [assigned, setAssigned] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  async function load() {
    const { data } = await supabase.from("tasks")
      .select("id,title,deliverable_type,due_date,status,is_extra,contract_id,assigned_to")
      .in("deliverable_type", ["newsletter", "social_post"])
      .order("due_date", { ascending: true });
    const list = (data ?? []) as Row[];
    const cids = Array.from(new Set(list.map((r) => r.contract_id)));
    const aids = Array.from(new Set(list.map((r) => r.assigned_to).filter(Boolean) as string[]));
    const { data: cs } = cids.length ? await supabase.from("contracts").select("id,content_partner_id").in("id", cids) : { data: [] };
    const pids = Array.from(new Set((cs ?? []).map((c) => c.content_partner_id)));
    const { data: ps } = pids.length ? await supabase.from("content_partners").select("id,name").in("id", pids) : { data: [] };
    const { data: assignees } = aids.length ? await supabase.from("profiles").select("id,full_name,email").in("id", aids) : { data: [] };
    const pmap = new Map((ps ?? []).map((p) => [p.id, p.name]));
    const cmap = new Map((cs ?? []).map((c) => [c.id, pmap.get(c.content_partner_id) ?? ""]));
    const amap = new Map((assignees ?? []).map((a) => [a.id, a.full_name ?? a.email]));
    setRows(list.map((r) => ({ ...r, partner_name: cmap.get(r.contract_id) ?? "", assignee_name: r.assigned_to ? amap.get(r.assigned_to) ?? null : null })));
  }
  useEffect(() => { void load(); }, []);

  async function onClaim(id: string) {
    try { await callClaim({ data: { task_id: id } }); toast.success("Claimed."); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); }
  }

  const filtered = rows.filter((r) => {
    if (type !== "both" && r.deliverable_type !== type) return false;
    if (status !== "all" && r.status !== status) return false;
    if (assigned === "unassigned" && r.assigned_to) return false;
    if (assigned === "saral" && r.assigned_to !== profile?.id) return false;
    if (assigned === "other" && (!r.assigned_to || r.assigned_to === profile?.id)) return false;
    return true;
  });
  const paged = filtered.slice(page * 50, (page + 1) * 50);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">All Newsletters & Socials</h1>
        <div className="flex gap-1 rounded-md border border-border p-1">
          <Button size="sm" variant={view === "list" ? "default" : "ghost"} onClick={() => setView("list")}><List className="mr-1 h-4 w-4" />List</Button>
          <Button size="sm" variant={view === "calendar" ? "default" : "ghost"} onClick={() => setView("calendar")}><CalendarIcon className="mr-1 h-4 w-4" />Calendar</Button>
        </div>
      </div>
      <Card className="border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="both">Both types</SelectItem><SelectItem value="newsletter">Newsletter</SelectItem><SelectItem value="social_post">Social post</SelectItem></SelectContent>
          </Select>
          <Select value={assigned} onValueChange={setAssigned}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All assignees</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem><SelectItem value="saral">Me</SelectItem><SelectItem value="other">Someone else</SelectItem></SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="not_started">Not started</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="submitted">Submitted</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent>
          </Select>
        </div>
      </Card>

      {view === "list" ? (
        <>
          <Card className="overflow-hidden border-border">
            {paged.length === 0 ? (
              <p className="p-12 text-center text-sm text-text-tertiary">No matching tasks.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left text-xs uppercase text-text-tertiary">
                  <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Partner</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3"></th></tr>
                </thead>
                <tbody>
                  {paged.map((r) => {
                    const canClaim = !r.assigned_to && r.status === "not_started" && profile?.role === "ops_support";
                    const mine = r.assigned_to === profile?.id;
                    const ended = r.status === "completed" || r.status === "cancelled";
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                        <td className="px-4 py-3"><div className="font-medium">{r.title}</div>{r.is_extra && <span className="rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">Bonus</span>}</td>
                        <td className="px-4 py-3"><Badge variant="secondary">{r.deliverable_type === "newsletter" ? "Newsletter" : "Social"}</Badge></td>
                        <td className="px-4 py-3 text-text-secondary">{r.partner_name}</td>
                        <td className="px-4 py-3">{new Date(r.due_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><Badge>{r.status.replace(/_/g, " ")}</Badge></td>
                        <td className="px-4 py-3 text-text-secondary">{r.assignee_name ?? <span className="text-text-tertiary">Unassigned</span>}</td>
                        <td className="px-4 py-3 text-right">
                          {ended ? null : canClaim ? (
                            <Button size="sm" variant="outline" onClick={() => void onClaim(r.id)}>Claim</Button>
                          ) : mine ? (
                            <Link to="/ops/tasks/$id" params={{ id: r.id }}><Button size="sm">Open</Button></Link>
                          ) : (
                            <Link to="/ops/tasks/$id" params={{ id: r.id }}><Button size="sm" variant="outline">View</Button></Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
          {filtered.length > 50 && (
            <div className="flex items-center justify-between text-sm text-text-tertiary">
              <span>Page {page + 1} of {Math.ceil(filtered.length / 50)}</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" variant="outline" disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(page + 1)}>Next</Button></div>
            </div>
          )}
        </>
      ) : (
        <CalendarView rows={filtered} cursor={cursor} setCursor={setCursor} meId={profile?.id} onClaim={onClaim} canClaimRole={profile?.role === "ops_support"} />
      )}
    </div>
  );
}

function CalendarView({ rows, cursor, setCursor, meId, onClaim, canClaimRole }: { rows: Row[]; cursor: Date; setCursor: (d: Date) => void; meId?: string; onClaim: (id: string) => void; canClaimRole: boolean; }) {
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: Array<{ date: Date | null }> = [];
    for (let i = 0; i < startWeekday; i++) arr.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) arr.push({ date: new Date(year, month, d) });
    while (arr.length % 7 !== 0) arr.push({ date: null });
    return arr;
  }, [cursor]);

  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.due_date.slice(0, 10);
      const list = m.get(k) ?? [];
      list.push(r);
      m.set(k, list);
    }
    return m;
  }, [rows]);

  const [selected, setSelected] = useState<string | null>(null);
  const selectedRows = selected ? (byDate.get(selected) ?? []) : [];
  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d); }}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d); }}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-secondary/50 p-2 text-center font-semibold uppercase text-text-tertiary">{d}</div>
        ))}
        {cells.map((c, i) => {
          const key = c.date ? c.date.toISOString().slice(0, 10) : null;
          const items = key ? (byDate.get(key) ?? []) : [];
          const isToday = key === today;
          return (
            <button
              key={i}
              type="button"
              disabled={!c.date}
              onClick={() => key && setSelected(key)}
              className={`min-h-[88px] bg-background p-1.5 text-left transition hover:bg-secondary/40 disabled:cursor-default disabled:bg-secondary/20 ${selected === key ? "ring-2 ring-primary" : ""}`}
            >
              {c.date && (
                <>
                  <div className={`mb-1 text-[11px] font-semibold ${isToday ? "text-primary" : "text-text-secondary"}`}>{c.date.getDate()}</div>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((r) => (
                      <div key={r.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] ${r.deliverable_type === "newsletter" ? "bg-primary-light text-primary" : "bg-accent text-accent-foreground"}`}>{r.title}</div>
                    ))}
                    {items.length > 3 && <div className="text-[10px] text-text-tertiary">+{items.length - 3} more</div>}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Due {new Date(selected).toLocaleDateString()}</h3>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </div>
          {selectedRows.length === 0 ? (
            <p className="text-sm text-text-tertiary">No tasks due this day.</p>
          ) : (
            <ul className="space-y-2">
              {selectedRows.map((r) => {
                const canClaim = !r.assigned_to && r.status === "not_started" && canClaimRole;
                const mine = r.assigned_to === meId;
                const ended = r.status === "completed" || r.status === "cancelled";
                return (
                  <li key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-text-tertiary">{r.partner_name} · <Badge variant="secondary" className="text-[10px]">{r.deliverable_type === "newsletter" ? "Newsletter" : "Social"}</Badge> · {r.status.replace(/_/g, " ")}</div>
                    </div>
                    {ended ? null : canClaim ? (
                      <Button size="sm" variant="outline" onClick={() => onClaim(r.id)}>Claim</Button>
                    ) : (
                      <Link to="/ops/tasks/$id" params={{ id: r.id }}><Button size="sm" variant={mine ? "default" : "outline"}>{mine ? "Open" : "View"}</Button></Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

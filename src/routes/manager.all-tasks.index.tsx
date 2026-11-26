import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { updateTaskStatus } from "@/lib/contracts.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { computePriority, statusBucket, priorityColor, weekLabel, type PriorityBucket, type StatusBucket } from "@/lib/week";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { WeekKanban } from "@/components/week-kanban";
import { TaskCalendar } from "@/components/task-calendar";
import { TaskActionButtons } from "@/components/task-actions";
import { submissionImage } from "@/components/task-quick-view";

export const Route = createFileRoute("/manager/all-tasks/")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <AllTasks />
    </AppShell>
  ),
});

interface T {
  id: string; title: string; deliverable_type: string; status: string; priority: string;
  due_date: string; is_extra: boolean; contract_id: string | null; assigned_to: string | null;
  task_origin: string; week_start: string | null;
  partner_id?: string; partner_name?: string; assignee_name?: string; assignee_role?: string; assignee_avatar_url?: string | null;
  featured_image_url?: string | null;
  featured_image?: string | null;
}

const STATUS_BUCKETS: { key: StatusBucket; label: string; dot: string }[] = [
  { key: "open", label: "Open", dot: "bg-slate-400" },
  { key: "in_progress", label: "In Progress", dot: "bg-sky-500" },
  { key: "closed", label: "Closed", dot: "bg-emerald-500" },
];

const PRIORITY_BUCKETS: { key: PriorityBucket; label: string; dot: string }[] = [
  { key: "critical", label: "Critical", dot: "bg-red-500" },
  { key: "yellow", label: "Yellow", dot: "bg-amber-500" },
  { key: "green", label: "Green", dot: "bg-emerald-500" },
];

function AllTasks() {
  const [tasks, setTasks] = useState<T[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [partner, setPartner] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [origin, setOrigin] = useState<"all" | "contract" | "editorial">("all");
  const [statusFilter, setStatusFilter] = useState<Set<StatusBucket>>(new Set(["open", "in_progress", "closed"]));
  const [priorityFilter, setPriorityFilter] = useState<Set<PriorityBucket>>(new Set(["critical", "yellow", "green"]));
  const [view, setView] = useState<"week-kanban" | "calendar" | "list">("week-kanban");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDueDate, setCreateDueDate] = useState<string | undefined>(undefined);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, positive = future

  const callUpdateStatus = useServerFn(updateTaskStatus);
  async function handleStatusChange(taskId: string, status: string) {
    await callUpdateStatus({ data: { task_id: taskId, status: status as any } });
    await reload();
  }

  function openCreate(dateISO?: string) {
    setCreateDueDate(dateISO);
    setCreateOpen(true);
  }

  async function reload() {
    const { data: ts } = await supabase.from("tasks")
      .select("id,title,deliverable_type,status,priority,due_date,is_extra,contract_id,assigned_to,task_origin,week_start,copied_from_task_id,sort_order,featured_image_url")
      .order("due_date", { ascending: true });
    const list = (ts ?? []) as T[];
    const cIds = Array.from(new Set(list.map((t) => t.contract_id).filter((v): v is string => !!v)));
    const aIds = Array.from(new Set(list.map((t) => t.assigned_to).filter(Boolean) as string[]));
    const [{ data: cs }, { data: ps }] = await Promise.all([
      cIds.length ? supabase.from("contracts").select("id,content_partner_id").in("id", cIds) : Promise.resolve({ data: [] as any[] }),
      aIds.length ? supabase.from("profiles").select("id,full_name,email,role,avatar_url").in("id", aIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const pIds = Array.from(new Set((cs ?? []).map((c: any) => c.content_partner_id)));
    const { data: parts } = pIds.length ? await supabase.from("content_partners").select("id,name").in("id", pIds) : { data: [] as any[] };
    // Featured image per task = most recent submission that carries an image.
    const taskIds = list.map((t) => t.id);
    const { data: subs } = taskIds.length
      ? await supabase
          .from("submissions")
          .select("task_id,screenshot_url,file_url,url,submission_type,created_at")
          .in("task_id", taskIds)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };
    const imgMap = new Map<string, string>();
    for (const s of subs ?? []) {
      if (imgMap.has(s.task_id)) continue; // keep newest only
      const img = submissionImage(s);
      if (img) imgMap.set(s.task_id, img);
    }
    const cMap = new Map((cs ?? []).map((c: any) => [c.id, c.content_partner_id]));
    const pMap = new Map((parts ?? []).map((p: any) => [p.id, p.name]));
    const aMap = new Map((ps ?? []).map((p: any) => [p.id, p.full_name ?? p.email]));
    const aRoleMap = new Map((ps ?? []).map((p: any) => [p.id, p.role as string]));
    const aAvatarMap = new Map((ps ?? []).map((p: any) => [p.id, p.avatar_url as string | null]));
    setTasks(list.map((t) => ({
      ...t,
      partner_id: t.contract_id ? cMap.get(t.contract_id) : undefined,
      partner_name: t.contract_id ? (pMap.get(cMap.get(t.contract_id) ?? "") ?? "—") : "Editorial",
      assignee_name: t.assigned_to ? aMap.get(t.assigned_to) : undefined,
      assignee_role: t.assigned_to ? aRoleMap.get(t.assigned_to) : undefined,
      assignee_avatar_url: t.assigned_to ? (aAvatarMap.get(t.assigned_to) ?? null) : null,
      featured_image: t.featured_image_url ?? imgMap.get(t.id) ?? null,
    })));
  }

  useEffect(() => { void reload(); }, []);

  const today = new Date();
  const partners = useMemo(() => {
    const m = new Map<string, string>();
    tasks.forEach((t) => { if (t.partner_id) m.set(t.partner_id, t.partner_name!); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);
  const assignees = useMemo(() => {
    const m = new Map<string, string>();
    tasks.forEach((t) => { if (t.assigned_to) m.set(t.assigned_to, t.assignee_name!); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  // Decorate tasks with computed buckets
  const decorated = useMemo(() => tasks.map((t) => ({
    ...t,
    bucket: statusBucket(t.status),
    priority_bucket: computePriority(t.due_date, t.status, today) as PriorityBucket,
  })), [tasks, today]);

  // Pre-filter (everything except status/priority/week so chips show counts)
  const preFiltered = useMemo(() => decorated.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (type !== "all" && t.deliverable_type !== type) return false;
    if (partner !== "all" && t.partner_id !== partner) return false;
    if (assignee !== "all" && (assignee === "unassigned" ? t.assigned_to !== null : t.assigned_to !== assignee)) return false;
    if (origin !== "all" && t.task_origin !== origin) return false;
    return true;
  }), [decorated, q, type, partner, assignee, origin]);

  const filtered = useMemo(() => preFiltered.filter((t) =>
    statusFilter.has(t.bucket) && priorityFilter.has(t.priority_bucket),
  ), [preFiltered, statusFilter, priorityFilter]);

  // Status / priority counts (within pre-filter, before status/priority chips)
  const statusCounts = useMemo(() => {
    const c: Record<StatusBucket, number> = { open: 0, in_progress: 0, closed: 0 };
    preFiltered.forEach((t) => { c[t.bucket]++; });
    return c;
  }, [preFiltered]);
  const priorityCounts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, yellow: 0, green: 0, none: 0 };
    preFiltered.forEach((t) => { c[t.priority_bucket ?? "none"]++; });
    return c;
  }, [preFiltered]);

  // tasksByWeek computation handled inside WeekKanban


  function toggleStatusChip(b: StatusBucket) {
    setStatusFilter((p) => {
      const n = new Set(p);
      if (n.has(b)) n.delete(b); else n.add(b);
      return n;
    });
  }
  function togglePriorityChip(b: PriorityBucket) {
    setPriorityFilter((p) => {
      const n = new Set(p);
      if (n.has(b)) n.delete(b); else n.add(b);
      return n;
    });
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Tasks</h1>
          <p className="mt-1 text-sm text-text-secondary">{filtered.length} of {tasks.length} task{tasks.length === 1 ? "" : "s"} · weeks run Thursday → Wednesday</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {(["week-kanban", "calendar", "list"] as const).map((m) => (
              <button key={m} onClick={() => setView(m)}
                className={cn("rounded-md px-3 py-1.5 text-xs font-medium capitalize",
                  view === m ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-text-primary")}>
                {m === "week-kanban" ? "Week board" : m === "calendar" ? "Calendar" : "List"}
              </button>
            ))}
          </div>
          <Button onClick={() => openCreate()} className="gap-1.5">
            <Plus className="h-4 w-4" /> Create Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-text-tertiary" />
          <Input placeholder="Search title…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {["article", "newsletter", "homepage_banner", "article_banner", "social_post"].map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={origin} onValueChange={(v) => setOrigin(v as any)}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All origins</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="editorial">Editorial</SelectItem>
            </SelectContent>
          </Select>
          <Select value={partner} onValueChange={setPartner}>
            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Partner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All partners</SelectItem>
              {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignees.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="ml-2 flex items-center gap-1 border-l border-border pl-2">
            <span className="text-[10px] uppercase text-text-tertiary">Status:</span>
            {STATUS_BUCKETS.map((s) => (
              <button key={s.key} onClick={() => toggleStatusChip(s.key)}
                className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                  statusFilter.has(s.key) ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-text-tertiary hover:text-text-primary")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />{s.label}
                <span className="ml-0.5 font-mono">{statusCounts[s.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border-l border-border pl-2">
            <span className="text-[10px] uppercase text-text-tertiary">Priority:</span>
            {PRIORITY_BUCKETS.map((p) => (
              <button key={p.key} onClick={() => togglePriorityChip(p.key)}
                className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                  priorityFilter.has(p.key) ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-text-tertiary hover:text-text-primary")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />{p.label}
                <span className="ml-0.5 font-mono">{priorityCounts[p.key as string]}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {view === "week-kanban" ? (
        <WeekKanban
          tasks={filtered}
          weekOffset={weekOffset}
          onWeekOffsetChange={setWeekOffset}
          visibleWeeks={5}
          onTaskChanged={reload}
          onCreateForDate={openCreate}
          onStatusChange={handleStatusChange}
        />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={filtered} onTaskChanged={reload} />
      ) : (
        <Card className="border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase text-text-tertiary">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-text-tertiary">No tasks match.</td></tr>}
              {filtered.slice(0, 200).map((t) => {
                const pc = priorityColor(t.priority_bucket);
                return (
                  <tr key={t.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <Link to="/manager/all-tasks/$id" params={{ id: t.id }} className="font-medium hover:text-primary">{t.title}</Link>
                      {t.task_origin === "editorial" && <Badge className="ml-2 bg-violet-100 text-violet-700 text-[9px]">Editorial</Badge>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{t.week_start ? weekLabel(t.week_start).split("-")[1] : "—"}</td>
                    <td className="px-4 py-3 capitalize text-text-secondary">{(DELIVERABLE_LABEL_SINGULAR[t.deliverable_type] ?? t.deliverable_type.replace(/_/g, " "))}</td>
                    <td className="px-4 py-3 text-text-secondary">{t.partner_name}</td>
                    <td className="px-4 py-3 text-text-secondary">{t.assignee_name ?? <span className="text-text-tertiary">Unassigned</span>}</td>
                    <td className="px-4 py-3">{new Date(t.due_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", pc.bg, pc.text)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", pc.dot)} />{pc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3"><Badge variant="secondary" className={cn("capitalize", statusBadgeClass(t.bucket))}>{STATUS_BUCKETS.find((s) => s.key === t.bucket)?.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <TaskActionButtons task={{ id: t.id, status: t.status }} onChanged={reload} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <TaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} defaultDueDate={createDueDate} />
    </div>
  );
}

function statusBadgeClass(b: StatusBucket): string {
  if (b === "open") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  if (b === "in_progress") return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

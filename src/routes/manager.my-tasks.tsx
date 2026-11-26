import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeekKanban, type KanbanTask } from "@/components/week-kanban";
import { TaskCalendar } from "@/components/task-calendar";
import { submissionImage } from "@/components/task-quick-view";
import { computePriority, statusBucket, priorityColor, type PriorityBucket, type StatusBucket } from "@/lib/week";

export const Route = createFileRoute("/manager/my-tasks")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <MyTasks />
    </AppShell>
  ),
});

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

function MyTasks() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [view, setView] = useState<"week-kanban" | "calendar" | "list">("week-kanban");
  const [weekOffset, setWeekOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<Set<StatusBucket>>(new Set(["open", "in_progress", "closed"]));
  const [priorityFilter, setPriorityFilter] = useState<Set<PriorityBucket>>(new Set(["critical", "yellow", "green"]));

  async function load() {
    if (!profile) return;
    const { data } = await supabase.from("tasks")
        .select("id,title,deliverable_type,status,priority,due_date,is_extra,contract_id,assigned_to,task_origin,week_start,copied_from_task_id,sort_order,featured_image_url")
        .eq("assigned_to", profile.id)
        .order("due_date", { ascending: true });
      const list = (data ?? []) as KanbanTask[];
      const taskIds = list.map((t) => t.id);
      const [{ data: cs }, { data: subs }] = await Promise.all([
        (async () => {
          const cIds = Array.from(new Set(list.map((t) => t.contract_id).filter((v): v is string => !!v)));
          return cIds.length
            ? supabase.from("contracts").select("id,content_partner_id").in("id", cIds)
            : { data: [] as any[] };
        })(),
        taskIds.length
          ? supabase.from("submissions")
              .select("task_id,screenshot_url,file_url,url,submission_type,created_at")
              .in("task_id", taskIds)
              .order("created_at", { ascending: false })
          : { data: [] as any[] },
      ]);
      const pIds = Array.from(new Set((cs ?? []).map((c: any) => c.content_partner_id)));
      const { data: parts } = pIds.length
        ? await supabase.from("content_partners").select("id,name").in("id", pIds)
        : { data: [] as any[] };
      const imgMap = new Map<string, string>();
      for (const s of subs ?? []) {
        if (imgMap.has(s.task_id)) continue;
        const img = submissionImage(s);
        if (img) imgMap.set(s.task_id, img);
      }
      const cMap = new Map((cs ?? []).map((c: any) => [c.id, c.content_partner_id]));
      const pMap = new Map((parts ?? []).map((p: any) => [p.id, p.name]));
      setTasks(list.map((t) => ({
        ...t,
        partner_name: t.contract_id ? (pMap.get(cMap.get(t.contract_id) ?? "") ?? "—") : "Editorial",
        assignee_avatar_url: profile?.avatar_url ?? null,
        featured_image: t.featured_image_url ?? imgMap.get(t.id) ?? null,
      })));
  }

  useEffect(() => { void load(); }, [profile]);

  const today = new Date();
  const decorated = useMemo(() => tasks.map((t) => ({
    ...t,
    bucket: statusBucket(t.status),
    priority_bucket: computePriority(t.due_date, t.status, today) as PriorityBucket,
  })), [tasks, today]);

  const preFiltered = useMemo(() => decorated.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (type !== "all" && t.deliverable_type !== type) return false;
    return true;
  }), [decorated, q, type]);

  const filtered = useMemo(() => preFiltered.filter((t) =>
    statusFilter.has(t.bucket) && priorityFilter.has(t.priority_bucket),
  ), [preFiltered, statusFilter, priorityFilter]);

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

  const todayStr = new Date().toISOString().slice(0, 10);

  function toggleStatusChip(b: StatusBucket) {
    setStatusFilter((p) => { const n = new Set(p); n.has(b) ? n.delete(b) : n.add(b); return n; });
  }
  function togglePriorityChip(b: PriorityBucket) {
    setPriorityFilter((p) => { const n = new Set(p); n.has(b) ? n.delete(b) : n.add(b); return n; });
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {filtered.length} of {tasks.length} task{tasks.length === 1 ? "" : "s"} assigned to you · weeks run Thursday → Wednesday
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {(["week-kanban", "calendar", "list"] as const).map((m) => (
            <button key={m} onClick={() => setView(m)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium",
                view === m ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-text-primary")}>
              {m === "week-kanban" ? "Week board" : m === "calendar" ? "Calendar" : "List"}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-text-tertiary" />
          <Input placeholder="Search title…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {["article", "newsletter", "homepage_banner", "article_banner", "social_post"].map((t) =>
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
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
          taskRoute="/manager/all-tasks/$id"
        />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={filtered} taskRoute="/manager/all-tasks/$id" onTaskChanged={() => void load()} />
      ) : filtered.length === 0 ? (
        <Card className="border-border p-12 text-center text-sm text-text-tertiary">No tasks match.</Card>
      ) : (
        <Card className="border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase text-text-tertiary">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const pc = priorityColor(t.priority_bucket);
                const overdue = t.due_date < todayStr && t.bucket !== "closed";
                return (
                  <tr key={t.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <Link to="/manager/all-tasks/$id" params={{ id: t.id }} className="font-medium hover:text-primary">{t.title}</Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-text-secondary">{(DELIVERABLE_LABEL_SINGULAR[t.deliverable_type] ?? t.deliverable_type.replace(/_/g, " "))}</td>
                    <td className="px-4 py-3 text-text-secondary">{t.partner_name}</td>
                    <td className={cn("px-4 py-3", overdue && "font-semibold text-danger")}>{new Date(t.due_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", pc.bg, pc.text)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", pc.dot)} />{pc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3"><Badge variant="secondary" className="capitalize">{STATUS_BUCKETS.find((s) => s.key === t.bucket)?.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

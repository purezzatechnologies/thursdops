import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Copy, GripVertical, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { duplicateTask } from "@/lib/tasks-create.functions";
import { deleteTask } from "@/lib/contracts.functions";
import { TaskEditDialog } from "@/components/task-edit-dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TaskQuickView } from "@/components/task-quick-view";
import { UserAvatar } from "@/components/user-avatar";
import {
  computePriority,
  statusBucket,
  priorityColor,
  weekStartThu,
  weekEndWed,
  toISODate,
  weekLabel,
  type PriorityBucket,
  type StatusBucket,
} from "@/lib/week";
import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";

const STATUS_LABELS: Record<StatusBucket, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

function statusBadgeClass(b: StatusBucket): string {
  if (b === "open") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  if (b === "in_progress") return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

const ROLE_STYLES: Record<string, { label: string; cls: string }> = {
  super_admin:     { label: "Super Admin",     cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  manager:         { label: "Manager",         cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
  editor:          { label: "Editor",          cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  ops_support:     { label: "Ops",             cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  content_partner: { label: "Partner",         cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
};

/** Light dedicated background per deliverable type (task 1). */
function typeCardClass(dt: string): string {
  switch (dt) {
    case "article":
      return "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50";
    case "newsletter":
      return "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50";
    case "homepage_banner":
      return "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50";
    case "article_banner":
      return "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-900/50";
    case "social_post":
      return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50";
    default:
      return "bg-card border-border";
  }
}

export interface KanbanTask {
  id: string;
  title: string;
  deliverable_type: string;
  status: string;
  due_date: string;
  task_origin: string;
  week_start: string | null;
  assigned_to: string | null;
  contract_id: string | null;
  partner_name?: string;
  assignee_name?: string;
  assignee_role?: string;
  assignee_avatar_url?: string | null;
  copied_from_task_id?: string | null;
  sort_order?: number | null;
  /** Optional featured image (e.g. latest submission screenshot) shown on the card. */
  featured_image?: string | null;
}

interface Props {
  tasks: KanbanTask[];
  weekOffset: number;
  onWeekOffsetChange: (next: number) => void;
  /** Route pattern for task detail link, e.g. "/manager/all-tasks/$id". */
  taskRoute?: string;
  visibleWeeks?: number;
  /** Optional: allow drag-and-drop reordering and cross-column reschedule. */
  enableDrag?: boolean;
  /** Called after a task changes in the quick-view popup (e.g. featured image). */
  onTaskChanged?: () => void;
  /** If provided, each week/day column shows a "+" to create a task on that date. */
  onCreateForDate?: (dateISO: string) => void;
  /** If provided, card status badge becomes an editable dropdown. */
  onStatusChange?: (taskId: string, status: string) => Promise<void>;
}

const DAY_NAMES = ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"];

interface DragState {
  id: string;
  fromDue: string;
}

const TASK_STATUSES = [
  { value: "not_started",     label: "Not Started" },
  { value: "in_progress",     label: "In Progress" },
  { value: "submitted",       label: "Submitted" },
  { value: "under_review",    label: "Under Review" },
  { value: "rework_requested",label: "Rework" },
  { value: "approved",        label: "Approved" },
  { value: "completed",       label: "Completed" },
  { value: "cancelled",       label: "Cancelled" },
] as const;

function TaskCard({
  t,
  enableDrag,
  onOpen,
  onDragStart,
  onDragOverCard,
  onDropOnCard,
  isDragging,
  onStatusChange,
  onDuplicate,
  onDelete,
  onEdit,
}: {
  t: KanbanTask & { bucket: StatusBucket; priority_bucket: PriorityBucket };
  enableDrag?: boolean;
  onOpen: (id: string) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOverCard?: (e: React.DragEvent) => void;
  onDropOnCard?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  onStatusChange?: (taskId: string, status: string) => Promise<void>;
  onDuplicate?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
}) {
  const pc = priorityColor(t.priority_bucket);
  return (
    <div
      draggable={enableDrag ? true : undefined}
      onDragStart={enableDrag ? onDragStart : undefined}
      onDragOver={enableDrag ? onDragOverCard : undefined}
      onDrop={enableDrag ? onDropOnCard : undefined}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(t.id);
        }
      }}
      className={cn(
        "group relative overflow-hidden rounded-lg border shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        typeCardClass(t.deliverable_type),
        enableDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "opacity-40",
      )}
    >
      {/* Featured image — shown in full (uncropped) */}
      {t.featured_image ? (
        <div className="w-full overflow-hidden bg-secondary">
          <img
            src={t.featured_image}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-auto w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex h-12 w-full items-center justify-center bg-black/[0.03] dark:bg-white/[0.04]">
          <ImageIcon className="h-4 w-4 text-text-tertiary/50" />
        </div>
      )}

      <div className="p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {enableDrag && (
              <GripVertical className="h-3 w-3 text-text-tertiary opacity-60 group-hover:opacity-100" />
            )}
            <span className={cn("h-2.5 w-2.5 rounded-full", pc.dot)} title={pc.label} />
            <span className="font-mono text-[10px] uppercase text-text-tertiary">
              {DELIVERABLE_LABEL_SINGULAR[t.deliverable_type] ?? t.deliverable_type.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {t.copied_from_task_id && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] uppercase text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                Copied
              </span>
            )}
            {t.task_origin === "editorial" && (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] uppercase text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                Editorial
              </span>
            )}
            {onEdit && (
              <button
                type="button"
                title="Edit this task"
                aria-label="Edit task"
                onClick={(e) => { e.stopPropagation(); onEdit(t.id); }}
                className="rounded p-1 text-text-tertiary opacity-0 transition hover:bg-black/5 hover:text-text-primary group-hover:opacity-100 dark:hover:bg-white/10"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                title="Duplicate this task (copies all fields)"
                aria-label="Duplicate task"
                onClick={(e) => { e.stopPropagation(); onDuplicate(t.id); }}
                className="rounded p-1 text-text-tertiary opacity-0 transition hover:bg-black/5 hover:text-text-primary group-hover:opacity-100 dark:hover:bg-white/10"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && t.status === "not_started" && (
              <button
                type="button"
                title="Delete this task"
                aria-label="Delete task"
                onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                className="rounded p-1 text-text-tertiary opacity-0 transition hover:bg-danger-light hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="text-sm font-semibold leading-snug text-text-primary">{t.title}</div>
        {t.partner_name && (
          <div className="mt-1.5 text-[11px] text-text-tertiary">{t.partner_name}</div>
        )}
        {t.assignee_name && (
          <div className="mt-1 flex items-center gap-1.5">
            <UserAvatar src={t.assignee_avatar_url} name={t.assignee_name} size="xs" />
            {t.assignee_role && ROLE_STYLES[t.assignee_role] && (
              <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", ROLE_STYLES[t.assignee_role].cls)}>
                {ROLE_STYLES[t.assignee_role].label}
              </span>
            )}
            <span className="text-[11px] text-text-secondary">{t.assignee_name}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">
            Due {new Date(t.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          {onStatusChange ? (
            <select
              value={t.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); void onStatusChange(t.id, e.target.value); }}
              className={cn("cursor-pointer rounded border-0 px-1.5 py-0.5 text-[10px] font-medium outline-none ring-0 focus:ring-1 focus:ring-primary/50", statusBadgeClass(t.bucket))}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          ) : (
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium capitalize", statusBadgeClass(t.bucket))}>
              {STATUS_LABELS[t.bucket]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeekKanban({
  tasks,
  weekOffset,
  onWeekOffsetChange,
  taskRoute = "/manager/all-tasks/$id",
  visibleWeeks = 5,
  enableDrag = true,
  onTaskChanged,
  onCreateForDate,
  onStatusChange,
}: Props) {
  const today = new Date();
  const todayStr = toISODate(today);
  const currentWeekStart = toISODate(weekStartThu(today));

  const { profile } = useAuth();
  const confirm = useConfirm();
  const canDuplicate = profile?.role === "manager" || profile?.role === "super_admin";
  const callDuplicate = useServerFn(duplicateTask);
  const duplicate = useCallback(async (id: string) => {
    try {
      await callDuplicate({ data: { task_id: id } });
      toast.success("Task duplicated — all fields copied. Open it to edit.");
      onTaskChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't duplicate task.");
    }
  }, [callDuplicate, onTaskChanged]);

  const callDelete = useServerFn(deleteTask);
  const del = useCallback(async (id: string) => {
    if (!(await confirm({ title: "Delete task?", description: "This permanently deletes the task. This can't be undone.", confirmText: "Delete", danger: true }))) return;
    try {
      await callDelete({ data: { id } });
      toast.success("Task deleted.");
      onTaskChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete task.");
    }
  }, [callDelete, onTaskChanged, confirm]);

  const [editId, setEditId] = useState<string | null>(null);
  const openEdit = useCallback((id: string) => setEditId(id), []);

  // Expanded week (shows day-by-day breakdown)
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  // Optimistic overrides for drag-and-drop.
  const [overrides, setOverrides] = useState<Record<string, { due_date?: string; sort_order?: number }>>({});
  const [drag, setDrag] = useState<DragState | null>(null);

  // Quick-view popup (opens in place instead of navigating to the detail page).
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const openQuick = useCallback((id: string) => {
    setQuickId(id);
    setQuickOpen(true);
  }, []);

  const decorated = useMemo(
    () =>
      tasks.map((raw) => {
        const ov = overrides[raw.id];
        const t = ov ? { ...raw, ...ov } : raw;
        return {
          ...t,
          week_start: t.due_date ? toISODate(weekStartThu(t.due_date)) : t.week_start,
          bucket: statusBucket(t.status),
          priority_bucket: computePriority(t.due_date, t.status, today) as PriorityBucket,
        };
      }),
    [tasks, today, overrides],
  );

  const sortItems = useCallback(
    <T extends { sort_order?: number | null; due_date: string; id: string }>(arr: T[]): T[] =>
      [...arr].sort((a, b) => {
        const ao = a.sort_order ?? 0;
        const bo = b.sort_order ?? 0;
        if (ao !== bo) return ao - bo;
        if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
        return a.id.localeCompare(b.id);
      }),
    [],
  );

  const weekColumns = useMemo(() => {
    const cols: { startISO: string; endISO: string; label: string; weekNo: string }[] = [];
    const back = 1;
    const fwd = visibleWeeks - back - 1;
    for (let i = -back; i <= fwd; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + (i + weekOffset) * 7);
      const start = weekStartThu(d);
      const end = weekEndWed(d);
      const label = weekLabel(start);
      cols.push({
        startISO: toISODate(start),
        endISO: toISODate(end),
        label,
        weekNo: label.split("-")[1] ?? label,
      });
    }
    return cols;
  }, [today, weekOffset, visibleWeeks]);

  const tasksByWeek = useMemo(() => {
    const m = new Map<string, typeof decorated>();
    decorated.forEach((t) => {
      const ws = t.week_start ?? toISODate(weekStartThu(t.due_date));
      const arr = m.get(ws) ?? [];
      arr.push(t);
      m.set(ws, arr);
    });
    for (const [k, v] of m) m.set(k, sortItems(v));
    return m;
  }, [decorated, sortItems]);

  const tasksByDate = useMemo(() => {
    const m = new Map<string, typeof decorated>();
    decorated.forEach((t) => {
      const arr = m.get(t.due_date) ?? [];
      arr.push(t);
      m.set(t.due_date, arr);
    });
    for (const [k, v] of m) m.set(k, sortItems(v));
    return m;
  }, [decorated, sortItems]);

  // Day columns for the expanded week (Thursday → Wednesday, 7 days)
  const dayColumns = useMemo(() => {
    if (!expandedWeek) return [] as { iso: string; name: string; display: string }[];
    const start = new Date(expandedWeek + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toISODate(d);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return { iso, name: DAY_NAMES[i], display: `${dd}/${mm}/${yyyy}` };
    });
  }, [expandedWeek]);

  // ---- Drag & drop persistence ----
  const persistReorder = useCallback(
    async (updates: { id: string; due_date: string; sort_order: number }[]) => {
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("tasks").update({ due_date: u.due_date, sort_order: u.sort_order }).eq("id", u.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        toast.error("Couldn't save order: " + failed.error.message);
      }
    },
    [],
  );

  const performDrop = useCallback(
    (draggedId: string, targetDue: string, insertBeforeId: string | null) => {
      // Build current target-column ordered list from displayed state.
      const targetList = (tasksByDate.get(targetDue) ?? []).filter((t) => t.id !== draggedId);
      const insertIdx =
        insertBeforeId === null
          ? targetList.length
          : Math.max(0, targetList.findIndex((t) => t.id === insertBeforeId));

      const dragged = decorated.find((t) => t.id === draggedId);
      if (!dragged) return;

      const reordered = [...targetList];
      reordered.splice(insertIdx, 0, { ...dragged, due_date: targetDue });

      const newOverrides: Record<string, { due_date?: string; sort_order?: number }> = { ...overrides };
      const updates: { id: string; due_date: string; sort_order: number }[] = [];
      reordered.forEach((t, i) => {
        const so = (i + 1) * 10;
        newOverrides[t.id] = { due_date: targetDue, sort_order: so };
        updates.push({ id: t.id, due_date: targetDue, sort_order: so });
      });
      // If the dragged item moved out of a different source column, also renumber source column.
      if (dragged.due_date !== targetDue) {
        const sourceList = (tasksByDate.get(dragged.due_date) ?? []).filter((t) => t.id !== draggedId);
        sourceList.forEach((t, i) => {
          const so = (i + 1) * 10;
          newOverrides[t.id] = { ...(newOverrides[t.id] ?? {}), sort_order: so, due_date: t.due_date };
          updates.push({ id: t.id, due_date: t.due_date, sort_order: so });
        });
      }
      setOverrides(newOverrides);
      void persistReorder(updates);
    },
    [tasksByDate, decorated, overrides, persistReorder],
  );

  const handleDropOnWeek = useCallback(
    (weekStartISO: string, insertBeforeId: string | null) => {
      if (!drag) return;
      const dragged = decorated.find((t) => t.id === drag.id);
      if (!dragged) return;
      // Preserve weekday offset within the new week.
      const oldWeekStart = toISODate(weekStartThu(dragged.due_date));
      const delta = Math.round(
        (new Date(dragged.due_date + "T00:00:00").getTime() -
          new Date(oldWeekStart + "T00:00:00").getTime()) /
          86400000,
      );
      const newDue = new Date(weekStartISO + "T00:00:00");
      newDue.setDate(newDue.getDate() + delta);
      performDrop(drag.id, toISODate(newDue), insertBeforeId);
      setDrag(null);
    },
    [drag, decorated, performDrop],
  );

  const handleDropOnDay = useCallback(
    (dayISO: string, insertBeforeId: string | null) => {
      if (!drag) return;
      performDrop(drag.id, dayISO, insertBeforeId);
      setDrag(null);
    },
    [drag, performDrop],
  );

  const allowDrop = (e: React.DragEvent) => {
    if (!enableDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          {expandedWeek ? (
            <>Week {weekLabel(expandedWeek)} — day view · today: <span className="font-mono">{todayStr}</span></>
          ) : (
            <>Showing {visibleWeeks} weeks · today: <span className="font-mono">{todayStr}</span></>
          )}
          {enableDrag && <span className="ml-2 text-text-tertiary/70">· drag cards to reorder or reschedule</span>}
        </div>
        <div className="flex items-center gap-1">
          {expandedWeek ? (
            <Button size="sm" variant="outline" onClick={() => setExpandedWeek(null)}>
              <ChevronUp className="h-3.5 w-3.5" /> Collapse to weeks
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => onWeekOffsetChange(weekOffset - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button size="sm" variant="outline" onClick={() => onWeekOffsetChange(0)}>
                This week
              </Button>
              <Button size="sm" variant="outline" onClick={() => onWeekOffsetChange(weekOffset + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {expandedWeek ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {dayColumns.map((d) => {
            const items = tasksByDate.get(d.iso) ?? [];
            const isToday = d.iso === todayStr;
            return (
              <div
                key={d.iso}
                onDragOver={allowDrop}
                onDrop={(e) => {
                  if (!enableDrag) return;
                  e.preventDefault();
                  handleDropOnDay(d.iso, null);
                }}
                className={cn(
                  "flex min-h-[500px] flex-col rounded-xl border p-3",
                  isToday ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30",
                  drag && "ring-1 ring-primary/20",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text-primary">{d.name}</div>
                  <div className="flex items-center gap-1">
                    {isToday && <Badge className="bg-primary text-[10px] text-primary-foreground">Today</Badge>}
                    {onCreateForDate && (
                      <button
                        type="button"
                        onClick={() => onCreateForDate(d.iso)}
                        className="rounded p-0.5 text-text-tertiary hover:bg-card hover:text-primary"
                        title="Create task on this day"
                        aria-label={`Create task on ${d.display}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mb-2 font-mono text-[11px] text-text-tertiary">{d.display}</div>
                <div className="mb-3 flex items-center justify-between rounded-md bg-card px-2.5 py-1.5 text-[11px] shadow-sm">
                  <span className="text-text-tertiary">Tasks</span>
                  <span className="font-semibold text-text-primary">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                  {items.length === 0 && (
                    <div className="py-10 text-center text-xs text-text-tertiary">No tasks</div>
                  )}
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      onOpen={openQuick}
                      enableDrag={enableDrag}
                      isDragging={drag?.id === t.id}
                      onStatusChange={onStatusChange}
                      onDuplicate={canDuplicate ? duplicate : undefined}
                      onDelete={canDuplicate ? del : undefined}
                      onEdit={canDuplicate ? openEdit : undefined}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDrag({ id: t.id, fromDue: t.due_date });
                      }}
                      onDragOverCard={allowDrop}
                      onDropOnCard={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropOnDay(d.iso, t.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${visibleWeeks}, minmax(0, 1fr))` }}
        >
          {weekColumns.map((w) => {
            const items = tasksByWeek.get(w.startISO) ?? [];
            const isCurrent = w.startISO === currentWeekStart;
            return (
              <div
                key={w.startISO}
                onDragOver={allowDrop}
                onDrop={(e) => {
                  if (!enableDrag) return;
                  e.preventDefault();
                  handleDropOnWeek(w.startISO, null);
                }}
                className={cn(
                  "flex min-h-[500px] flex-col rounded-xl border p-4",
                  isCurrent ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30",
                  drag && "ring-1 ring-primary/20",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text-primary">{w.weekNo}</div>
                  <div className="flex items-center gap-1">
                    {isCurrent && (
                      <Badge className="bg-primary text-[10px] text-primary-foreground">Now</Badge>
                    )}
                    {onCreateForDate && (
                      <button
                        type="button"
                        onClick={() => onCreateForDate(w.startISO)}
                        className="rounded p-0.5 text-text-tertiary hover:bg-card hover:text-primary"
                        title="Create task in this week"
                        aria-label={`Create task in ${w.label}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedWeek(w.startISO)}
                      className="rounded p-0.5 text-text-tertiary hover:bg-card hover:text-text-primary"
                      title="Expand to day view"
                      aria-label={`Expand ${w.label} to day view`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mb-2 text-[11px] text-text-tertiary">
                  {new Date(w.startISO + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {" – "}
                  {new Date(w.endISO + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="mb-3 flex items-center justify-between rounded-md bg-card px-2.5 py-1.5 text-[11px] shadow-sm">
                  <span className="text-text-tertiary">Deliverables</span>
                  <span className="font-semibold text-text-primary">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                  {items.length === 0 && (
                    <div className="py-10 text-center text-xs text-text-tertiary">No tasks</div>
                  )}
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      onOpen={openQuick}
                      enableDrag={enableDrag}
                      isDragging={drag?.id === t.id}
                      onStatusChange={onStatusChange}
                      onDuplicate={canDuplicate ? duplicate : undefined}
                      onDelete={canDuplicate ? del : undefined}
                      onEdit={canDuplicate ? openEdit : undefined}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDrag({ id: t.id, fromDue: t.due_date });
                      }}
                      onDragOverCard={allowDrop}
                      onDropOnCard={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropOnWeek(w.startISO, t.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskQuickView
        taskId={quickId}
        open={quickOpen}
        onOpenChange={setQuickOpen}
        taskRoute={taskRoute}
        onChanged={onTaskChanged}
      />

      <TaskEditDialog
        taskId={editId}
        open={!!editId}
        onOpenChange={(o) => { if (!o) setEditId(null); }}
        onSaved={onTaskChanged}
      />
    </>
  );
}

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { computePriority, priorityColor, toISODate, type PriorityBucket } from "@/lib/week";
import { TaskQuickView } from "@/components/task-quick-view";

export interface CalendarTask {
  id: string;
  title: string;
  deliverable_type: string;
  status: string;
  due_date: string;
  task_origin?: string;
}

interface Props {
  tasks: CalendarTask[];
  taskRoute?: string;
  /** Refresh the board after a task changes in the popup. */
  onTaskChanged?: () => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

export function TaskCalendar({ tasks, taskRoute = "/manager/all-tasks/$id", onTaskChanged }: Props) {
  const today = new Date();
  const todayISO = toISODate(today);

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Tasks bucketed by their due date (yyyy-mm-dd).
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarTask[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const arr = m.get(t.due_date) ?? [];
      arr.push(t);
      m.set(t.due_date, arr);
    }
    return m;
  }, [tasks]);

  // Build the month grid (weeks × 7), Sunday-first, including leading/trailing days.
  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay()); // back up to the Sunday of the first row
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const rows = Math.ceil((first.getDay() + daysInMonth) / 7);
    const out: { date: Date; iso: string; inMonth: boolean }[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: { date: Date; iso: string; inMonth: boolean }[] = [];
      for (let c = 0; c < 7; c++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + r * 7 + c);
        row.push({ date: d, iso: toISODate(d), inMonth: d.getMonth() === month });
      }
      out.push(row);
    }
    return out;
  }, [year, month]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function openTask(id: string) {
    setQuickId(id);
    setQuickOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">{monthLabel}</div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-border bg-secondary/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {weeks.flat().map((cell) => {
            const items = byDate.get(cell.iso) ?? [];
            const isToday = cell.iso === todayISO;
            return (
              <div
                key={cell.iso}
                className={cn(
                  "min-h-[112px] border-b border-r border-border p-1.5 last:border-r-0",
                  cell.inMonth ? "bg-card" : "bg-secondary/30",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isToday
                        ? "bg-primary font-semibold text-primary-foreground"
                        : cell.inMonth
                        ? "text-text-primary"
                        : "text-text-tertiary",
                    )}
                  >
                    {cell.date.getDate()}
                  </span>
                  {items.length > 0 && (
                    <span className="text-[10px] font-medium text-text-tertiary">{items.length}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {items.slice(0, MAX_CHIPS).map((t) => {
                    const pc = priorityColor(computePriority(t.due_date, t.status, today) as PriorityBucket);
                    return (
                      <button
                        key={t.id}
                        onClick={() => openTask(t.id)}
                        title={t.title}
                        className={cn(
                          "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] leading-tight transition hover:opacity-80",
                          pc.bg,
                          pc.text,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pc.dot)} />
                        <span className="truncate">{t.title}</span>
                      </button>
                    );
                  })}
                  {items.length > MAX_CHIPS && (
                    <button
                      onClick={() => openTask(items[MAX_CHIPS].id)}
                      className="w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-text-tertiary hover:text-text-primary"
                    >
                      +{items.length - MAX_CHIPS} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskQuickView
        taskId={quickId}
        open={quickOpen}
        onOpenChange={setQuickOpen}
        taskRoute={taskRoute}
        onChanged={onTaskChanged}
      />
    </div>
  );
}

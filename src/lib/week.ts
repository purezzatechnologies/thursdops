/**
 * Week helpers — weeks run Thursday → Wednesday.
 * Day index used: 0=Sun..6=Sat (matches JS Date.getDay).
 */

const MS_PER_DAY = 86400000;

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Returns the Thursday that starts the week containing `d`. */
export function weekStartThu(d: Date | string): Date {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : new Date(d);
  date.setHours(0, 0, 0, 0);
  // Thursday = 4. Days since most-recent Thursday: (dow - 4 + 7) % 7
  const delta = (date.getDay() - 4 + 7) % 7;
  date.setDate(date.getDate() - delta);
  return date;
}

/** Returns the Wednesday that ends the week containing `d`. */
export function weekEndWed(d: Date | string): Date {
  const start = weekStartThu(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

/** ISO-week label like "2026-W23". */
export function weekLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : new Date(d);
  // ISO week algorithm
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${pad(week)}`;
}

export interface WeekInfo {
  index: number;          // 1-based index from contract start
  start: Date;            // Thursday
  end: Date;              // Wednesday
  startISO: string;
  endISO: string;
  label: string;          // ISO week label
}

/** All weeks (Thu→Wed) overlapping the [start, end] range, inclusive. */
export function weeksBetween(startDate: Date | string, endDate: Date | string): WeekInfo[] {
  const first = weekStartThu(startDate);
  const last = weekStartThu(endDate);
  const out: WeekInfo[] = [];
  let cur = new Date(first);
  let i = 1;
  while (cur.getTime() <= last.getTime()) {
    const end = new Date(cur);
    end.setDate(end.getDate() + 6);
    out.push({
      index: i,
      start: new Date(cur),
      end,
      startISO: toISODate(cur),
      endISO: toISODate(end),
      label: weekLabel(cur),
    });
    cur.setDate(cur.getDate() + 7);
    i++;
  }
  return out;
}

/** Distribute `total` items as evenly as possible across `weekCount` weeks. */
export function evenDistribution(total: number, weekCount: number): number[] {
  if (weekCount <= 0) return [];
  const base = Math.floor(total / weekCount);
  const rem = total - base * weekCount;
  const out = new Array(weekCount).fill(base);
  // Put remainder in the FIRST weeks so tasks load up at the start of the contract.
  for (let i = 0; i < rem; i++) out[i] += 1;
  return out;
}

export type PriorityBucket = "green" | "yellow" | "critical" | null;

/** Compute urgency bucket from due date vs today. */
export function computePriority(
  due: Date | string,
  status: string,
  today: Date = new Date(),
): PriorityBucket {
  if (["approved", "completed", "cancelled"].includes(status)) return null;
  const dueDate = typeof due === "string" ? new Date(due + "T00:00:00") : new Date(due);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const days = Math.round((dueDate.getTime() - t.getTime()) / MS_PER_DAY);
  if (days < 0) return "critical";
  if (days <= 2) return "critical";
  if (days <= 4) return "yellow";
  return "green";
}

export function priorityColor(p: PriorityBucket): { dot: string; bg: string; text: string; label: string } {
  if (p === "critical") return { dot: "bg-red-500", bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", label: "Critical" };
  if (p === "yellow") return { dot: "bg-amber-500", bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", label: "Yellow" };
  if (p === "green") return { dot: "bg-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", label: "Green" };
  return { dot: "bg-secondary", bg: "bg-secondary/40", text: "text-text-tertiary", label: "—" };
}

/** Status bucket for the simplified All Tasks view. */
export type StatusBucket = "open" | "in_progress" | "closed";
export function statusBucket(status: string): StatusBucket {
  if (status === "not_started") return "open";
  if (["approved", "completed", "cancelled"].includes(status)) return "closed";
  return "in_progress";
}

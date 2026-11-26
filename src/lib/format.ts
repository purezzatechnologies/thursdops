// Shared date/time formatting helpers — used across the app for consistency.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate().toString().padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "—";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm}`;
}

export function formatDateRange(start: string | Date, end: string | Date): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getDate().toString().padStart(2, "0")} ${MONTHS[s.getMonth()]} — ${e.getDate().toString().padStart(2, "0")} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${formatDate(s)} — ${formatDate(e)}`;
}

export function fromNow(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  if (day < 30) return `${Math.round(day / 7)}w ago`;
  return formatDate(d);
}

// Returns warning state for a due date — used to decorate any date pill consistently.
export function dueDateState(due: string | Date | null | undefined): {
  tone: "default" | "soon" | "today" | "overdue";
  label: string;
  daysUntil: number;
} {
  if (!due) return { tone: "default", label: "—", daysUntil: Infinity };
  const d = typeof due === "string" ? new Date(due) : due;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { tone: "overdue", label: `${Math.abs(days)}d overdue`, daysUntil: days };
  if (days === 0) return { tone: "today", label: "Due today", daysUntil: 0 };
  if (days <= 3) return { tone: "soon", label: `${days}d left`, daysUntil: days };
  return { tone: "default", label: formatDate(d), daysUntil: days };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, ClipboardList, FileText, Send, ShieldCheck } from "lucide-react";
import { fromNow } from "@/lib/format";

interface ActivityRow {
  id: string;
  at: string;
  icon: typeof Activity;
  tone: "primary" | "success" | "warning" | "danger" | "muted";
  title: string;
  body: string | null;
  actor: string | null;
}

interface Props {
  /** Limit notifications fetched to those whose link references one of these prefixes. */
  linkPrefixes?: string[];
  /** Pre-built rows derived from the entity itself (created/updated/status changes). */
  intrinsicEvents?: Array<Omit<ActivityRow, "id"> & { id?: string }>;
  /** Optional title override. */
  title?: string;
}

const ICON_FOR_TYPE: Record<string, typeof Activity> = {
  task_assigned: ClipboardList,
  task_due_date_changed: ClipboardList,
  task_cancelled: ClipboardList,
  submission_submitted: Send,
  submission_approved: CheckCircle2,
  submission_rejected: FileText,
  submission_rework_requested: FileText,
  kpi_snapshot_pending_qc: ShieldCheck,
  kpi_snapshot_approved: ShieldCheck,
  kpi_snapshot_rejected: ShieldCheck,
  kpi_snapshot_edited: ShieldCheck,
  role_changed: Activity,
  contract_status_changed: FileText,
};

const TONE_FOR_TYPE: Record<string, ActivityRow["tone"]> = {
  submission_approved: "success",
  kpi_snapshot_approved: "success",
  submission_rejected: "danger",
  submission_rework_requested: "danger",
  kpi_snapshot_rejected: "danger",
  task_cancelled: "muted",
  contract_status_changed: "primary",
};

export function ActivityFeed({ linkPrefixes, intrinsicEvents = [], title = "Activity" }: Props) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const intrinsic: ActivityRow[] = intrinsicEvents.map((e, i) => ({
        id: e.id ?? `intrinsic-${i}`,
        ...e,
      }));
      let notifRows: ActivityRow[] = [];
      if (linkPrefixes && linkPrefixes.length > 0) {
        const orClauses = linkPrefixes.map((p) => `link.ilike.${p}%`).join(",");
        const { data } = await supabase
          .from("notifications")
          .select("id,type,title,body,created_at,link")
          .or(orClauses)
          .order("created_at", { ascending: false })
          .limit(80);
        notifRows = (data ?? []).map((n) => ({
          id: n.id,
          at: n.created_at,
          icon: ICON_FOR_TYPE[n.type] ?? Activity,
          tone: TONE_FOR_TYPE[n.type] ?? "primary",
          title: n.title,
          body: n.body,
          actor: null,
        }));
      }
      // Merge + dedupe by (title, at within same minute) to avoid noise
      const seen = new Set<string>();
      const merged = [...intrinsic, ...notifRows]
        .sort((a, b) => +new Date(b.at) - +new Date(a.at))
        .filter((r) => {
          const key = `${r.title}|${r.at.slice(0, 16)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      setRows(merged.slice(0, 50));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(linkPrefixes), JSON.stringify(intrinsicEvents)]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />{title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="py-6 text-center text-sm text-text-tertiary">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-text-tertiary">No activity yet.</p>
        )}
        {!loading && rows.length > 0 && (
          <ol className="relative space-y-0.5 border-l border-border pl-4">
            {rows.map((r) => {
              const Icon = r.icon;
              const toneClass =
                r.tone === "success" ? "bg-success-light text-success"
                : r.tone === "danger" ? "bg-danger-light text-danger"
                : r.tone === "warning" ? "bg-warning-light text-warning"
                : r.tone === "muted" ? "bg-muted text-text-tertiary"
                : "bg-primary-light text-primary";
              return (
                <li key={r.id} className="relative py-2.5">
                  <span className={`absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full ${toneClass}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{r.title}</div>
                      {r.body && <div className="mt-0.5 text-xs text-text-secondary">{r.body}</div>}
                      {r.actor && <div className="mt-0.5 text-[11px] text-text-tertiary">by {r.actor}</div>}
                    </div>
                    <div className="whitespace-nowrap text-[11px] text-text-tertiary">{fromNow(r.at)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

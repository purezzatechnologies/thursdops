import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fromNow, formatDateTime } from "@/lib/format";
import { CheckCheck, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  component: () => (
    <AppShell allowed={["super_admin", "manager", "editor", "ops_support", "content_partner"]}>
      <NotificationsPage />
    </AppShell>
  ),
});

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const PAGE_SIZE = 50;

function NotificationsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [page, setPage] = useState(0);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,link,is_read,created_at")
      .eq("recipient_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data ?? []) as Notif[]);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [profile?.id]);

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.type))).sort(), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (type !== "all" && r.type !== type) return false;
    if (readFilter === "unread" && r.is_read) return false;
    if (readFilter === "read" && !r.is_read) return false;
    if (q && !`${r.title} ${r.body ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, q, type, readFilter]);

  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const unreadInFilter = filtered.filter((r) => !r.is_read).length;

  async function markAll() {
    if (!profile || unreadInFilter === 0) return;
    const ids = filtered.filter((r) => !r.is_read).map((r) => r.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, is_read: true } : r)));
    toast.success("Marked as read");
  }

  async function onRow(n: Notif) {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, is_read: true } : r)));
    }
    if (n.link) navigate({ to: n.link });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Inbox</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Notifications</h1>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input className="pl-9" placeholder="Search notifications" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            </div>
            <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={readFilter} onValueChange={(v) => { setReadFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={unreadInFilter === 0} onClick={() => void markAll()}>
              <CheckCheck className="mr-2 h-3.5 w-3.5" />Mark all as read
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && <p className="py-12 text-center text-sm text-text-tertiary">Loading…</p>}
          {!loading && visible.length === 0 && (
            <p className="py-16 text-center text-sm text-text-tertiary">
              {rows.length === 0 ? "No notifications yet." : "No notifications match your filters."}
            </p>
          )}
          <div className="divide-y divide-border">
            {visible.map((n) => (
              <button
                key={n.id}
                onClick={() => void onRow(n)}
                className={`flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-secondary/40 ${!n.is_read ? "bg-primary-light/20" : ""}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{n.type.replace(/_/g, " ")}</Badge>
                    <div className="truncate text-sm font-medium">{n.title}</div>
                  </div>
                  {n.body && <div className="mt-1 line-clamp-2 text-xs text-text-secondary">{n.body}</div>}
                </div>
                <div className="whitespace-nowrap text-right text-[11px] text-text-tertiary">
                  <div>{fromNow(n.created_at)}</div>
                  <div className="mt-0.5">{formatDateTime(n.created_at)}</div>
                </div>
              </button>
            ))}
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-text-tertiary">
              <div>Page {page + 1} of {Math.ceil(filtered.length / PAGE_SIZE)} · {filtered.length} total</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

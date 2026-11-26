import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

export const Route = createFileRoute("/admin/activity")({
  component: () => (
    <AppShell allowed={["super_admin", "manager"]}>
      <ActivityPage />
    </AppShell>
  ),
});

interface Row {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  recipient_id: string;
  recipient_name: string;
}

function ActivityPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,created_at,recipient_id")
        .order("created_at", { ascending: false })
        .limit(500);
      const ids = Array.from(new Set((data ?? []).map((n) => n.recipient_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,full_name,email").in("id", ids)
        : { data: [] as Array<{ id: string; full_name: string | null; email: string }> };
      const pmap = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? p.email]));
      setRows((data ?? []).map((n) => ({
        ...n,
        recipient_name: pmap.get(n.recipient_id) ?? "—",
      })));
    })();
  }, []);

  const types = Array.from(new Set(rows.map((r) => r.type))).sort();
  const filtered = rows.filter((r) => {
    if (type !== "all" && r.type !== type) return false;
    if (q && !`${r.title} ${r.body ?? ""} ${r.recipient_name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">System</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-text-secondary">Recent notifications across the platform.</p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input className="pl-9" placeholder="Search activity" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All event types</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 && <p className="py-12 text-center text-sm text-text-tertiary">No activity yet.</p>}
          {filtered.map((n) => (
            <div key={n.id} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{n.type.replace(/_/g, " ")}</Badge>
                    <div className="text-sm font-medium">{n.title}</div>
                  </div>
                  {n.body && <div className="mt-1 text-xs text-text-secondary">{n.body}</div>}
                  <div className="mt-1 text-[11px] text-text-tertiary">To {n.recipient_name}</div>
                </div>
                <div className="text-xs text-text-tertiary whitespace-nowrap">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { respondToPartnerRequest } from "@/lib/partner-requests.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/manager/requests")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <ManagerPartnerRequests />
    </AppShell>
  ),
});

interface RequestRow {
  id: string;
  content_partner_id: string;
  created_by: string;
  kind: string;
  subject: string;
  message: string;
  status: string;
  response: string | null;
  responded_at: string | null;
  created_at: string;
  partner_name?: string;
  author_name?: string;
}

const kindLabel: Record<string, string> = {
  query: "Question",
  change_request: "Change request",
  new_deliverable: "Extra deliverable",
  issue: "Issue",
  other: "Other",
};

const STATUS_OPTIONS = ["open", "in_progress", "resolved", "declined"];

function ManagerPartnerRequests() {
  const { profile } = useAuth();
  const callRespond = useServerFn(respondToPartnerRequest);

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "all">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data: reqs } = await supabase
      .from("partner_requests")
      .select("id,content_partner_id,created_by,kind,subject,message,status,response,responded_at,created_at")
      .order("created_at", { ascending: false });
    const list = (reqs ?? []) as RequestRow[];

    const partnerIds = [...new Set(list.map((r) => r.content_partner_id))];
    const authorIds = [...new Set(list.map((r) => r.created_by).filter(Boolean))];
    const [{ data: partners }, { data: authors }] = await Promise.all([
      partnerIds.length
        ? supabase.from("content_partners").select("id,name").in("id", partnerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      authorIds.length
        ? supabase.from("profiles").select("id,full_name,email").in("id", authorIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    ]);
    const pMap = new Map((partners ?? []).map((p) => [p.id, p.name]));
    const aMap = new Map((authors ?? []).map((a) => [a.id, a.full_name ?? a.email]));

    setRows(
      list.map((r) => ({
        ...r,
        partner_name: pMap.get(r.content_partner_id) ?? "Unknown partner",
        author_name: aMap.get(r.created_by) ?? "Partner user",
      })),
    );
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [profile]);

  async function respond(id: string, status: string, includeResponse: boolean) {
    setBusyId(id);
    try {
      await callRespond({
        data: {
          request_id: id,
          status: status as never,
          response: includeResponse ? (drafts[id]?.trim() || null) : null,
        },
      });
      toast.success("Request updated. Partner notified.");
      setDrafts((d) => ({ ...d, [id]: "" }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = tab === "open"
    ? rows.filter((r) => r.status === "open" || r.status === "in_progress")
    : rows;
  const openCount = rows.filter((r) => r.status === "open" || r.status === "in_progress").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Partner requests</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Questions, change requests and issues raised by content partners.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <TabBtn active={tab === "open"} onClick={() => setTab("open")}>Open ({openCount})</TabBtn>
        <TabBtn active={tab === "all"} onClick={() => setTab("all")}>All ({rows.length})</TabBtn>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-text-tertiary">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Inbox className="h-6 w-6 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">No {tab === "open" ? "open " : ""}requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((r) => {
            const isClosed = r.status === "resolved" || r.status === "declined";
            return (
              <Card key={r.id} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{r.subject}</CardTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
                        <Badge variant="secondary">{kindLabel[r.kind] ?? r.kind}</Badge>
                        <span className="font-medium text-text-secondary">{r.partner_name}</span>
                        <span>· {r.author_name}</span>
                        <span>· {new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">{r.status.replace(/_/g, " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">{r.message}</p>

                  {r.response && (
                    <div className="rounded-md border-l-2 border-primary bg-secondary/40 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                        Your response{r.responded_at ? ` · ${new Date(r.responded_at).toLocaleDateString()}` : ""}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{r.response}</p>
                    </div>
                  )}

                  {!isClosed && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <Textarea
                        value={drafts[r.id] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                        placeholder="Write a response to the partner…"
                        rows={3}
                        maxLength={4000}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={busyId === r.id || !(drafts[r.id]?.trim())}
                          onClick={() => respond(r.id, "resolved", true)}
                        >
                          Reply &amp; resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.id || !(drafts[r.id]?.trim())}
                          onClick={() => respond(r.id, "in_progress", true)}
                        >
                          Reply, keep open
                        </Button>
                        <Select
                          value={r.status}
                          onValueChange={(v) => respond(r.id, v, false)}
                        >
                          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
        (active ? "bg-secondary text-text-primary" : "text-text-secondary hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}

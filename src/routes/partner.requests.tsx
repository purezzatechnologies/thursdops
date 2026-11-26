import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { submitPartnerRequest } from "@/lib/partner-requests.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquarePlus, Inbox } from "lucide-react";

export const Route = createFileRoute("/partner/requests")({
  component: () => (
    <AppShell allowed="content_partner">
      <PartnerRequests />
    </AppShell>
  ),
});

interface RequestRow {
  id: string;
  kind: string;
  subject: string;
  message: string;
  status: string;
  response: string | null;
  responded_at: string | null;
  related_contract_id: string | null;
  created_at: string;
}

const KIND_OPTIONS = [
  { value: "query", label: "Question" },
  { value: "change_request", label: "Change request" },
  { value: "new_deliverable", label: "Request extra deliverable" },
  { value: "issue", label: "Report an issue" },
  { value: "other", label: "Other" },
];

const kindLabel = (k: string) => KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;

function statusTone(status: string): "neutral" | "info" | "success" | "warning" | "muted" {
  switch (status) {
    case "open": return "warning";
    case "in_progress": return "info";
    case "resolved": return "success";
    case "declined": return "muted";
    default: return "neutral";
  }
}

function PartnerRequests() {
  const { profile } = useAuth();
  const callSubmit = useServerFn(submitPartnerRequest);

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [contracts, setContracts] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState("query");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contractId, setContractId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const { data: reqs } = await supabase
      .from("partner_requests")
      .select("id,kind,subject,message,status,response,responded_at,related_contract_id,created_at")
      .order("created_at", { ascending: false });
    setRequests((reqs ?? []) as RequestRow[]);

    const { data: cs } = await supabase
      .from("contracts")
      .select("id,plan_type,start_date,end_date")
      .order("end_date", { ascending: false });
    setContracts(
      (cs ?? []).map((c) => ({
        id: c.id,
        label: `${c.plan_type} · ${c.start_date} → ${c.end_date}`,
      })),
    );
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Add a subject and a message.");
      return;
    }
    setSaving(true);
    try {
      await callSubmit({
        data: {
          kind: kind as never,
          subject: subject.trim(),
          message: message.trim(),
          related_contract_id: contractId === "none" ? null : contractId,
        },
      });
      toast.success("Request sent — the team has been notified.");
      setSubject(""); setMessage(""); setKind("query"); setContractId("none");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request.");
    } finally {
      setSaving(false);
    }
  }

  const open = requests.filter((r) => r.status === "open" || r.status === "in_progress");
  const closed = requests.filter((r) => r.status === "resolved" || r.status === "declined");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
          Partner portal
        </div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Requests &amp; queries</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Ask a question, request a change, or flag an issue. The team is notified straight away.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* New request form */}
        <Card className="border-border lg:col-span-2 lg:sticky lg:top-4 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-4 w-4 text-primary" /> New request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {contracts.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Related contract <span className="text-text-tertiary">(optional)</span></label>
                  <Select value={contractId} onValueChange={setContractId}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subject</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Short summary" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Message</label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={5} placeholder="Tell us what you need…" />
              </div>

              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Sending…" : "Send request"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Requests list */}
        <div className="lg:col-span-3 space-y-6">
          <Section title={`Open (${open.length})`}>
            {loading ? (
              <p className="py-6 text-center text-sm text-text-tertiary">Loading…</p>
            ) : open.length === 0 ? (
              <Empty label="No open requests. Raise one on the left." />
            ) : (
              open.map((r) => <RequestCard key={r.id} r={r} />)
            )}
          </Section>

          {closed.length > 0 && (
            <Section title={`Closed (${closed.length})`}>
              {closed.map((r) => <RequestCard key={r.id} r={r} />)}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{title}</div>
      {children}
    </div>
  );
}

function RequestCard({ r }: { r: RequestRow }) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">{r.subject}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
              <Badge variant="secondary" className="capitalize">{kindLabel(r.kind)}</Badge>
              <span>{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <Badge
            className="capitalize"
            variant={statusTone(r.status) === "muted" ? "outline" : "secondary"}
          >
            {r.status.replace(/_/g, " ")}
          </Badge>
        </div>

        <p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">{r.message}</p>

        {r.response && (
          <div className="mt-3 rounded-md border-l-2 border-primary bg-secondary/40 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Team response{r.responded_at ? ` · ${new Date(r.responded_at).toLocaleDateString()}` : ""}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{r.response}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
      <Inbox className="h-6 w-6 text-text-tertiary" />
      <p className="max-w-xs text-sm text-text-tertiary">{label}</p>
    </div>
  );
}

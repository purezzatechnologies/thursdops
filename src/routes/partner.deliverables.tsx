import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/partner/deliverables")({
  component: () => (
    <AppShell allowed="content_partner">
      <PartnerDeliverables />
    </AppShell>
  ),
});

interface Row {
  id: string;
  date: string;
  contract_id: string;
  contract_label: string;
  type: string;
  is_extra: boolean;
  title: string;
  url: string | null;
  file_url: string | null;
  detail: string;
  clicks: number | null;
  impressions: number | null;
  er: number | null;
}

function PartnerDeliverables() {
  const [rows, setRows] = useState<Row[]>([]);
  const [contractFilter, setContractFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    void (async () => {
      const { data: cs } = await supabase
        .from("contracts").select("id,start_date,end_date,plan_type");
      const cMap = new Map((cs ?? []).map((c) => [c.id, `${c.plan_type} · ${c.start_date}`]));
      const cIds = (cs ?? []).map((c) => c.id);
      if (!cIds.length) return setRows([]);
      const { data: ts } = await supabase
        .from("tasks").select("id,title,deliverable_type,is_extra,contract_id").in("contract_id", cIds);
      const tMap = new Map((ts ?? []).map((t) => [t.id, t]));
      const tIds = (ts ?? []).map((t) => t.id);
      if (!tIds.length) return setRows([]);
      const { data: ss } = await supabase
        .from("submissions")
        .select("id,task_id,url,file_url,reviewed_at,metadata")
        .in("task_id", tIds).eq("status", "approved")
        .order("reviewed_at", { ascending: false });
      const subIds = (ss ?? []).map((s) => s.id);
      const { data: sn } = subIds.length
        ? await supabase.from("kpi_snapshots").select("submission_id,clicks,impressions,engagement_rate,recorded_date")
            .in("submission_id", subIds).eq("status", "qc_approved").order("recorded_date", { ascending: false })
        : { data: [] };
      const latest = new Map<string, { clicks: number; impressions: number; er: number | null }>();
      for (const s of sn ?? []) {
        if (!latest.has(s.submission_id))
          latest.set(s.submission_id, { clicks: s.clicks, impressions: s.impressions, er: s.engagement_rate });
      }
      const out: Row[] = (ss ?? []).map((s) => {
        const t = tMap.get(s.task_id);
        const meta = (s.metadata as Record<string, string> | null) ?? {};
        const l = latest.get(s.id);
        return {
          id: s.id,
          date: s.reviewed_at!,
          contract_id: t?.contract_id ?? "",
          contract_label: cMap.get(t?.contract_id ?? "") ?? "—",
          type: t?.deliverable_type ?? "",
          is_extra: t?.is_extra ?? false,
          title: t?.title ?? "Untitled",
          url: s.url,
          file_url: s.file_url,
          detail: (meta.content_role ?? meta.platform ?? "") as string,
          clicks: l?.clicks ?? null,
          impressions: l?.impressions ?? null,
          er: l?.er ?? null,
        };
      });
      setRows(out);
    })();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (contractFilter !== "all" && r.contract_id !== contractFilter) return false;
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to + "T23:59:59") return false;
    return true;
  }), [rows, contractFilter, typeFilter, from, to]);

  const contracts = Array.from(new Map(rows.map((r) => [r.contract_id, r.contract_label])));

  function exportCsv() {
    const headers = ["Published Date", "Contract", "Type", "Bonus", "Article Title", "Detail", "Link", "Clicks", "Impressions", "Engagement Rate %"];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push([
        new Date(r.date).toISOString().slice(0, 10),
        `"${r.contract_label.replace(/"/g, '""')}"`,
        r.type,
        r.is_extra ? "Yes" : "No",
        `"${r.title.replace(/"/g, '""')}"`,
        r.detail,
        r.url ?? "",
        r.clicks ?? "",
        r.impressions ?? "",
        r.er ?? "",
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "deliverables.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownload(fileUrl: string) {
    const { data } = await supabase.storage.from("submissions").createSignedUrl(fileUrl, 60);
    if (data) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Partner portal</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">All deliverables</h1>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{filtered.length} approved deliverables</span>
            <Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>
          </CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            <Select value={contractFilter} onValueChange={setContractFilter}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Contract" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contracts</SelectItem>
                {contracts.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="article">Articles</SelectItem>
                <SelectItem value="newsletter">Newsletters</SelectItem>
                <SelectItem value="homepage_banner">Homepage banners</SelectItem>
                <SelectItem value="article_banner">Article banners</SelectItem>
                <SelectItem value="social_post">Social posts</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-secondary/30 text-[11px] uppercase text-text-tertiary">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Contract</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Detail</th>
                <th className="px-3 py-2 text-right">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-text-secondary">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-text-tertiary">{r.contract_label}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="capitalize">{r.type.replace(/_/g, " ")}</Badge>
                    {r.is_extra && <Badge className="ml-1 bg-warning-light text-warning border-warning/30">Bonus</Badge>}
                  </td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2 capitalize text-text-tertiary">{r.detail.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-right">
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Open <ExternalLink className="h-3 w-3" /></a>}
                    {r.file_url && <button onClick={() => handleDownload(r.file_url!)} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"><Download className="h-3 w-3" /> Download</button>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-text-tertiary">No deliverables match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

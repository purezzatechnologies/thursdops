import { DELIVERABLE_LABEL_SINGULAR } from "@/lib/contract-display";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/partner/contracts/$id")({
  component: () => (
    <AppShell allowed="content_partner">
      <PartnerContractDetail />
    </AppShell>
  ),
});

interface Contract {
  id: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  status: string;
  total_articles: number;
  total_newsletters: number;
  total_homepage_banners: number;
  total_article_banners: number;
  total_social_posts: number;
}
interface Task {
  id: string;
  title: string;
  deliverable_type: string;
  status: string;
  due_date: string;
  is_extra: boolean;
}
interface Sub {
  id: string;
  task_id: string;
  submission_type: string;
  url: string | null;
  file_url: string | null;
  reviewed_at: string;
  metadata: Record<string, unknown> | null;
}
interface Snap {
  submission_id: string;
  recorded_date: string;
  clicks: number;
  impressions: number;
  engagement_rate: number | null;
}

const TYPE_LABEL: Record<string, string> = {
  article: "Articles",
  newsletter: "Newsletters",
  homepage_banner: "Homepage banners",
  article_banner: "Article banners",
  social_post: "Social posts",
};

function PartnerContractDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [contract, setContract] = useState<Contract | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    void (async () => {
      const { data: c } = await supabase
        .from("contracts")
        .select("id,plan_type,start_date,end_date,status,total_articles,total_newsletters,total_homepage_banners,total_article_banners,total_social_posts,content_partner_id")
        .eq("id", id)
        .maybeSingle();
      if (!c) {
        toast.error("Not found.");
        void navigate({ to: "/partner" });
        return;
      }
      setContract(c);
      const { data: p } = await supabase.from("content_partners").select("name").eq("id", c.content_partner_id).maybeSingle();
      setPartnerName(p?.name ?? "");
      const { data: ts } = await supabase
        .from("tasks").select("id,title,deliverable_type,status,due_date,is_extra")
        .eq("contract_id", id).order("due_date", { ascending: true });
      setTasks(ts ?? []);
      const taskIds = (ts ?? []).map((t) => t.id);
      if (taskIds.length) {
        const { data: ss } = await supabase
          .from("submissions")
          .select("id,task_id,submission_type,url,file_url,reviewed_at,metadata")
          .in("task_id", taskIds).eq("status", "approved")
          .order("reviewed_at", { ascending: false });
        setSubs((ss ?? []) as Sub[]);
        const subIds = (ss ?? []).map((s) => s.id);
        if (subIds.length) {
          const { data: sn } = await supabase
            .from("kpi_snapshots").select("submission_id,recorded_date,clicks,impressions,engagement_rate")
            .in("submission_id", subIds).eq("status", "qc_approved")
            .order("recorded_date", { ascending: false });
          setSnaps(sn ?? []);
        }
      }
    })();
  }, [id, navigate]);

  if (!contract) return <div className="text-text-tertiary">Loading…</div>;

  const today = new Date().toISOString().slice(0, 10);
  const days = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86400000);
  const stateText =
    contract.status === "active" && contract.end_date >= today
      ? `Active — ${days} days remaining`
      : contract.status === "completed"
      ? `Completed on ${contract.end_date}`
      : `Ended ${Math.abs(days)} days ago`;

  const promised: Record<string, number> = {
    article: contract.total_articles,
    newsletter: contract.total_newsletters,
    homepage_banner: contract.total_homepage_banners,
    article_banner: contract.total_article_banners,
    social_post: contract.total_social_posts,
  };

  const tasksByType: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (t.is_extra) continue;
    (tasksByType[t.deliverable_type] ??= []).push(t);
  }
  const extras = tasks.filter((t) => t.is_extra);
  const totalPromised = Object.values(promised).reduce((a, b) => a + b, 0);
  const totalDelivered = tasks.filter((t) => !t.is_extra && t.status === "completed").length;
  const totalExtras = extras.length;

  // Latest snapshot per submission
  const latestBySub = new Map<string, Snap>();
  for (const s of snaps) if (!latestBySub.has(s.submission_id)) latestBySub.set(s.submission_id, s);

  const totalClicks = Array.from(latestBySub.values()).reduce((a, s) => a + s.clicks, 0);
  const totalImpressions = Array.from(latestBySub.values()).reduce((a, s) => a + s.impressions, 0);
  const erList = Array.from(latestBySub.values()).map((s) => s.engagement_rate).filter((v): v is number => v != null);
  const avgEr = erList.length ? erList.reduce((a, b) => a + b, 0) / erList.length : null;

  // Weekly trend
  const weekly: { label: string; clicks: number; impressions: number }[] = [];
  const start = new Date(contract.start_date).getTime();
  const end = Math.min(new Date(contract.end_date).getTime(), Date.now());
  for (let t = start; t <= end; t += 7 * 86400000) {
    const wEnd = t + 7 * 86400000;
    const inWeek = snaps.filter((s) => {
      const d = new Date(s.recorded_date).getTime();
      return d >= t && d < wEnd;
    });
    weekly.push({
      label: new Date(t).toISOString().slice(5, 10),
      clicks: inWeek.reduce((a, s) => a + s.clicks, 0),
      impressions: inWeek.reduce((a, s) => a + s.impressions, 0),
    });
  }

  const subTaskMap = new Map(tasks.map((t) => [t.id, t]));
  const filteredSubs = subs.filter((s) => {
    if (typeFilter === "all") return true;
    return subTaskMap.get(s.task_id)?.deliverable_type === typeFilter;
  });

  async function handleDownload(fileUrl: string) {
    const { data, error } = await supabase.storage.from("submissions").createSignedUrl(fileUrl, 60);
    if (error || !data) return toast.error("Download failed.");
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Partner portal</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">{partnerName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">{contract.plan_type}</Badge>
          <Badge className="capitalize">{contract.status}</Badge>
          <span className="text-sm text-text-tertiary">{stateText}</span>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          We've delivered {totalDelivered} of {totalPromised} promised pieces.
          {totalExtras > 0 && <> Plus {totalExtras} bonus deliverables.</>}
        </p>
      </div>

      <Tabs defaultValue="deliverables" className="w-full">
        <TabsList>
          <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
          <TabsTrigger value="approved">Approved Deliverables</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="deliverables" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(promised).map(([type, total]) => {
              const list = tasksByType[type] ?? [];
              const delivered = list.filter((t) => t.status === "completed").length;
              const scheduled = list.filter((t) =>
                ["not_started", "in_progress", "submitted", "under_review", "rework_requested", "approved"].includes(t.status),
              ).length;
              const unscheduled = Math.max(total - delivered - scheduled, 0);
              const denom = Math.max(total, 1);
              return (
                <Card key={type} className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{TYPE_LABEL[type]} ({total})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="h-full bg-success" style={{ width: `${(delivered / denom) * 100}%` }} />
                      <div className="-mt-2 h-full bg-primary opacity-60" style={{ width: `${(scheduled / denom) * 100}%`, marginLeft: `${(delivered / denom) * 100}%` }} />
                    </div>
                    <p className="text-xs text-text-tertiary">
                      <span className="font-semibold text-success">{delivered}</span> delivered ·{" "}
                      <span className="font-semibold text-primary">{scheduled}</span> scheduled ·{" "}
                      <span>{unscheduled}</span> unscheduled
                    </p>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-text-tertiary">View tasks</summary>
                      <ul className="mt-2 space-y-1">
                        {list.map((t) => (
                          <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                            <span className="truncate">{t.title}</span>
                            <span className="text-text-tertiary">{t.due_date}</span>
                          </li>
                        ))}
                        {list.length === 0 && <li className="text-text-tertiary">None scheduled.</li>}
                      </ul>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {extras.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Bonus deliverables</CardTitle></CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-text-tertiary">Additional content delivered beyond your contract — a bonus from the team.</p>
                <ul className="space-y-1 text-xs">
                  {extras.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                      <span className="truncate">
                        <Badge variant="outline" className="mr-2 capitalize">{(DELIVERABLE_LABEL_SINGULAR[t.deliverable_type] ?? t.deliverable_type.replace(/_/g, " "))}</Badge>
                        {t.title}
                      </span>
                      <span className="text-text-tertiary">{t.status} · {t.due_date}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-text-tertiary">Scheduled deliverables show planned dates; actual delivery dates appear once approved.</p>
        </TabsContent>

        <TabsContent value="approved" className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Filter:</span>
            <Button size="sm" variant={typeFilter === "all" ? "default" : "outline"} onClick={() => setTypeFilter("all")}>All</Button>
            {Object.keys(promised).map((t) => (
              <Button key={t} size="sm" variant={typeFilter === t ? "default" : "outline"} onClick={() => setTypeFilter(t)}>{TYPE_LABEL[t]}</Button>
            ))}
          </div>
          <Card className="border-border">
            <CardContent className="p-0">
              {filteredSubs.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-tertiary">No approved deliverables yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/30 text-[11px] uppercase text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Task</th>
                      <th className="px-3 py-2 text-left">Detail</th>
                      <th className="px-3 py-2 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredSubs.map((s) => {
                      const t = subTaskMap.get(s.task_id);
                      const meta = (s.metadata as Record<string, string> | null) ?? {};
                      const detail = meta.content_role ?? meta.platform ?? "";
                      return (
                        <tr key={s.id}>
                          <td className="px-3 py-2 text-text-secondary">{new Date(s.reviewed_at).toLocaleDateString()}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="capitalize">{(t?.deliverable_type ?? "").replace(/_/g, " ")}</Badge>
                            {t?.is_extra && <Badge className="ml-1 bg-warning-light text-warning border-warning/30">Bonus</Badge>}
                          </td>
                          <td className="px-3 py-2">{t?.title ?? "—"}</td>
                          <td className="px-3 py-2 capitalize text-text-tertiary">{detail.replace(/_/g, " ")}</td>
                          <td className="px-3 py-2 text-right">
                            {s.url && (
                              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {s.file_url && (
                              <button onClick={() => handleDownload(s.file_url!)} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                                <Download className="h-3 w-3" /> Download
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4 pt-4">
          <p className="text-xs text-text-tertiary">Performance numbers are reviewed and verified by our team weekly before publishing here.</p>
          {latestBySub.size === 0 ? (
            <Card className="border-border">
              <CardContent className="py-8 text-center text-sm text-text-tertiary">
                Performance data appears here once your approved deliverables have been analyzed by our team. Snapshots are added weekly.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="border-border"><CardContent className="p-5"><div className="text-xs text-text-tertiary">Total clicks</div><div className="mt-2 text-3xl font-bold tabular-nums">{totalClicks.toLocaleString()}</div></CardContent></Card>
                <Card className="border-border"><CardContent className="p-5"><div className="text-xs text-text-tertiary">Total impressions</div><div className="mt-2 text-3xl font-bold tabular-nums">{totalImpressions.toLocaleString()}</div></CardContent></Card>
                <Card className="border-border"><CardContent className="p-5"><div className="text-xs text-text-tertiary">Avg engagement rate</div><div className="mt-2 text-3xl font-bold tabular-nums">{avgEr != null ? `${avgEr.toFixed(2)}%` : "—"}</div></CardContent></Card>
              </div>
              <Card className="border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly trend</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <LineChart data={weekly}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="hsl(var(--primary))" />
                        <Line yAxisId="right" type="monotone" dataKey="impressions" stroke="hsl(var(--success))" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Per-deliverable performance</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-secondary/30 text-[11px] uppercase text-text-tertiary">
                      <tr>
                        <th className="px-3 py-2 text-left">Task</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Delivered</th>
                        <th className="px-3 py-2 text-right">Clicks</th>
                        <th className="px-3 py-2 text-right">Impressions</th>
                        <th className="px-3 py-2 text-right">ER %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {subs.map((s) => {
                        const t = subTaskMap.get(s.task_id);
                        const l = latestBySub.get(s.id);
                        return (
                          <tr key={s.id}>
                            <td className="px-3 py-2">{t?.title}</td>
                            <td className="px-3 py-2 capitalize">{(t?.deliverable_type ?? "").replace(/_/g, " ")}</td>
                            <td className="px-3 py-2 text-text-tertiary">{new Date(s.reviewed_at).toLocaleDateString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l ? l.clicks.toLocaleString() : <span className="text-text-tertiary">Data pending</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l ? l.impressions.toLocaleString() : <span className="text-text-tertiary">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l?.engagement_rate != null ? `${l.engagement_rate}%` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-3 pt-4">
          <p className="text-sm text-text-secondary">Generate a printable report and use your browser's Print → Save as PDF.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["monthly", "quarterly", "full"] as const).map((kind) => (
              <Card key={kind} className="border-border">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold capitalize">{kind} report</div>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {kind === "monthly" && "Covers the most recent complete month."}
                    {kind === "quarterly" && "Covers the most recent complete quarter."}
                    {kind === "full" && "Covers the entire contract period to date."}
                  </p>
                  <Button asChild size="sm" className="mt-3 w-full">
                    <a href={`/partner/contracts/${id}/report?type=${kind}`} target="_blank" rel="noreferrer">Generate</a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

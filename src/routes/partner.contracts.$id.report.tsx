import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/partner/contracts/$id/report")({
  validateSearch: (s: Record<string, unknown>) => ({
    type: (s.type as string) === "quarterly" || s.type === "full" ? (s.type as string) : "monthly",
  }),
  component: ReportPage,
});

const ALLOWED_ROLES = new Set(["content_partner", "manager", "super_admin"]);

interface State {
  partnerName: string;
  contract: { id: string; start_date: string; end_date: string; plan_type: string; status: string } | null;
  deliverables: Array<{ id: string; title: string; type: string; date: string; url: string | null; is_extra: boolean }>;
  perf: { clicks: number; impressions: number; avgEr: number | null };
  per: Array<{ title: string; type: string; clicks: number | null; impressions: number | null; er: number | null }>;
}

function ReportPage() {
  const { id } = Route.useParams();
  const { type } = Route.useSearch();
  const { profile, loading } = useAuth();
  const [state, setState] = useState<State | null>(null);

  if (!loading && !profile) return <Navigate to="/login" />;
  if (!loading && profile && !ALLOWED_ROLES.has(profile.role)) {
    return <div className="p-8 text-text-tertiary">You don't have access to this report.</div>;
  }

  useEffect(() => {
    if (loading || !profile) return;
    void (async () => {
      const now = new Date();
      let rangeStart: Date;
      let rangeEnd: Date;
      if (type === "monthly") {
        rangeEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      } else if (type === "quarterly") {
        const q = Math.floor(now.getMonth() / 3);
        rangeEnd = new Date(now.getFullYear(), q * 3, 0);
        rangeStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      } else {
        rangeStart = new Date("2000-01-01");
        rangeEnd = now;
      }

      const { data: c } = await supabase
        .from("contracts")
        .select("id,start_date,end_date,plan_type,status,content_partner_id")
        .eq("id", id)
        .maybeSingle();
      if (!c) return;
      const { data: p } = await supabase
        .from("content_partners").select("name").eq("id", c.content_partner_id).maybeSingle();

      const { data: ts } = await supabase
        .from("tasks").select("id,title,deliverable_type,is_extra").eq("contract_id", id);
      const tMap = new Map((ts ?? []).map((t) => [t.id, t]));
      const taskIds = (ts ?? []).map((t) => t.id);

      const { data: ss } = taskIds.length
        ? await supabase
            .from("submissions")
            .select("id,task_id,url,reviewed_at")
            .in("task_id", taskIds)
            .eq("status", "approved")
            .gte("reviewed_at", rangeStart.toISOString())
            .lte("reviewed_at", rangeEnd.toISOString())
            .order("reviewed_at", { ascending: true })
        : { data: [] };
      const deliverables = (ss ?? []).map((s) => {
        const t = tMap.get(s.task_id);
        return {
          id: s.id,
          title: t?.title ?? "Untitled",
          type: t?.deliverable_type ?? "",
          date: s.reviewed_at!,
          url: s.url,
          is_extra: t?.is_extra ?? false,
        };
      });
      const subIds = (ss ?? []).map((s) => s.id);
      const { data: sn } = subIds.length
        ? await supabase
            .from("kpi_snapshots")
            .select("submission_id,clicks,impressions,engagement_rate,recorded_date")
            .in("submission_id", subIds)
            .eq("status", "qc_approved")
            .order("recorded_date", { ascending: false })
        : { data: [] };
      const latest = new Map<string, { clicks: number; impressions: number; er: number | null }>();
      for (const s of sn ?? []) {
        if (!latest.has(s.submission_id))
          latest.set(s.submission_id, { clicks: s.clicks, impressions: s.impressions, er: s.engagement_rate });
      }
      const totalClicks = Array.from(latest.values()).reduce((a, x) => a + x.clicks, 0);
      const totalImp = Array.from(latest.values()).reduce((a, x) => a + x.impressions, 0);
      const erList = Array.from(latest.values()).map((x) => x.er).filter((v): v is number => v != null);
      const avgEr = erList.length ? erList.reduce((a, b) => a + b, 0) / erList.length : null;
      const per = deliverables.map((d) => {
        const l = latest.get(d.id);
        return {
          title: d.title,
          type: d.type,
          clicks: l?.clicks ?? null,
          impressions: l?.impressions ?? null,
          er: l?.er ?? null,
        };
      });

      setState({
        partnerName: p?.name ?? "—",
        contract: c,
        deliverables,
        perf: { clicks: totalClicks, impressions: totalImp, avgEr },
        per,
      });
    })();
  }, [id, type, profile, loading]);

  if (!state || !state.contract) {
    return <div className="p-8 text-text-tertiary">Generating report…</div>;
  }

  const typeBreakdown: Record<string, number> = {};
  for (const d of state.deliverables) typeBreakdown[d.type] = (typeBreakdown[d.type] ?? 0) + 1;
  const extras = state.deliverables.filter((d) => d.is_extra).length;

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          .no-print { display: none !important; }
        }
        body { background: white; }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b border-gray-300 bg-gray-50 px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">Use <kbd className="rounded border border-gray-300 px-1.5 py-0.5 text-xs">Cmd/Ctrl + P</kbd> to save as PDF.</div>
        <button onClick={() => window.print()} className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white">
          Print / Save PDF
        </button>
      </div>

      <div className="mx-auto max-w-4xl space-y-8 p-10 font-serif">
        <header className="space-y-2 border-b border-gray-300 pb-6">
          <div className="text-xs uppercase tracking-widest text-gray-500">Thursd · {type} report</div>
          <h1 className="text-4xl font-bold">{state.partnerName}</h1>
          <div className="text-sm text-gray-700">
            Contract: {state.contract.start_date} → {state.contract.end_date} · {state.contract.plan_type}
          </div>
          <div className="text-xs text-gray-500">Generated {new Date().toLocaleDateString()}</div>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold border-b border-gray-200 pb-1">Summary</h2>
          <ul className="text-sm space-y-1">
            <li><strong>{state.deliverables.length}</strong> deliverables completed in this period.</li>
            <li><strong>{extras}</strong> bonus deliverables included.</li>
            <li>Breakdown by type:
              <ul className="ml-4 mt-1 list-disc">
                {Object.entries(typeBreakdown).map(([t, n]) => (
                  <li key={t} className="capitalize">{t.replace(/_/g, " ")}: {n}</li>
                ))}
              </ul>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold border-b border-gray-200 pb-1">Deliverables</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-600">
                <th className="py-2">Date</th>
                <th className="py-2">Type</th>
                <th className="py-2">Title</th>
              </tr>
            </thead>
            <tbody>
              {state.deliverables.map((d) => (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-600">{new Date(d.date).toLocaleDateString()}</td>
                  <td className="py-1.5 capitalize">{d.type.replace(/_/g, " ")}{d.is_extra && " (bonus)"}</td>
                  <td className="py-1.5">{d.title}</td>
                </tr>
              ))}
              {state.deliverables.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-gray-500">No deliverables in this period.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold border-b border-gray-200 pb-1">Performance</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><div className="text-xs uppercase text-gray-500">Total clicks</div><div className="text-2xl font-bold">{state.perf.clicks.toLocaleString()}</div></div>
            <div><div className="text-xs uppercase text-gray-500">Total impressions</div><div className="text-2xl font-bold">{state.perf.impressions.toLocaleString()}</div></div>
            <div><div className="text-xs uppercase text-gray-500">Avg engagement</div><div className="text-2xl font-bold">{state.perf.avgEr != null ? `${state.perf.avgEr.toFixed(2)}%` : "—"}</div></div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-600">
                <th className="py-2">Deliverable</th>
                <th className="py-2 text-right">Clicks</th>
                <th className="py-2 text-right">Impressions</th>
                <th className="py-2 text-right">ER</th>
              </tr>
            </thead>
            <tbody>
              {state.per.map((p, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5">{p.title}</td>
                  <td className="py-1.5 text-right">{p.clicks != null ? p.clicks.toLocaleString() : "Data pending"}</td>
                  <td className="py-1.5 text-right">{p.impressions != null ? p.impressions.toLocaleString() : "—"}</td>
                  <td className="py-1.5 text-right">{p.er != null ? `${p.er}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

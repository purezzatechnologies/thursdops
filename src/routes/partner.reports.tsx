import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/partner/reports")({
  component: () => (
    <AppShell allowed="content_partner">
      <PartnerReports />
    </AppShell>
  ),
});

interface ContractRow {
  id: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

function PartnerReports() {
  const [rows, setRows] = useState<ContractRow[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("contracts").select("id,plan_type,start_date,end_date,status")
        .in("status", ["active", "completed"])
        .order("end_date", { ascending: false });
      setRows(data ?? []);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Partner portal</div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-text-secondary">Download monthly, quarterly, or full-contract performance reports as PDFs.</p>
      </div>

      <div className="space-y-4">
        {rows.length === 0 && (
          <Card className="border-border"><CardContent className="py-8 text-center text-sm text-text-tertiary">No contracts available for reporting.</CardContent></Card>
        )}
        {rows.map((c) => (
          <Card key={c.id} className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{c.plan_type}</Badge>
                <Badge className="capitalize">{c.status}</Badge>
                <span className="text-sm text-text-tertiary">{c.start_date} → {c.end_date}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(["monthly", "quarterly", "full"] as const).map((k) => (
                <Button asChild key={k} size="sm" variant="outline">
                  <a href={`/partner/contracts/${c.id}/report?type=${k}`} target="_blank" rel="noreferrer" className="capitalize">{k} report</a>
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

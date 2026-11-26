import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/partner/contracts/")({
  component: () => (
    <AppShell allowed="content_partner">
      <PartnerContractsList />
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

function PartnerContractsList() {
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [filter, setFilter] = useState<string>("active");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id,plan_type,start_date,end_date,status")
        .order("end_date", { ascending: false });
      setRows(data ?? []);
    })();
  }, []);

  const filtered = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Partner portal</div>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">My contracts</h1>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">{filtered.length} contracts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-text-tertiary">No contracts in this view.</p>}
          {filtered.map((c) => (
            <Link key={c.id} to="/partner/contracts/$id" params={{ id: c.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/50">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">{c.plan_type}</Badge>
                  <Badge className="capitalize">{c.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-text-tertiary">{c.start_date} → {c.end_date}</div>
              </div>
              <Button size="sm" variant="outline">View</Button>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ContractWizard } from "@/components/contract-wizard";
import { supabase } from "@/integrations/supabase/client";
import { shortId } from "@/lib/contract-display";
import { weekStartThu } from "@/lib/week";

export const Route = createFileRoute("/contracts/$id/edit")({
  component: () => (
    <AppShell allowed={["super_admin", "manager"]}>
      <ContractEdit />
    </AppShell>
  ),
});

type DType = "article" | "newsletter" | "homepage_banner" | "article_banner" | "social_post";

interface LoadedPlannedTask {
  uid: string;
  existing_id: string;
  title: string;
  description: string;
  deliverable_type: DType;
  week_index: number;
  due_date: string;
  assigned_to: string | null;
}

function ContractEdit() {
  const { id } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [initial, setInitial] = useState<any>(null);
  const [initialTasks, setInitialTasks] = useState<LoadedPlannedTask[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data: c }, { data: owners }, { data: ts }] = await Promise.all([
        supabase.from("contracts").select("*").eq("id", id).maybeSingle(),
        supabase.from("contract_owners").select("profile_id").eq("contract_id", id),
        supabase
          .from("tasks")
          .select("id,title,brief,deliverable_type,due_date,assigned_to,week_start")
          .eq("contract_id", id)
          .eq("is_extra", false)
          .eq("task_origin", "contract")
          .order("due_date", { ascending: true }),
      ]);
      if (!c) { setNotFound(true); setLoading(false); return; }
      setInitial({
        content_partner_id: c.content_partner_id,
        plan_type: c.plan_type,
        start_date: c.start_date,
        end_date: c.end_date,
        status: c.status,
        notes: c.notes ?? "",
        total_articles: c.total_articles ?? 0,
        total_newsletters: c.total_newsletters ?? 0,
        total_homepage_banners: c.total_homepage_banners ?? 0,
        total_article_banners: c.total_article_banners ?? 0,
        total_social_posts: c.total_social_posts ?? 0,
        owner_ids: (owners ?? []).map((o: any) => o.profile_id),
      });
      // Derive week_index relative to contract start
      const contractStartWeek = weekStartThu(c.start_date);
      const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
      const tasks = (ts ?? []).map((t: any) => {
        const tWeek = t.week_start ? new Date(t.week_start) : weekStartThu(t.due_date);
        const idx = Math.max(1, Math.round((tWeek.getTime() - contractStartWeek.getTime()) / MS_PER_WEEK) + 1);
        return {
          uid: t.id,
          existing_id: t.id,
          title: t.title ?? "",
          description: t.brief ?? "",
          deliverable_type: t.deliverable_type as DType,
          week_index: idx,
          due_date: t.due_date,
          assigned_to: t.assigned_to,
        };
      });
      setInitialTasks(tasks);
      setLoading(false);
    })();
  }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <h1 className="text-xl font-semibold">Contract not found</h1>
        <Link to="/contracts" className="mt-3 inline-block text-sm text-primary hover:underline">← Back to contracts</Link>
      </div>
    );
  }
  if (loading || !initial) {
    return <div className="mx-auto max-w-7xl py-20 text-center text-sm text-text-tertiary">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        crumbs={[{ label: "Contracts", to: "/contracts" }, { label: shortId(id), to: `/contracts/${id}` }, { label: "Edit" }]}
        title="Edit contract"
        subtitle="All commercial terms, weekly tasks, and assignees are pre-filled. Make your changes and save."
      />
      <ContractWizard editContractId={id} initial={initial} editInitialTasks={initialTasks} />
    </div>
  );
}

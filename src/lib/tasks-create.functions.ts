import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DeliverableTypeZ = z.enum([
  "article",
  "newsletter",
  "homepage_banner",
  "article_banner",
  "social_post",
]);

// Full delivery vocabulary — accepted for single (esp. editorial) deliverables.
// The wizard batch stays on the 5 planner buckets above.
const DeliverableTypeAllZ = z.enum([
  "article", "newsletter", "homepage_banner", "article_banner", "social_post",
  "extra_article", "banner_homepage", "banner_newsletter", "newsletter_mention",
  "top_reads", "most_read", "facebook", "instagram", "linkedin", "tiktok",
  "pinterest", "editorial_feature", "campaign_presence", "case_study",
  "intelligence_report", "event_coverage",
]);

const PlannedTaskZ = z.object({
  existing_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, "Title required"),
  description: z.string().optional().nullable(),
  deliverable_type: DeliverableTypeZ,
  due_date: z.string(), // YYYY-MM-DD
  assigned_to: z.string().uuid().optional().nullable(),
});

const ContractWithTasksInput = z.object({
  // Contract fields
  content_partner_id: z.string().uuid(),
  plan_type: z.enum(["monthly", "quarterly", "six_month", "annual", "custom"]),
  start_date: z.string(),
  end_date: z.string(),
  status: z.enum(["draft", "active", "completed", "expired", "cancelled"]),
  notes: z.string().max(5000).optional().nullable(),
  total_articles: z.number().int().min(0).default(0),
  total_newsletters: z.number().int().min(0).default(0),
  total_homepage_banners: z.number().int().min(0).default(0),
  total_article_banners: z.number().int().min(0).default(0),
  total_social_posts: z.number().int().min(0).default(0),
  owner_ids: z.array(z.string().uuid()).min(1),
  tasks: z.array(PlannedTaskZ),
});

async function assertManager(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!data || (data.role !== "super_admin" && data.role !== "manager")) {
    throw new Error("Forbidden: managers or admins only.");
  }
}

export const createContractWithTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ContractWithTasksInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertManager(supabaseAdmin, context.userId);

    if (new Date(data.end_date) <= new Date(data.start_date)) {
      throw new Error("End date must be after start date.");
    }
    const total =
      data.total_articles +
      data.total_newsletters +
      data.total_homepage_banners +
      data.total_article_banners +
      data.total_social_posts;
    if (total === 0) throw new Error("At least one deliverable count must be greater than zero.");

    // 1. Insert contract
    const { data: inserted, error } = await supabaseAdmin
      .from("contracts")
      .insert({
        content_partner_id: data.content_partner_id,
        plan_type: data.plan_type,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status,
        notes: data.notes ?? null,
        total_articles: data.total_articles,
        total_newsletters: data.total_newsletters,
        total_homepage_banners: data.total_homepage_banners,
        total_article_banners: data.total_article_banners,
        total_social_posts: data.total_social_posts,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to create contract.");
    const contractId = inserted.id;

    // 2. Insert owners
    if (data.owner_ids.length) {
      const { error: oErr } = await supabaseAdmin
        .from("contract_owners")
        .insert(
          data.owner_ids.map((pid) => ({
            contract_id: contractId,
            profile_id: pid,
            updated_by: context.userId,
          })),
        );
      if (oErr) throw new Error(oErr.message);
    }

    // 3. Insert tasks
    if (data.tasks.length) {
      const rows = data.tasks.map((t) => ({
        contract_id: contractId,
        title: t.title,
        brief: t.description ?? null,
        deliverable_type: t.deliverable_type,
        due_date: t.due_date,
        assigned_to: t.assigned_to ?? null,
        status: "not_started" as const,
        priority: "normal" as const,
        is_extra: false,
        task_origin: "contract" as const,
        updated_by: context.userId,
      }));
      const { error: tErr } = await supabaseAdmin.from("tasks").insert(rows);
      if (tErr) throw new Error(`Contract created but task insert failed: ${tErr.message}`);
    }

    return { id: contractId, task_count: data.tasks.length };
  });

/* ============================================================ */
/* Single task creation — editorial or contract-linked          */
/* ============================================================ */

const TaskCreateInput = z.object({
  origin: z.enum(["contract", "editorial"]),
  contract_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  deliverable_type: DeliverableTypeAllZ,
  due_date: z.string(),
  assigned_to: z.string().uuid().optional().nullable(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  is_extra: z.boolean().default(false),
});

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TaskCreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertManager(supabaseAdmin, context.userId);

    if (data.origin === "contract" && !data.contract_id) {
      throw new Error("Contract is required for contract-linked tasks.");
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("tasks")
      .insert({
        contract_id: data.origin === "contract" ? data.contract_id! : null,
        title: data.title,
        brief: data.description ?? null,
        deliverable_type: data.deliverable_type,
        due_date: data.due_date,
        assigned_to: data.assigned_to ?? null,
        priority: data.priority,
        status: "not_started" as const,
        is_extra: data.is_extra,
        task_origin: data.origin,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to create task.");
    return { id: inserted.id };
  });

/* ============================================================ */
/* Update existing contract + reconcile its tasks               */
/* ============================================================ */

const ContractUpdateWithTasksInput = ContractWithTasksInput.extend({
  id: z.string().uuid(),
});

export const updateContractWithTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ContractUpdateWithTasksInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertManager(supabaseAdmin, context.userId);

    if (new Date(data.end_date) <= new Date(data.start_date)) {
      throw new Error("End date must be after start date.");
    }

    // 1. Update contract row
    const { error: cErr } = await supabaseAdmin
      .from("contracts")
      .update({
        content_partner_id: data.content_partner_id,
        plan_type: data.plan_type,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status,
        notes: data.notes ?? null,
        total_articles: data.total_articles,
        total_newsletters: data.total_newsletters,
        total_homepage_banners: data.total_homepage_banners,
        total_article_banners: data.total_article_banners,
        total_social_posts: data.total_social_posts,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (cErr) throw new Error(cErr.message);

    // 2. Replace owners
    await supabaseAdmin.from("contract_owners").delete().eq("contract_id", data.id);
    if (data.owner_ids.length) {
      const { error: oErr } = await supabaseAdmin
        .from("contract_owners")
        .insert(data.owner_ids.map((pid) => ({
          contract_id: data.id, profile_id: pid, updated_by: context.userId,
        })));
      if (oErr) throw new Error(oErr.message);
    }

    // 3. Reconcile tasks
    const { data: existing } = await supabaseAdmin
      .from("tasks")
      .select("id,status")
      .eq("contract_id", data.id)
      .eq("is_extra", false)
      .eq("task_origin", "contract");
    const existingIds = new Set((existing ?? []).map((t: any) => t.id));
    const keepIds = new Set(
      data.tasks.map((t) => t.existing_id).filter((x): x is string => !!x),
    );

    // Tasks to delete: in DB but not in payload
    const toDelete = (existing ?? []).filter((t: any) => !keepIds.has(t.id));
    if (toDelete.length) {
      const ids = toDelete.map((t: any) => t.id);
      // Refuse if any have started progress / submissions
      const blocking = toDelete.filter((t: any) => t.status !== "not_started" && t.status !== "cancelled");
      if (blocking.length) {
        throw new Error(
          `Cannot remove ${blocking.length} task(s) that are already in progress. Cancel them individually first.`,
        );
      }
      const { count: subCount } = await supabaseAdmin
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .in("task_id", ids);
      if ((subCount ?? 0) > 0) {
        throw new Error("Cannot remove tasks that already have submissions.");
      }
      const { error: dErr } = await supabaseAdmin.from("tasks").delete().in("id", ids);
      if (dErr) throw new Error(dErr.message);
    }

    // Update existing & insert new
    const toInsert: any[] = [];
    for (const t of data.tasks) {
      if (t.existing_id && existingIds.has(t.existing_id)) {
        const { error: uErr } = await supabaseAdmin
          .from("tasks")
          .update({
            title: t.title,
            brief: t.description ?? null,
            deliverable_type: t.deliverable_type,
            due_date: t.due_date,
            assigned_to: t.assigned_to ?? null,
            updated_by: context.userId,
          })
          .eq("id", t.existing_id);
        if (uErr) throw new Error(uErr.message);
      } else {
        toInsert.push({
          contract_id: data.id,
          title: t.title,
          brief: t.description ?? null,
          deliverable_type: t.deliverable_type,
          due_date: t.due_date,
          assigned_to: t.assigned_to ?? null,
          status: "not_started" as const,
          priority: "normal" as const,
          is_extra: false,
          task_origin: "contract" as const,
          updated_by: context.userId,
        });
      }
    }
    if (toInsert.length) {
      const { error: iErr } = await supabaseAdmin.from("tasks").insert(toInsert);
      if (iErr) throw new Error(iErr.message);
    }

    return { id: data.id, task_count: data.tasks.length };
  });

const CopyToNewsletterInput = z.object({
  source_task_id: z.string().uuid(),
  due_date: z.string(), // YYYY-MM-DD
  assigned_to: z.string().uuid(),
  title_override: z.string().min(1).max(300).optional().nullable(),
  reference_image_url: z.string().url().optional().nullable(),
});

export const copyArticleToNewsletter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CopyToNewsletterInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertManager(supabaseAdmin, context.userId);

    const { data: src, error: srcErr } = await supabaseAdmin
      .from("tasks").select("*").eq("id", data.source_task_id).maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("Source task not found.");
    if (src.deliverable_type !== "article") {
      throw new Error("Only article tasks can be copied to a newsletter.");
    }

    const insert: any = {
      contract_id: src.contract_id,
      deliverable_type: "newsletter",
      title: data.title_override ?? `[Copied] ${src.title}`,
      brief: data.reference_image_url
        ? `${src.brief ?? ""}${src.brief ? "\n\n" : ""}Reference image: ${data.reference_image_url}`
        : src.brief,
      due_date: data.due_date,
      assigned_to: data.assigned_to,
      status: "not_started",
      priority: "normal",
      is_extra: src.contract_id ? false : false,
      task_origin: src.contract_id ? "contract" : "editorial",
      copied_from_task_id: src.id,
      updated_by: context.userId,
    };
    const { data: created, error } = await supabaseAdmin
      .from("tasks").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

/**
 * Duplicate a task card — clone all its fields into a new not-started task in the
 * same week. A duplicate of a contract task is created as an EXTRA (bonus) so it
 * never inflates the contract's promised/delivered counts.
 */
export const duplicateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ task_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertManager(supabaseAdmin, context.userId);

    const { data: src, error: srcErr } = await supabaseAdmin
      .from("tasks").select("*").eq("id", data.task_id).maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("Task not found.");

    const insert: any = {
      contract_id: src.contract_id,
      deliverable_type: src.deliverable_type,
      title: `[Copy] ${src.title}`,
      brief: src.brief,
      due_date: src.due_date,
      assigned_to: src.assigned_to,
      status: "not_started",
      priority: src.priority,
      // Contract duplicates are bonus/extra so they don't consume a promised slot.
      is_extra: src.contract_id ? true : false,
      task_origin: src.task_origin,
      week_start: src.week_start,
      week_label: src.week_label,
      featured_image_url: src.featured_image_url,
      copied_from_task_id: src.id,
      updated_by: context.userId,
    };
    const { data: created, error } = await supabaseAdmin
      .from("tasks").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

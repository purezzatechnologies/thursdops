import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DeliverableType =
  | "article"
  | "newsletter"
  | "homepage_banner"
  | "article_banner"
  | "social_post";
// ContractStatus removed (was unused at runtime)

const ACTIVE_TASK_STATES = [
  "not_started",
  "in_progress",
  "submitted",
  "under_review",
  "rework_requested",
  "approved",
] as const;

async function assertManager(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!data || (data.role !== "super_admin" && data.role !== "manager")) {
    throw new Error("Forbidden: managers or admins only.");
  }
  return data.role as "super_admin" | "manager";
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.role !== "super_admin") {
    throw new Error("Forbidden: super admins only.");
  }
}

const ContractInput = z.object({
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
  owner_ids: z.array(z.string().uuid()).min(1, "At least one owner required"),
});

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ContractInput.parse(d))
  .handler(async ({ data, context }) => {
    const role = await assertManager(context.userId);

    if (
      data.total_articles +
        data.total_newsletters +
        data.total_homepage_banners +
        data.total_article_banners +
        data.total_social_posts ===
      0
    ) {
      throw new Error("At least one deliverable count must be greater than zero.");
    }
    if (new Date(data.end_date) <= new Date(data.start_date)) {
      throw new Error("End date must be after start date.");
    }

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

    const ownerRows = data.owner_ids.map((pid) => ({
      contract_id: inserted.id,
      profile_id: pid,
      updated_by: context.userId,
    }));
    const { error: oErr } = await supabaseAdmin.from("contract_owners").insert(ownerRows);
    if (oErr) throw new Error(oErr.message);

    void notifyOwners(inserted.id, data.owner_ids, `Contract created (${data.status})`, "contract_status_changed");
    void role;
    return { id: inserted.id };
  });

export const updateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ContractInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("contracts")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Contract not found.");

    if (
      data.total_articles +
        data.total_newsletters +
        data.total_homepage_banners +
        data.total_article_banners +
        data.total_social_posts ===
      0
    ) {
      throw new Error("At least one deliverable count must be greater than zero.");
    }

    // Validate decreased totals don't drop below already-scheduled+delivered
    const { data: summary } = await supabaseAdmin.rpc("contract_deliverable_summary", {
      _contract_id: data.id,
    });
    const counts: Record<string, number> = {};
    for (const row of (summary ?? []) as Array<{
      deliverable_type: string;
      delivered_count: number;
      scheduled_count: number;
    }>) {
      counts[row.deliverable_type] = row.delivered_count + row.scheduled_count;
    }
    const pairs: Array<[DeliverableType, number]> = [
      ["article", data.total_articles],
      ["newsletter", data.total_newsletters],
      ["homepage_banner", data.total_homepage_banners],
      ["article_banner", data.total_article_banners],
      ["social_post", data.total_social_posts],
    ];
    for (const [t, val] of pairs) {
      if ((counts[t] ?? 0) > val) {
        throw new Error(
          `Cannot reduce ${t} total below ${counts[t]} — that many are already delivered or scheduled.`,
        );
      }
    }

    const statusChanged = existing.status !== data.status;

    const { error } = await supabaseAdmin
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
    if (error) throw new Error(error.message);

    // Replace owners
    await supabaseAdmin.from("contract_owners").delete().eq("contract_id", data.id);
    const ownerRows = data.owner_ids.map((pid) => ({
      contract_id: data.id,
      profile_id: pid,
      updated_by: context.userId,
    }));
    const { error: oErr } = await supabaseAdmin.from("contract_owners").insert(ownerRows);
    if (oErr) throw new Error(oErr.message);

    if (statusChanged) {
      void notifyOwners(data.id, data.owner_ids, `Contract status changed to ${data.status}`, "contract_status_changed");
    }
    return { id: data.id };
  });

export const setContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      contract_id: z.string().uuid(),
      next_status: z.enum(["draft", "active", "completed", "expired", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertManager(context.userId);

    if (data.next_status === "cancelled" && role !== "super_admin") {
      throw new Error("Only super admins can cancel a contract.");
    }

    const { data: c } = await supabaseAdmin
      .from("contracts")
      .select("status")
      .eq("id", data.contract_id)
      .maybeSingle();
    if (!c) throw new Error("Contract not found.");

    let cancelledTaskCount = 0;

    if (data.next_status === "completed") {
      const { count } = await supabaseAdmin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", data.contract_id)
        .eq("is_extra", false)
        .in("status", [...ACTIVE_TASK_STATES]);
      if ((count ?? 0) > 0) {
        throw new Error(
          `Cannot mark contract Completed — ${count} tasks are still open. Complete or cancel them first.`,
        );
      }
    }

    if (data.next_status === "cancelled") {
      const { data: openTasks } = await supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("contract_id", data.contract_id)
        .not("status", "in", "(completed,cancelled)");
      cancelledTaskCount = openTasks?.length ?? 0;
      if (cancelledTaskCount > 0) {
        await supabaseAdmin
          .from("tasks")
          .update({ status: "cancelled", updated_by: context.userId })
          .in("id", openTasks!.map((t) => t.id));
      }
    }

    const { error } = await supabaseAdmin
      .from("contracts")
      .update({
        status: data.next_status,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.contract_id);
    if (error) throw new Error(error.message);

    const { data: owners } = await supabaseAdmin
      .from("contract_owners")
      .select("profile_id")
      .eq("contract_id", data.contract_id);
    void notifyOwners(
      data.contract_id,
      (owners ?? []).map((o) => o.profile_id),
      `Contract status changed to ${data.next_status}`,
      "contract_status_changed",
    );

    return { cancelledTaskCount };
  });

// ---------- TASKS ----------

const TaskInput = z.object({
  contract_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  brief: z.string().max(5000).optional().nullable(),
  deliverable_type: z.enum([
    "article",
    "newsletter",
    "homepage_banner",
    "article_banner",
    "social_post",
  ]),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  is_extra: z.boolean().default(false),
});

async function getUnscheduledCount(contractId: string, type: DeliverableType): Promise<number> {
  const { data } = await supabaseAdmin.rpc("contract_deliverable_summary", {
    _contract_id: contractId,
  });
  const row = (data ?? []).find(
    (r: { deliverable_type: string }) => r.deliverable_type === type,
  ) as { unscheduled_count: number } | undefined;
  return row?.unscheduled_count ?? 0;
}

async function validateAssignee(
  profileId: string | null | undefined,
  deliverableType: DeliverableType,
) {
  if (!profileId) return;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role,is_active")
    .eq("id", profileId)
    .maybeSingle();
  if (!data || !data.is_active) throw new Error("Selected assignee is not active.");
  const role = data.role;
  if (role === "content_partner") throw new Error("Cannot assign to content partner.");
  if (role === "ops_support" && deliverableType !== "newsletter" && deliverableType !== "social_post") {
    throw new Error("Ops support can only be assigned to newsletter or social post tasks.");
  }
}

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TaskInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);
    await validateAssignee(data.assigned_to ?? null, data.deliverable_type);

    if (!data.is_extra) {
      const unsched = await getUnscheduledCount(data.contract_id, data.deliverable_type);
      if (unsched < 1) {
        throw new Error(
          `All ${data.deliverable_type}s for this contract are already scheduled or delivered. Mark as Extra or increase the contract total.`,
        );
      }
    }

    if (new Date(data.due_date) < new Date(new Date().toISOString().slice(0, 10))) {
      throw new Error("Due date cannot be in the past.");
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("tasks")
      .insert({
        contract_id: data.contract_id,
        title: data.title,
        brief: data.brief ?? null,
        deliverable_type: data.deliverable_type,
        assigned_to: data.assigned_to ?? null,
        due_date: data.due_date,
        priority: data.priority,
        is_extra: data.is_extra,
        status: "not_started",
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to create task.");

    if (data.assigned_to) {
      await writeNotification({
        recipient_id: data.assigned_to,
        type: "task_assigned",
        title: `New task assigned: ${data.title}`,
        body: `Due ${data.due_date}`,
        link: await taskLinkForAssignee(data.assigned_to, inserted.id),
      });
    }

    return { id: inserted.id };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      brief: z.string().max(5000).nullable().optional(),
      assigned_to: z.string().uuid().nullable().optional(),
      due_date: z.string(),
      priority: z.enum(["low", "normal", "high"]),
      is_extra: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("tasks")
      .select("id,contract_id,deliverable_type,assigned_to,due_date,status,is_extra")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Task not found.");

    await validateAssignee(data.assigned_to ?? null, existing.deliverable_type as DeliverableType);

    if (existing.status !== "not_started") {
      // Cannot move due_date earlier
      if (new Date(data.due_date) < new Date(existing.due_date)) {
        throw new Error("Cannot move due date earlier on an in-progress task.");
      }
      // Cannot reassign
      if ((existing.assigned_to ?? null) !== (data.assigned_to ?? null)) {
        throw new Error("Reset task to 'Not Started' before reassigning.");
      }
      // Cannot toggle is_extra
      if (existing.is_extra !== data.is_extra) {
        throw new Error("Cannot change Extra status on an in-progress task.");
      }
    }

    // If toggling away from is_extra to false (or remains false), validate slot
    if (!data.is_extra && existing.is_extra && existing.contract_id) {
      const unsched = await getUnscheduledCount(
        existing.contract_id,
        existing.deliverable_type as DeliverableType,
      );
      if (unsched < 1) {
        throw new Error(`No unscheduled ${existing.deliverable_type} slot available.`);
      }
    }

    const { error } = await supabaseAdmin
      .from("tasks")
      .update({
        title: data.title,
        brief: data.brief ?? null,
        assigned_to: data.assigned_to ?? null,
        due_date: data.due_date,
        priority: data.priority,
        is_extra: data.is_extra,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (
      data.assigned_to &&
      (existing.assigned_to ?? null) !== data.assigned_to
    ) {
      await writeNotification({
        recipient_id: data.assigned_to,
        type: "task_assigned",
        title: `Task assigned: ${data.title}`,
        body: `Due ${data.due_date}`,
        link: await taskLinkForAssignee(data.assigned_to, data.id),
      });
    } else if (data.assigned_to && existing.due_date !== data.due_date) {
      await writeNotification({
        recipient_id: data.assigned_to,
        type: "task_due_date_changed",
        title: `Due date changed: ${data.title}`,
        body: `New due date ${data.due_date}`,
        link: await taskLinkForAssignee(data.assigned_to, data.id),
      });
    }

    return { id: data.id };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!t) throw new Error("Task not found.");
    if (t.status !== "not_started") {
      throw new Error("Only tasks in 'Not Started' status can be deleted. Cancel the task instead.");
    }
    const { error } = await supabaseAdmin.from("tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("title,assigned_to,status")
      .eq("id", data.id)
      .maybeSingle();
    if (!t) throw new Error("Task not found.");
    if (t.status === "completed" || t.status === "cancelled") {
      throw new Error("Task cannot be cancelled from its current status.");
    }
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ status: "cancelled", updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (t.assigned_to) {
      await writeNotification({
        recipient_id: t.assigned_to,
        type: "task_cancelled",
        title: `Task cancelled: ${t.title}`,
        body: null,
        link: null,
      });
    }
    return { ok: true };
  });

export const resetTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!t) throw new Error("Task not found.");
    if (!["in_progress", "submitted", "under_review", "rework_requested"].includes(t.status)) {
      throw new Error("Task is not in a resettable state.");
    }
    // Clear draft submissions for this task
    await supabaseAdmin.from("submissions").delete().eq("task_id", data.id).eq("status", "draft");
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ status: "not_started", updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BulkInput = z.object({
  contract_id: z.string().uuid(),
  deliverable_type: z.enum([
    "article",
    "newsletter",
    "homepage_banner",
    "article_banner",
    "social_post",
  ]),
  is_extra: z.boolean().default(false),
  rows: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        assigned_to: z.string().uuid().nullable().optional(),
        due_date: z.string(),
        priority: z.enum(["low", "normal", "high"]),
      }),
    )
    .min(1)
    .max(200),
});

export const bulkCreateTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BulkInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);

    if (!data.is_extra) {
      const unsched = await getUnscheduledCount(data.contract_id, data.deliverable_type);
      if (data.rows.length > unsched) {
        throw new Error(
          `Cannot create ${data.rows.length} ${data.deliverable_type} tasks — only ${unsched} unscheduled slots remain.`,
        );
      }
    }

    for (const r of data.rows) {
      await validateAssignee(r.assigned_to ?? null, data.deliverable_type);
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const r of data.rows) {
      if (r.due_date < today) throw new Error(`Due date ${r.due_date} is in the past.`);
    }

    const rows = data.rows.map((r) => ({
      contract_id: data.contract_id,
      title: r.title,
      deliverable_type: data.deliverable_type,
      assigned_to: r.assigned_to ?? null,
      due_date: r.due_date,
      priority: r.priority,
      is_extra: data.is_extra,
      status: "not_started" as const,
      updated_by: context.userId,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from("tasks")
      .insert(rows)
      .select("id,assigned_to,title,due_date");
    if (error || !inserted) throw new Error(error?.message ?? "Bulk insert failed.");

    for (const t of inserted) {
      if (t.assigned_to) {
        await writeNotification({
          recipient_id: t.assigned_to,
          type: "task_assigned",
          title: `New task assigned: ${t.title}`,
          body: `Due ${t.due_date}`,
          link: await taskLinkForAssignee(t.assigned_to, t.id),
        });
      }
    }

    return { count: inserted.length };
  });

// ---------- helpers ----------

async function writeNotification(n: {
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}) {
  await supabaseAdmin.from("notifications").insert(n);
}

/** Role-aware task workspace link for a given assignee profile id. */
async function taskLinkForAssignee(assigneeId: string, taskId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", assigneeId)
    .maybeSingle();
  if (data?.role === "ops_support") return `/ops/tasks/${taskId}`;
  if (data?.role === "manager" || data?.role === "super_admin") return `/manager/all-tasks/${taskId}`;
  return `/editor/tasks/${taskId}`;
}

async function notifyOwners(
  contractId: string,
  ownerIds: string[],
  title: string,
  type: string,
) {
  for (const oid of ownerIds) {
    await writeNotification({
      recipient_id: oid,
      type,
      title,
      body: null,
      link: `/contracts/${contractId}`,
    });
  }
}

void ACTIVE_TASK_STATES;

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      task_id: z.string().uuid(),
      status: z.enum(["not_started", "in_progress", "submitted", "under_review", "rework_requested", "approved", "completed", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me) throw new Error("Profile not found.");

    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id,assigned_to,status")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!task) throw new Error("Task not found.");

    const isPrivileged = me.role === "manager" || me.role === "super_admin";
    const isAssignee = task.assigned_to === context.userId;

    if (!isPrivileged && !isAssignee) throw new Error("Not allowed.");

    // Assignees can only toggle not_started ↔ in_progress
    if (!isPrivileged) {
      const allowed = ["not_started", "in_progress"];
      if (!allowed.includes(data.status) || !allowed.includes(task.status)) {
        throw new Error("Only managers can set this status.");
      }
    }

    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ status: data.status, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
  });

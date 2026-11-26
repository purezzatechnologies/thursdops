import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Saral claims an unassigned newsletter or social task for himself.
 * One-way: only managers/super_admin can un-claim via the scheduler.
 */
export const claimTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ task_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me || me.role !== "ops_support") {
      throw new Error("Only Ops Support can claim tasks.");
    }
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("id,deliverable_type,assigned_to,status")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!t) throw new Error("Task not found.");
    if (t.assigned_to) throw new Error("Task is already assigned.");
    if (t.deliverable_type !== "newsletter" && t.deliverable_type !== "social_post") {
      throw new Error("You can only claim newsletter or social tasks.");
    }
    if (t.status !== "not_started") {
      throw new Error("Only Not Started tasks can be claimed.");
    }
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to: context.userId,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

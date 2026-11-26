import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SubmissionMetadata = z.object({
  newsletter_content_role: z.enum(["banner", "article_promotion", "top_read_link"]).optional(),
  issue_identifier: z.string().max(200).optional(),
  social_platform: z.enum(["instagram", "linkedin", "facebook", "pinterest", "twitter", "youtube", "tiktok"]).optional(),
  post_format: z.enum(["photo", "video", "carousel", "reel", "story", "text"]).optional(),
}).partial();

const Attachment = z.object({
  kind: z.enum(["url", "social_link", "file", "screenshot"]),
  url: z.string().max(2000),
  name: z.string().max(300).nullable().optional(),
});

const SubmissionInput = z.object({
  task_id: z.string().uuid(),
  submission_type: z.enum(["text", "url", "file", "screenshot", "social_link"]),
  url: z.string().url().max(2000).nullable().optional(),
  file_url: z.string().max(2000).nullable().optional(),
  screenshot_url: z.string().max(2000).nullable().optional(),
  attachments: z.array(Attachment).max(30).optional(),
  text_content: z.string().max(20000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  metadata: SubmissionMetadata.nullable().optional(),
  intent: z.enum(["draft", "submit"]),
});

async function loadTaskAndRole(userId: string, taskId: string) {
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!me) throw new Error("Profile not found.");
  const { data: t } = await supabaseAdmin
    .from("tasks")
    .select("id,title,contract_id,assigned_to,due_date,status,deliverable_type")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) throw new Error("Task not found.");

  const isPrivileged = me.role === "manager" || me.role === "super_admin";
  if (!isPrivileged && t.assigned_to !== userId) {
    throw new Error("This task is not assigned to you.");
  }
  return { task: t, role: me.role as "editor" | "ops_support" | "manager" | "super_admin" | "content_partner" };
}

export const saveSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SubmissionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { task, role } = await loadTaskAndRole(context.userId, data.task_id);

    const atts = data.attachments ?? [];
    if (data.intent === "submit") {
      if (data.submission_type === "text") {
        if (!data.text_content || !data.text_content.trim()) throw new Error("Write your update before submitting.");
      } else if (data.submission_type === "url" || data.submission_type === "social_link") {
        if (atts.length === 0 && !data.url?.trim()) throw new Error("Add at least one link before submitting.");
      } else if (data.submission_type === "file") {
        if (atts.length === 0 && !data.file_url) throw new Error("Upload at least one file before submitting.");
      } else if (data.submission_type === "screenshot") {
        if (atts.length === 0 && !data.screenshot_url) throw new Error("Upload at least one screenshot before submitting.");
      }
      if (role === "ops_support") {
        if (task.deliverable_type === "newsletter" && !data.metadata?.newsletter_content_role) {
          throw new Error("Newsletter content role is required.");
        }
        if (task.deliverable_type === "social_post" && !data.metadata?.social_platform) {
          throw new Error("Social platform is required.");
        }
      }
    }

    const { data: existingDraft } = await supabaseAdmin
      .from("submissions")
      .select("id,status")
      .eq("task_id", data.task_id)
      .eq("submitted_by", context.userId)
      .eq("status", "draft")
      .maybeSingle();

    let target = existingDraft;
    if (!target && data.intent === "submit") {
      const { data: rework } = await supabaseAdmin
        .from("submissions")
        .select("id,status")
        .eq("task_id", data.task_id)
        .eq("submitted_by", context.userId)
        .in("status", ["rejected", "rework_requested"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = rework;
    }

    const now = new Date().toISOString();
    const status = data.intent === "draft" ? "draft" : "submitted";
    const metadata = data.metadata && Object.keys(data.metadata).length ? data.metadata : null;

    // Legacy single columns mirror the first attachment of each kind so older
    // readers keep working; `attachments` holds the complete list.
    const firstLink = atts.find((a) => a.kind === "url" || a.kind === "social_link")?.url ?? data.url ?? null;
    const firstFile = atts.find((a) => a.kind === "file")?.url ?? data.file_url ?? null;
    const firstShot = atts.find((a) => a.kind === "screenshot")?.url ?? data.screenshot_url ?? null;

    let submissionId: string;

    if (target) {
      const { error } = await supabaseAdmin
        .from("submissions")
        .update({
          submission_type: data.submission_type,
          url: firstLink,
          file_url: firstFile,
          screenshot_url: firstShot,
          attachments: atts,
          text_content: data.text_content ?? null,
          notes: data.notes ?? null,
          metadata,
          status,
          submitted_at: data.intent === "submit" ? now : null,
          updated_by: context.userId,
          updated_at: now,
        })
        .eq("id", target.id);
      if (error) throw new Error(error.message);
      submissionId = target.id;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("submissions")
        .insert({
          task_id: data.task_id,
          submitted_by: context.userId,
          submission_type: data.submission_type,
          url: firstLink,
          file_url: firstFile,
          screenshot_url: firstShot,
          attachments: atts,
          text_content: data.text_content ?? null,
          notes: data.notes ?? null,
          metadata,
          status,
          submitted_at: data.intent === "submit" ? now : null,
          updated_by: context.userId,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Failed to save submission.");
      submissionId = inserted.id;
    }

    if (data.intent === "submit") {
      await supabaseAdmin
        .from("tasks")
        .update({ status: "submitted", updated_by: context.userId, updated_at: now })
        .eq("id", data.task_id);

      const { data: owners } = task.contract_id ? await supabaseAdmin
        .from("contract_owners")
        .select("profile_id")
        .eq("contract_id", task.contract_id) : { data: [] as { profile_id: string }[] };
      const { data: submitter } = await supabaseAdmin
        .from("profiles")
        .select("full_name,email")
        .eq("id", context.userId)
        .maybeSingle();
      const { data: contract } = task.contract_id ? await supabaseAdmin
        .from("contracts")
        .select("content_partner_id")
        .eq("id", task.contract_id)
        .maybeSingle() : { data: null };
      let partnerName = "";
      if (contract) {
        const { data: cp } = await supabaseAdmin
          .from("content_partners")
          .select("name")
          .eq("id", contract.content_partner_id)
          .maybeSingle();
        partnerName = cp?.name ?? "";
      }
      const submitterName = submitter?.full_name ?? submitter?.email ?? "User";

      const recipients = (owners ?? [])
        .map((o) => o.profile_id)
        .filter((id) => id !== context.userId);
      for (const rid of recipients) {
        await supabaseAdmin.from("notifications").insert({
          recipient_id: rid,
          type: "submission_submitted",
          title: `Submission needs review: ${task.title}`,
          body: `By ${submitterName}${partnerName ? ` · ${partnerName}` : ""} · Due was ${task.due_date}`,
          link: `/manager/approvals/${submissionId}`,
        });
      }
    }

    return { id: submissionId, status };
  });

export const editorSetTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      task_id: z.string().uuid(),
      next_status: z.enum(["not_started", "in_progress"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: t } = await supabaseAdmin
      .from("tasks")
      .select("id,assigned_to,status")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!t) throw new Error("Task not found.");
    if (t.assigned_to !== context.userId) throw new Error("Not your task.");
    if (t.status !== "not_started" && t.status !== "in_progress") {
      throw new Error("Status changes from this state happen automatically.");
    }
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({
        status: data.next_status,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

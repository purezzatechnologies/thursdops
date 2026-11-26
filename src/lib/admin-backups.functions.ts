import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Backups (super admin only). A pg_cron job creates an 'auto' backup every 6
 * hours; super admins can also back up on demand, download, restore, or delete
 * any snapshot. Restores replace all business data but never touch login
 * accounts.
 */

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const DELETE_ORDER = [
  "notifications", "kpi_snapshot_edits", "kpi_snapshots", "submissions",
  "partner_requests", "contract_owners", "tasks", "partner_users",
  "contracts", "content_partners",
] as const;
const INSERT_ORDER = [...DELETE_ORDER].reverse();
const ALLOWED_HOURS = [1, 2, 3, 4, 6, 8, 12, 24] as const;

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!data || data.role !== "super_admin") throw new Error("Forbidden: super admins only.");
}

async function currentIntervalHours(): Promise<number> {
  const { data } = await supabaseAdmin.from("backup_config").select("interval_hours").eq("id", 1).maybeSingle();
  return data?.interval_hours ?? 6;
}

/** List backup metadata (newest first) — never ships the heavy payload. */
export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("data_backups")
      .select("id, created_at, kind, label, record_count")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { backups: data ?? [] };
  });

/** Create a manual backup now. */
export const createBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ label: z.string().trim().max(120).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin.rpc("create_data_backup", {
      _kind: "manual",
      _label: data.label && data.label.trim() ? data.label.trim() : null,
      _created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Safety net for the 6-hour cadence: if the newest auto backup is older than 6h
 * (or none exists), create one. Called when a super admin opens the Backups
 * page, so the schedule holds even where pg_cron isn't running.
 */
export const ensureAutoBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { data: latest } = await supabaseAdmin
      .from("data_backups")
      .select("created_at")
      .eq("kind", "auto")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const intervalMs = (await currentIntervalHours()) * 60 * 60 * 1000;
    const stale = !latest || Date.now() - new Date(latest.created_at).getTime() > intervalMs;
    if (stale) {
      const { error } = await supabaseAdmin.rpc("create_data_backup", { _kind: "auto", _label: null, _created_by: null });
      if (error) throw new Error(error.message);
    }
    return { created: stale };
  });

/** Fetch a full backup payload (for download). */
export const getBackupPayload = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("data_backups")
      .select("id, created_at, kind, label, record_count, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Backup not found.");
    return {
      _meta: { app: "thursdops", kind: "backup", backup_id: row.id, created_at: row.created_at, label: row.label, total: row.record_count },
      tables: row.payload,
    };
  });

/** Delete a backup. */
export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin.from("data_backups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Restore all business data from a stored backup (wipe + re-insert). */
export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("data_backups").select("payload").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Backup not found.");
    const tables = (row.payload ?? {}) as Record<string, Record<string, unknown>[]>;

    // Wipe (children → parents).
    for (const table of DELETE_ORDER) {
      const { error: delErr } = await supabaseAdmin.from(table).delete().neq("id", ZERO_UUID);
      if (delErr) throw new Error(`Restore (clear ${table}) failed: ${delErr.message}`);
    }
    // Insert (parents → children).
    let inserted = 0;
    for (const table of INSERT_ORDER) {
      const rows = tables[table];
      if (!rows || rows.length === 0) continue;
      const { error: insErr } = await supabaseAdmin.from(table).insert(rows);
      if (insErr) throw new Error(`Restore (insert ${table}) failed: ${insErr.message}`);
      inserted += rows.length;
    }
    return { ok: true, inserted };
  });

/** Current automatic-backup interval (hours) + the allowed options. */
export const getBackupInterval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    return { hours: await currentIntervalHours(), options: [...ALLOWED_HOURS] };
  });

/** Change the automatic-backup interval and reschedule the cron job. */
export const setBackupInterval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ hours: z.number().int().refine((h) => (ALLOWED_HOURS as readonly number[]).includes(h), "Unsupported interval") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin.rpc("set_backup_interval", { _hours: data.hours, _user: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true, hours: data.hours };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Developer-mode data tools (super admin only): back up, wipe, and restore all
 * business data. LOGIN accounts (profiles, auth users) and user_preferences are
 * deliberately preserved so the app stays usable after a wipe.
 */

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

// Child → parent order (safe for deletion).
const DELETE_ORDER = [
  "notifications",
  "kpi_snapshot_edits",
  "kpi_snapshots",
  "submissions",
  "partner_requests",
  "contract_owners",
  "tasks",
  "partner_users",
  "contracts",
  "content_partners",
] as const;

// Parent → child order (safe for insertion / restore).
const INSERT_ORDER = [...DELETE_ORDER].reverse();

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.role !== "super_admin") {
    throw new Error("Forbidden: super admins only.");
  }
}

/** Snapshot every business table into a single JSON payload. */
export const exportAllData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const tables: Record<string, unknown[]> = {};
    let total = 0;
    // Export in insert order so the file can be restored top-to-bottom.
    for (const table of INSERT_ORDER) {
      const { data, error } = await supabaseAdmin.from(table).select("*");
      if (error) throw new Error(`Export failed on ${table}: ${error.message}`);
      tables[table] = data ?? [];
      total += (data ?? []).length;
    }
    return {
      _meta: { app: "thursdops", kind: "full-backup", version: 1, generated_at: new Date().toISOString(), total },
      tables,
    };
  });

/** Count rows per business table (for the developer panel status). */
export const getDataCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const counts: { table: string; count: number }[] = [];
    let total = 0;
    for (const table of INSERT_ORDER) {
      const { count } = await supabaseAdmin.from(table).select("id", { count: "exact", head: true });
      const c = count ?? 0;
      total += c;
      counts.push({ table, count: c });
    }
    return { total, counts };
  });

/** Delete every row from all business tables (login accounts preserved). */
export const wipeAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ confirm: z.literal("ERASE") }).parse(d))
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    console.error(`[admin-data] wipeAllData invoked by super admin ${context.userId} at ${new Date().toISOString()}`);
    let deleted = 0;
    for (const table of DELETE_ORDER) {
      const { count, error } = await supabaseAdmin
        .from(table)
        .delete({ count: "exact" })
        .neq("id", ZERO_UUID);
      if (error) throw new Error(`Wipe failed on ${table}: ${error.message}`);
      deleted += count ?? 0;
    }
    return { ok: true, deleted };
  });

/** Wipe, then re-insert everything from a previously exported backup payload. */
export const restoreAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      payload: z.object({
        _meta: z.object({ kind: z.string() }).partial().optional(),
        tables: z.record(z.string(), z.array(z.record(z.string(), z.any()))),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const tables = data.payload.tables;

    // Clear first (children → parents).
    for (const table of DELETE_ORDER) {
      const { error } = await supabaseAdmin.from(table).delete().neq("id", ZERO_UUID);
      if (error) throw new Error(`Restore (clear ${table}) failed: ${error.message}`);
    }
    // Insert (parents → children).
    let inserted = 0;
    for (const table of INSERT_ORDER) {
      const rows = tables[table];
      if (!rows || rows.length === 0) continue;
      const { error } = await supabaseAdmin.from(table).insert(rows);
      if (error) throw new Error(`Restore (insert ${table}) failed: ${error.message}`);
      inserted += rows.length;
    }
    return { ok: true, inserted };
  });

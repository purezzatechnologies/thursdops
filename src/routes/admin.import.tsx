import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, MinusCircle, Loader2, Play,
  AlertTriangle, RefreshCw, BadgeCheck,
} from "lucide-react";
import {
  IMPORT_SPEC, IMPORT_ENTITIES, LENIENT_ENTITIES,
  type ImportEntity, type ImportResult, type IncompleteRecord,
} from "@/lib/bulk-import-spec";
import { bulkImport, listIncompleteImports, markImportVerified } from "@/lib/bulk-import.functions";

export const Route = createFileRoute("/admin/import")({
  component: () => (
    <AppShell allowed="super_admin">
      <ImportPage />
    </AppShell>
  ),
});

// ── CSV parsing (quoted fields, embedded commas/newlines) ──────────────────
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  const t = text.replace(/\r\n?/g, "\n");
  let field = "", row: string[] = [], inQ = false, i = 0;
  while (i < t.length) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out;
}
function toObjects(text: string): { headers: string[]; objects: Record<string, string>[] } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!rows.length) return { headers: [], objects: [] };
  const headers = rows[0].map((h) => h.trim());
  const objects = rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => (o[h] = (r[idx] ?? "").trim()));
    return o;
  });
  return { headers, objects };
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function ImportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-1">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bulk Import</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Upload a CSV to create records in bulk. Validate first, review the preview, then import. Super-admin only.
        </p>
      </div>
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="verify">Needs verification</TabsTrigger>
        </TabsList>
        <TabsContent value="import" className="mt-4"><ImportTab /></TabsContent>
        <TabsContent value="verify" className="mt-4"><VerifyTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ImportTab() {
  const callImport = useServerFn(bulkImport);
  const confirm = useConfirm();
  const [entity, setEntity] = useState<ImportEntity>("content_partners");
  const [text, setText] = useState("");
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<false | "preview" | "commit">(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const spec = IMPORT_SPEC[entity];
  const lenient = LENIENT_ENTITIES.includes(entity);
  const parsed = useMemo(() => toObjects(text), [text]);
  const missingRequired = useMemo(() => {
    if (!parsed.headers.length) return [];
    return spec.columns.filter((c) => c.required && !parsed.headers.includes(c.key)).map((c) => c.key);
  }, [parsed.headers, spec]);

  function resetFor(e: ImportEntity) {
    setEntity(e); setText(""); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadTemplate() {
    const cols = spec.columns.map((c) => c.key);
    const csv = cols.join(",") + "\n" + cols.map((c) => csvCell(spec.example[c] ?? "")).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${entity}-template.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text()); setResult(null);
  }

  async function run(commit: boolean) {
    if (!parsed.objects.length) { toast.error("No data rows found. Upload or paste a CSV first."); return; }
    if (parsed.objects.length > 2000) { toast.error("Max 2000 rows per import. Split the file."); return; }
    if (missingRequired.length && !(lenient && allowIncomplete)) { toast.error(`Missing required column(s): ${missingRequired.join(", ")}`); return; }
    setBusy(commit ? "commit" : "preview");
    try {
      const res = await callImport({ data: { entity, rows: parsed.objects, commit, allowIncomplete: lenient && allowIncomplete } });
      setResult(res);
      if (commit) toast.success(`Imported ${res.willInsert} ${spec.label.toLowerCase()} (${res.incomplete} incomplete) · ${res.skipped} skipped · ${res.errors} error(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally { setBusy(false); }
  }

  async function onCommit() {
    const ok = await confirm({
      title: `Import ${result?.willInsert ?? 0} ${spec.label.toLowerCase()}?`,
      description: `${result?.incomplete ? `${result.incomplete} incomplete row(s) will be flagged for verification. ` : ""}Rows marked skip or error are ignored. This can't be undone in bulk.`,
      confirmText: "Import now",
    });
    if (ok) await run(true);
  }

  const badge = (a: string) =>
    a === "insert" ? <Badge className="bg-success-light text-success">insert</Badge>
    : a === "incomplete" ? <Badge className="bg-warning-light text-warning">incomplete</Badge>
    : a === "skip" ? <Badge variant="outline" className="text-text-tertiary">skip</Badge>
    : <Badge className="bg-danger-light text-danger">error</Badge>;

  return (
    <div className="space-y-5">
      {/* Step 1 — entity + template */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">What are you importing?</label>
              <Select value={entity} onValueChange={(v) => resetFor(v as ImportEntity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMPORT_ENTITIES.map((e) => <SelectItem key={e} value={e}>{IMPORT_SPEC[e].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Download template
            </Button>
          </div>

          <p className="text-sm text-text-secondary">{spec.description}</p>

          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Columns</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {spec.columns.map((c) => (
                <div key={c.key} className="text-xs">
                  <span className="font-mono font-semibold text-text-primary">{c.key}</span>
                  {c.required ? <span className="ml-1 text-danger">*</span> : <span className="ml-1 text-text-tertiary">(optional)</span>}
                  {c.help && <span className="text-text-tertiary"> — {c.help}</span>}
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-text-tertiary">* required · {spec.dedupeNote}</div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — data */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Data</div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> Upload CSV
              </Button>
            </div>
          </div>
          <Textarea
            rows={7} value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); }}
            placeholder={`Paste CSV here, or upload a file.\nFirst row must be the column headers (${spec.columns.filter((c) => c.required).map((c) => c.key).join(", ")}, …).`}
            className="font-mono text-xs"
          />

          {lenient && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
              <Switch checked={allowIncomplete} onCheckedChange={(v) => { setAllowIncomplete(v); setResult(null); }} className="mt-0.5" />
              <span className="text-xs">
                <span className="font-semibold text-text-primary">Import incomplete rows</span>
                <span className="text-text-secondary"> — rows with blank or unresolved fields are still imported, flagged for verification (see the “Needs verification” tab). Missing dates default to today, missing types to a safe default. {spec.hardRequired && <span className="text-text-tertiary">{spec.hardRequired}</span>}</span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-text-tertiary">
              {parsed.objects.length > 0 ? `${parsed.objects.length} data row(s) · ${parsed.headers.length} column(s)` : "No rows yet"}
              {missingRequired.length > 0 && <span className="ml-2 text-danger">Missing required: {missingRequired.join(", ")}</span>}
            </div>
            <Button onClick={() => run(false)} disabled={busy !== false || !parsed.objects.length} className="gap-2">
              {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Validate &amp; preview
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — preview + commit */}
      {result && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> <b>{result.willInsert - result.incomplete}</b> {result.committed ? "inserted" : "to insert"}</div>
              <div className="flex items-center gap-1.5 text-sm"><AlertTriangle className="h-4 w-4 text-warning" /> <b>{result.incomplete}</b> incomplete</div>
              <div className="flex items-center gap-1.5 text-sm"><MinusCircle className="h-4 w-4 text-text-tertiary" /> <b>{result.skipped}</b> skipped</div>
              <div className="flex items-center gap-1.5 text-sm"><AlertCircle className="h-4 w-4 text-danger" /> <b>{result.errors}</b> error(s)</div>
              <div className="ml-auto">
                {result.committed ? (
                  <Badge className="bg-success-light text-success gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Imported</Badge>
                ) : (
                  <Button onClick={onCommit} disabled={busy !== false || result.willInsert === 0} className="gap-2">
                    {busy === "commit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Import {result.willInsert} row(s)
                  </Button>
                )}
              </div>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
                  <tr className="text-left text-text-tertiary">
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.slice(0, 500).map((r) => (
                    <tr key={r.row} className="border-t border-border align-top">
                      <td className="px-3 py-1.5 text-text-tertiary">{r.row}</td>
                      <td className="px-3 py-1.5">{badge(r.action)}</td>
                      <td className="px-3 py-1.5">
                        {r.action === "error"
                          ? <span className="text-danger">{r.message}</span>
                          : <span className="text-text-secondary">
                              {r.summary}{r.message ? ` — ${r.message}` : ""}
                              {r.missing?.length ? <span className="text-warning"> · missing: {r.missing.join(", ")}</span> : null}
                            </span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.results.length > 500 && <div className="border-t border-border px-3 py-2 text-[11px] text-text-tertiary">Showing first 500 of {result.results.length} rows.</div>}
            </div>
            {!result.committed && result.errors > 0 && <p className="text-xs text-text-tertiary">Fix the error rows in your CSV and re-validate, or import anyway — error rows are skipped.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Verification queue ─────────────────────────────────────────────────────
function VerifyTab() {
  const callList = useServerFn(listIncompleteImports);
  const callMark = useServerFn(markImportVerified);
  const [rows, setRows] = useState<IncompleteRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await callList({})); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load."); }
    finally { setLoading(false); }
  }
  // Load once on first render.
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function promote(rec: IncompleteRecord) {
    setBusyId(rec.id);
    try {
      await callMark({ data: { entity: rec.entity, id: rec.id } });
      setRows((rs) => (rs ?? []).filter((r) => r.id !== rec.id));
      toast.success("Marked verified.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update.");
    } finally { setBusyId(null); }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Records awaiting verification</div>
            <p className="text-xs text-text-secondary">Incomplete imports. Open each in its section to fill the gaps, then mark it verified to promote it.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
        </div>

        {rows == null ? (
          <div className="py-10 text-center text-sm text-text-tertiary"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BadgeCheck className="h-8 w-8 text-success" />
            <div className="text-sm font-medium">Nothing to verify</div>
            <div className="text-xs text-text-tertiary">Rows imported with missing data will appear here.</div>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {rows.map((r) => (
              <div key={`${r.entity}-${r.id}`} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">{IMPORT_SPEC[r.entity].label}</Badge>
                    <span className="truncate text-sm font-medium">{r.label}</span>
                  </div>
                  {r.note && <div className="mt-1 text-xs text-warning">Missing: {r.note}</div>}
                </div>
                <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => promote(r)} className="shrink-0 gap-1.5">
                  {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />} Mark verified
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

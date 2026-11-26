import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createContract, updateContract } from "@/lib/contracts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PLAN_TYPE_LABELS } from "@/lib/contract-display";

export interface ContractFormValues {
  content_partner_id: string;
  plan_type: "monthly" | "quarterly" | "six_month" | "annual" | "custom";
  start_date: string;
  end_date: string;
  status: "draft" | "active" | "completed" | "expired" | "cancelled";
  notes: string;
  total_articles: number;
  total_newsletters: number;
  total_homepage_banners: number;
  total_article_banners: number;
  total_social_posts: number;
  owner_ids: string[];
}

const EMPTY: ContractFormValues = {
  content_partner_id: "",
  plan_type: "monthly",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  status: "draft",
  notes: "",
  total_articles: 0,
  total_newsletters: 0,
  total_homepage_banners: 0,
  total_article_banners: 0,
  total_social_posts: 0,
  owner_ids: [],
};

export function ContractForm({
  mode,
  contractId,
  initial,
  lockPartner,
  meta,
}: {
  mode: "create" | "edit";
  contractId?: string;
  initial?: ContractFormValues;
  lockPartner?: boolean;
  meta?: { created_at?: string; updated_at?: string; updated_by_name?: string | null };
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const callCreate = useServerFn(createContract);
  const callUpdate = useServerFn(updateContract);

  const initialValues = useMemo<ContractFormValues>(() => {
    if (initial) return initial;
    return profile && profile.role === "manager"
      ? { ...EMPTY, owner_ids: [profile.id] }
      : EMPTY;
  }, [initial, profile]);

  const [v, setV] = useState<ContractFormValues>(initialValues);
  const [original] = useState<ContractFormValues>(initialValues);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers] = useState<{ id: string; full_name: string | null; email: string; role: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [activate, setActivate] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: pts }, { data: mgrs }] = await Promise.all([
        supabase.from("content_partners").select("id,name").eq("is_active", true).order("name"),
        supabase.from("profiles").select("id,full_name,email,role").in("role", ["manager", "super_admin"]).eq("is_active", true).order("full_name"),
      ]);
      setPartners(pts ?? []);
      setManagers(mgrs ?? []);
    })();
  }, []);

  const set = <K extends keyof ContractFormValues>(k: K, val: ContractFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  function validate(): string | null {
    if (!v.content_partner_id) return "Select a content partner.";
    if (!v.start_date) return "Start date is required.";
    if (!v.end_date) return "End date is required.";
    if (new Date(v.end_date) <= new Date(v.start_date)) return "End date must be after start date.";
    const total = v.total_articles + v.total_newsletters + v.total_homepage_banners + v.total_article_banners + v.total_social_posts;
    if (total === 0) return "At least one deliverable count must be greater than zero.";
    if (v.owner_ids.length === 0) return "At least one contract owner is required.";
    return null;
  }

  async function save(asActive: boolean) {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    setActivate(asActive);
    try {
      const payload = {
        ...v,
        status: asActive && mode === "create" ? ("active" as const) : v.status,
        notes: v.notes || null,
      };
      if (mode === "create") {
        const res = await callCreate({ data: payload });
        toast.success(asActive ? "Contract created and activated." : "Contract created.");
        void navigate({ to: "/contracts/$id", params: { id: res.id } });
      } else {
        await callUpdate({ data: { ...payload, id: contractId! } });
        toast.success("Changes saved.");
        void navigate({ to: "/contracts/$id", params: { id: contractId! } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
      setActivate(false);
    }
  }

  function tryCancel() {
    const dirty = JSON.stringify(v) !== JSON.stringify(original);
    if (dirty) setDiscardOpen(true);
    else goBack();
  }
  function goBack() {
    if (mode === "edit" && contractId) {
      void navigate({ to: "/contracts/$id", params: { id: contractId } });
    } else {
      void navigate({ to: "/contracts" });
    }
  }

  function toggleOwner(id: string) {
    if (v.owner_ids.includes(id)) {
      set("owner_ids", v.owner_ids.filter((x) => x !== id));
    } else {
      set("owner_ids", [...v.owner_ids, id]);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <Card className="border-border">
          <CardContent className="space-y-5 p-6">
            <Section title="Commercial terms">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="mb-1.5 block">Content Partner *</Label>
                  <Select
                    value={v.content_partner_id}
                    onValueChange={(val) => set("content_partner_id", val)}
                    disabled={lockPartner}
                  >
                    <SelectTrigger><SelectValue placeholder="Select a partner" /></SelectTrigger>
                    <SelectContent>
                      {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block">Plan type *</Label>
                  <Select value={v.plan_type} onValueChange={(val) => set("plan_type", val as ContractFormValues["plan_type"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block">Start date *</Label>
                  <Input type="date" value={v.start_date} onChange={(e) => set("start_date", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1.5 block">End date *</Label>
                  <Input type="date" value={v.end_date} onChange={(e) => set("end_date", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1.5 block">Status</Label>
                  <Select value={v.status} onValueChange={(val) => set("status", val as ContractFormValues["status"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      {profile?.role === "super_admin" && <SelectItem value="cancelled">Cancelled</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4">
                <Label className="mb-1.5 block">Internal notes</Label>
                <Textarea rows={3} maxLength={5000} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional, internal use only" />
              </div>
            </Section>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="space-y-4 p-6">
            <Section title="Deliverable promises">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <NumField label="Articles" value={v.total_articles} onChange={(n) => set("total_articles", n)} />
                <NumField label="Newsletters" value={v.total_newsletters} onChange={(n) => set("total_newsletters", n)} />
                <NumField label="Homepage banners" value={v.total_homepage_banners} onChange={(n) => set("total_homepage_banners", n)} />
                <NumField label="Article banners" value={v.total_article_banners} onChange={(n) => set("total_article_banners", n)} />
                <NumField label="Social posts" value={v.total_social_posts} onChange={(n) => set("total_social_posts", n)} />
              </div>
              <p className="mt-3 text-xs text-text-tertiary">
                Total deliverables across the entire contract period. You'll schedule individual tasks with their own due dates and assignees after saving — the system does NOT auto-generate tasks.
              </p>
            </Section>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="space-y-4 p-6">
            <Section title="Contract owners">
              <p className="mb-3 text-xs text-text-tertiary">At least one owner required. Owners receive contract notifications.</p>
              <div className="flex flex-wrap gap-2">
                {v.owner_ids.map((id) => {
                  const m = managers.find((mm) => mm.id === id);
                  return (
                    <div key={id} className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs">
                      <span>{m?.full_name ?? m?.email ?? "—"}</span>
                      <button onClick={() => toggleOwner(id)} className="text-text-tertiary hover:text-text-primary"><X className="h-3 w-3" /></button>
                    </div>
                  );
                })}
                {v.owner_ids.length === 0 && <span className="text-xs text-text-tertiary">No owners selected.</span>}
              </div>
              <div className="mt-4 max-h-48 overflow-y-auto rounded-md border border-border">
                {managers.filter((m) => !v.owner_ids.includes(m.id)).map((m) => (
                  <button key={m.id} onClick={() => toggleOwner(m.id)} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary">
                    <span>{m.full_name ?? m.email}</span>
                    <span className="text-[10px] uppercase tracking-wide text-text-tertiary">{m.role === "super_admin" ? "Admin" : "Manager"}</span>
                  </button>
                ))}
              </div>
            </Section>
          </CardContent>
        </Card>

        {mode === "edit" && meta && (
          <Card className="border-border">
            <CardContent className="grid grid-cols-2 gap-3 p-4 text-xs text-text-tertiary">
              <div>Created: {meta.created_at ? new Date(meta.created_at).toLocaleString() : "—"}</div>
              <div>Last updated: {meta.updated_at ? new Date(meta.updated_at).toLocaleString() : "—"}</div>
              <div>Updated by: {meta.updated_by_name ?? "—"}</div>
            </CardContent>
          </Card>
        )}

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3">
          <Button variant="outline" onClick={tryCancel} disabled={saving}>Cancel</Button>
          {mode === "create" ? (
            <>
              <Button variant="outline" onClick={() => save(false)} disabled={saving}>
                {saving && !activate ? "Saving…" : "Save as Draft"}
              </Button>
              <Button onClick={() => save(true)} disabled={saving}>
                {saving && activate ? "Saving…" : "Save and Activate"}
              </Button>
            </>
          ) : (
            <Button onClick={() => save(false)} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your edits will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={goBack}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{title}</div>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface PartnerFormValues {
  name: string;
  company_details: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  is_active: boolean;
  show_kpi_data: boolean;
}

export interface PartnerFormMeta {
  created_at?: string;
  updated_at?: string;
  updated_by_name?: string | null;
}

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Max 200 characters"),
  company_details: z.string().max(2000, "Max 2000 characters"),
  contact_email: z
    .string()
    .trim()
    .max(255)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email"),
  contact_phone: z.string().trim().max(100),
  notes: z.string().max(5000, "Max 5000 characters"),
  is_active: z.boolean(),
  show_kpi_data: z.boolean(),
});

const EMPTY: PartnerFormValues = {
  name: "",
  company_details: "",
  contact_email: "",
  contact_phone: "",
  notes: "",
  is_active: true,
  show_kpi_data: false,
};

export function PartnerForm({
  mode,
  partnerId,
  initial,
  meta,
}: {
  mode: "create" | "edit";
  partnerId?: string;
  initial?: PartnerFormValues;
  meta?: PartnerFormMeta;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [values, setValues] = useState<PartnerFormValues>(initial ?? EMPTY);
  const [originalValues] = useState<PartnerFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof PartnerFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  function setField<K extends keyof PartnerFormValues>(key: K, value: PartnerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  const isDirty = JSON.stringify(values) !== JSON.stringify(originalValues);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof PartnerFormValues;
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      // Uniqueness check (case-insensitive). Allow same name for own row in edit.
      const { data: existing } = await supabase
        .from("content_partners")
        .select("id")
        .ilike("name", values.name.trim())
        .limit(2);
      const collision = (existing ?? []).some((r) => r.id !== partnerId);
      if (collision) {
        setErrors((e) => ({ ...e, name: "A partner with this name already exists." }));
        setSaving(false);
        return;
      }

      const payload = {
        name: values.name.trim(),
        company_details: values.company_details.trim() || null,
        contact_email: values.contact_email.trim() || null,
        contact_phone: values.contact_phone.trim() || null,
        notes: values.notes.trim() || null,
        is_active: values.is_active,
        show_kpi_data: values.show_kpi_data,
        updated_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      if (mode === "create") {
        const { data, error } = await supabase
          .from("content_partners")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Partner created.");
        void navigate({ to: "/partners/$id", params: { id: data.id } });
      } else if (mode === "edit" && partnerId) {
        const { error } = await supabase
          .from("content_partners")
          .update(payload)
          .eq("id", partnerId);
        if (error) throw error;
        toast.success("Partner updated.");
        void navigate({ to: "/partners/$id", params: { id: partnerId } });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isDirty) {
      setShowDiscard(true);
    } else {
      void navigate({ to: "/partners" });
    }
  }

  const emailWarn = values.contact_email.trim() === "";

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border">
          <CardContent className="space-y-5 p-6">
            <Field
              label="Name"
              required
              error={errors.name}
              hint="Shown across the app. Must be unique."
            >
              <Input
                value={values.name}
                onChange={(e) => setField("name", e.target.value)}
                maxLength={200}
                placeholder="Acme Flowers BV"
              />
            </Field>

            <Field label="Company details" error={errors.company_details} hint="Optional. Address, registration number, etc.">
              <Textarea
                value={values.company_details}
                onChange={(e) => setField("company_details", e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label="Contact email"
                error={errors.contact_email}
                hint={emailWarn ? "Recommended — used to reach the partner." : undefined}
                hintTone={emailWarn ? "warning" : "muted"}
              >
                <Input
                  type="email"
                  value={values.contact_email}
                  onChange={(e) => setField("contact_email", e.target.value)}
                  placeholder="contact@acme.com"
                />
              </Field>

              <Field label="Contact phone" error={errors.contact_phone}>
                <Input
                  value={values.contact_phone}
                  onChange={(e) => setField("contact_phone", e.target.value)}
                  placeholder="+31 …"
                />
              </Field>
            </div>

            <Field
              label="Internal notes"
              error={errors.notes}
              hint="Visible only to super admins and managers — never partner-facing."
            >
              <Textarea
                value={values.notes}
                onChange={(e) => setField("notes", e.target.value)}
                maxLength={5000}
                rows={4}
              />
            </Field>

            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-4">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-text-tertiary">
                  Inactive partners stay in records but cannot have new users or contracts.
                </div>
              </div>
              <Switch
                checked={values.is_active}
                onCheckedChange={(v) => setField("is_active", v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-4">
              <div>
                <div className="text-sm font-medium">Show KPI data to partner</div>
                <div className="text-xs text-text-tertiary">
                  Off by default. When on, this partner sees verified performance metrics
                  (clicks, impressions, engagement) in their reports.
                </div>
              </div>
              <Switch
                checked={values.show_kpi_data}
                onCheckedChange={(v) => setField("show_kpi_data", v)}
              />
            </div>
          </CardContent>
        </Card>

        {mode === "edit" && meta && (
          <Card className="border-border">
            <CardContent className="grid grid-cols-1 gap-4 p-6 text-sm md:grid-cols-3">
              <Meta label="Created" value={fmt(meta.created_at)} />
              <Meta label="Last updated" value={fmt(meta.updated_at)} />
              <Meta label="Last updated by" value={meta.updated_by_name ?? "—"} />
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create partner" : "Save changes"}
          </Button>
        </div>
      </form>

      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leaving will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => navigate({ to: "/partners" })}
              className="bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  hintTone = "muted",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  hintTone?: "muted" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-primary">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className={hintTone === "warning" ? "text-xs text-warning" : "text-xs text-text-tertiary"}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-1 font-medium text-text-primary">{value}</div>
    </div>
  );
}

function fmt(s?: string): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

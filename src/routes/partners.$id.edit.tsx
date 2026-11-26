import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PartnerForm, type PartnerFormValues, type PartnerFormMeta } from "@/components/partner-form";

export const Route = createFileRoute("/partners/$id/edit")({
  component: () => (
    <AppShell allowed={["super_admin", "manager"]}>
      <EditPartner />
    </AppShell>
  ),
});

function EditPartner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState<PartnerFormValues | null>(null);
  const [meta, setMeta] = useState<PartnerFormMeta | undefined>();
  const [name, setName] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("content_partners")
        .select("name,company_details,contact_email,contact_phone,notes,is_active,show_kpi_data,created_at,updated_at,updated_by")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        setNotFound(true);
        return;
      }
      setName(data.name);
      setInitial({
        name: data.name,
        company_details: data.company_details ?? "",
        contact_email: data.contact_email ?? "",
        contact_phone: data.contact_phone ?? "",
        notes: data.notes ?? "",
        is_active: data.is_active,
        show_kpi_data: (data as { show_kpi_data?: boolean }).show_kpi_data ?? false,
      });
      let updatedByName: string | null = null;
      if (data.updated_by) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name,email")
          .eq("id", data.updated_by)
          .maybeSingle();
        updatedByName = p?.full_name ?? p?.email ?? null;
      }
      setMeta({ created_at: data.created_at, updated_at: data.updated_at, updated_by_name: updatedByName });
    })();
  }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <h1 className="text-xl font-semibold">Partner not found</h1>
        <Link to="/partners" className="mt-3 inline-block text-sm text-primary hover:underline">
          ← Back to partners
        </Link>
      </div>
    );
  }

  if (!initial) {
    return <div className="mx-auto max-w-3xl py-20 text-center text-sm text-text-tertiary">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        crumbs={[{ label: "Partners", to: "/partners" }, { label: name, to: `/partners/${id}` }, { label: "Edit" }]}
        title="Edit Partner"
      />
      <PartnerForm mode="edit" partnerId={id} initial={initial} meta={meta} />
    </div>
  );
}

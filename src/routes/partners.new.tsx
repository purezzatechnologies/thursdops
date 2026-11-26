import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PartnerForm } from "@/components/partner-form";

export const Route = createFileRoute("/partners/new")({
  component: () => (
    <AppShell allowed={["super_admin", "manager"]}>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          crumbs={[{ label: "Partners", to: "/partners" }, { label: "New" }]}
          title="New Content Partner"
          subtitle="Create a partner record. You can add login users and contracts after saving."
        />
        <PartnerForm mode="create" />
        <div className="mt-4 text-center text-xs text-text-tertiary">
          <Link to="/partners" className="hover:text-text-primary">← Back to partners</Link>
        </div>
      </div>
    </AppShell>
  ),
});

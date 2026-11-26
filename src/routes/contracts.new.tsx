import { createFileRoute, useSearch } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ContractWizard } from "@/components/contract-wizard";

export const Route = createFileRoute("/contracts/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    partner_id: typeof s.partner_id === "string" ? s.partner_id : undefined,
  }),
  component: () => (
    <AppShell allowed={["super_admin", "manager"]}>
      <NewContract />
    </AppShell>
  ),
});

function NewContract() {
  const { partner_id } = useSearch({ from: "/contracts/new" });
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        crumbs={[{ label: "Contracts", to: "/contracts" }, { label: "New" }]}
        title="New Contract"
        subtitle="Define commercial terms, split deliverables across weeks, and confirm."
      />
      <ContractWizard
        lockPartner={!!partner_id}
        initial={partner_id ? { content_partner_id: partner_id } : undefined}
      />
    </div>
  );
}

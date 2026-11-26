import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TaskDetail } from "@/components/task-detail";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/manager/all-tasks/$id")({
  component: () => (
    <AppShell allowed={["manager", "super_admin"]}>
      <Detail />
    </AppShell>
  ),
});

function Detail() {
  const { id } = Route.useParams();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/manager/all-tasks" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to All Tasks
      </Link>
      <TaskDetail id={id} />
    </div>
  );
}

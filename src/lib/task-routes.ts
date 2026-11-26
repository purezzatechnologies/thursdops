import type { UserRole } from "@/lib/auth";

export interface TaskRouteInfo {
  id: string;
  deliverable_type?: string;
  assigned_to?: string | null;
}

/** Role-aware task workspace path. */
export function getTaskWorkspaceRoute(task: TaskRouteInfo, role: UserRole): string {
  const id = task.id;
  if (role === "ops_support") return `/ops/tasks/${id}`;
  if (role === "editor") return `/editor/tasks/${id}`;
  if (role === "manager" || role === "super_admin") return `/manager/all-tasks/${id}`;
  return `/contracts`;
}


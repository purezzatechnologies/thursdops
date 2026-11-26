import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, dashboardPathForRole } from "@/lib/auth";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => ({ real: s.real === "1" ? "1" : undefined }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const { profile, loading } = useAuth();
  const { real } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (profile) {
      void navigate({ to: dashboardPathForRole(profile.role), replace: true });
    } else if (real === "1") {
      void navigate({ to: "/login", replace: true });
    } else {
      void navigate({ to: "/login", replace: true });
    }
  }, [loading, profile, real, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    void (async () => {
      await signOut();
      void navigate({ to: "/login", replace: true });
    })();
  }, [signOut, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Signing out…
    </div>
  );
}

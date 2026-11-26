import { createFileRoute } from "@tanstack/react-router";
import { LoginView } from "@/components/login-view";

export const Route = createFileRoute("/login")({
  component: () => <LoginView variant="staff" />,
});

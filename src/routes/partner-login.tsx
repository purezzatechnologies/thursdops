import { createFileRoute } from "@tanstack/react-router";
import { LoginView } from "@/components/login-view";

export const Route = createFileRoute("/partner-login")({
  component: () => <LoginView variant="partner" />,
});

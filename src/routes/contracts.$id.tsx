import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/contracts/$id")({
  component: () => <Outlet />,
});

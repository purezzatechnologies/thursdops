import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "muted";

const toneClass: Record<StatusTone, string> = {
  neutral: "border-border bg-secondary text-text-secondary",
  info: "border-info/20 bg-info-light text-info",
  warning: "border-warning/20 bg-warning-light text-warning",
  success: "border-success/20 bg-success-light text-success",
  danger: "border-primary/20 bg-primary-light text-primary",
  muted: "border-border bg-secondary text-text-tertiary line-through",
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

// Active / Inactive convenience
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <StatusBadge tone={active ? "success" : "neutral"}>
      {active ? "Active" : "Inactive"}
    </StatusBadge>
  );
}

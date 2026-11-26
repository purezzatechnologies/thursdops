import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SIZE = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-16 w-16 text-xl",
} as const;

interface Props {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
  rounded?: "full" | "lg";
}

export function UserAvatar({ src, name, size = "md", className, rounded = "full" }: Props) {
  const initials = name
    ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
    : "?";

  return (
    <Avatar className={cn(SIZE[size], rounded === "lg" && "rounded-lg", className)}>
      {src && <AvatarImage src={src} alt={name ?? "avatar"} />}
      <AvatarFallback
        className={cn(
          "font-semibold bg-primary-light text-primary",
          rounded === "lg" && "rounded-lg",
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

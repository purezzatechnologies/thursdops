import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ChatPlaceholder() {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => toast("AI Assistant coming in Phase 2.")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="AI Assistant (coming soon)"
      className={cn(
        "fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
        "transition-all hover:bg-[var(--primary-hover)] hover:scale-105"
      )}
    >
      <MessageCircle className="h-5 w-5" />
      {hover && (
        <span className="pointer-events-none absolute right-14 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow">
          AI Assistant — Phase 2
        </span>
      )}
    </button>
  );
}

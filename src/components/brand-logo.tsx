import { useBranding } from "@/lib/branding";
import { cn } from "@/lib/utils";

/**
 * The app logo. Shows the super-admin-uploaded logo (any aspect ratio fits via
 * object-contain — never stretched or cropped) or falls back to the default
 * "T" mark. Used everywhere the brand appears so uploads apply universally.
 */
export function BrandLogo({
  size = 36,
  rounded = "rounded-lg",
  className,
  fallbackTextClass = "text-base",
  fullWidth = false,
}: {
  size?: number;
  rounded?: string;
  className?: string;
  fallbackTextClass?: string;
  /** Fill the available width; logo is scaled to fit (object-contain) at `size` height. */
  fullWidth?: boolean;
}) {
  const { logoUrl } = useBranding();

  if (logoUrl) {
    if (fullWidth) {
      return (
        <div className={cn("flex w-full items-center", className)} style={{ height: size }}>
          <img src={logoUrl} alt="Logo" className="h-full w-full object-contain object-left" draggable={false} />
        </div>
      );
    }
    return (
      <div
        className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-white/70 dark:bg-white/10", rounded, className)}
        style={{ width: size, height: size }}
      >
        <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" draggable={false} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary font-bold text-primary-foreground shadow-sm",
        rounded,
        fallbackTextClass,
        className,
      )}
      style={{ width: size, height: size }}
    >
      T
    </div>
  );
}

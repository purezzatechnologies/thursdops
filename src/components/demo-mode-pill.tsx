import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DemoModePill() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Demo Mode
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <div className="font-semibold">You are in Demo Mode.</div>
        <p className="mt-1 text-xs text-text-secondary">
          Internal testing only. All data may be reset before production.
        </p>
      </PopoverContent>
    </Popover>
  );
}

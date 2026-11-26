import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Featured-image control for a task. Uploads to the public `task-images`
 * bucket and persists `tasks.featured_image_url`. Shows a preview with
 * upload/replace/remove actions when `canEdit` is true; read-only otherwise.
 */
export function FeaturedImagePicker({
  taskId,
  value,
  canEdit,
  onChange,
  heightClass = "max-h-[28rem]",
}: {
  taskId: string;
  value: string | null;
  canEdit: boolean;
  onChange: (url: string | null) => void;
  heightClass?: string;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${taskId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("task-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("task-images").getPublicUrl(path);
      const url = data.publicUrl;
      const { error: updErr } = await supabase
        .from("tasks")
        .update({ featured_image_url: url })
        .eq("id", taskId);
      if (updErr) throw updErr;
      toast.success("Featured image updated.");
      onChange(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ featured_image_url: null })
        .eq("id", taskId);
      if (error) throw error;
      toast.success("Featured image removed.");
      onChange(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className={cn("relative w-full overflow-hidden rounded-lg border border-border bg-secondary", value ? "" : "h-44")}>
        {value ? (
          <a href={value} target="_blank" rel="noreferrer" title="Open full size" className="block">
            <img
              src={value}
              alt="Featured"
              className={cn("mx-auto w-auto max-w-full object-contain", heightClass)}
            />
          </a>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-text-tertiary">
            <ImageOff className="h-6 w-6" />
            <span className="text-[11px]">No featured image</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="gap-1.5"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {value ? "Replace image" : "Upload featured image"}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void remove()}
              className="gap-1.5 text-danger hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut } from "lucide-react";

const VIEW = 260;   // on-screen crop viewport (px)
const OUT = 512;    // exported image size (px)

/**
 * Circular avatar cropper. The user pans/zooms their photo inside a round guide;
 * on save we export a centred 512×512 square JPEG (no stretching), which the
 * round avatar then displays cleanly.
 */
export function AvatarCropper({
  file, open, onOpenChange, onCropped, uploading,
}: {
  file: File | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCropped: (blob: Blob) => void;
  uploading?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const urlRef = useRef<string | null>(null);

  // Load the selected file into an Image.
  useEffect(() => {
    if (!file) { setImg(null); return; }
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [file]);

  const baseScale = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;

  const clampOffset = useCallback((o: { x: number; y: number }, s: number) => {
    if (!img) return o;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    return {
      x: Math.min(0, Math.max(VIEW - w, o.x)),
      y: Math.min(0, Math.max(VIEW - h, o.y)),
    };
  }, [img]);

  // Centre the image whenever a new one loads.
  useEffect(() => {
    if (!img) return;
    setZoom(1);
    const s = baseScale;
    setOffset({ x: (VIEW - img.naturalWidth * s) / 2, y: (VIEW - img.naturalHeight * s) / 2 });
  }, [img, baseScale]);

  function applyZoom(nextZoom: number) {
    if (!img) return;
    const clamped = Math.min(4, Math.max(1, nextZoom));
    const oldScale = baseScale * zoom;
    const newScale = baseScale * clamped;
    // Keep the viewport centre anchored while zooming.
    const cx = (VIEW / 2 - offset.x) / oldScale;
    const cy = (VIEW / 2 - offset.y) / oldScale;
    const next = { x: VIEW / 2 - cx * newScale, y: VIEW / 2 - cy * newScale };
    setZoom(clamped);
    setOffset(clampOffset(next, newScale));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !img) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, baseScale * zoom));
  }
  function onPointerUp() { drag.current = null; }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    applyZoom(zoom + (e.deltaY < 0 ? 0.15 : -0.15));
  }

  function save() {
    if (!img) return;
    const scale = baseScale * zoom;
    const srcSize = VIEW / scale;
    const srcX = -offset.x / scale;
    const srcY = -offset.y / scale;
    const canvas = document.createElement("canvas");
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUT, OUT);
    canvas.toBlob((blob) => { if (blob) onCropped(blob); }, "image/jpeg", 0.9);
  }

  const dispW = img ? img.naturalWidth * baseScale * zoom : 0;
  const dispH = img ? img.naturalHeight * baseScale * zoom : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploading) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-1">
          <div
            className="relative overflow-hidden rounded-md bg-black/80 touch-none"
            style={{ width: VIEW, height: VIEW, cursor: drag.current ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            {img && (
              <img
                src={img.src}
                alt="Crop preview"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ left: offset.x, top: offset.y, width: dispW, height: dispH }}
              />
            )}
            {/* Round guide + dimmed outside */}
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute inset-0 rounded-full ring-2 ring-white/80"
                style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
              />
            </div>
          </div>

          <div className="flex w-full items-center gap-3 px-1">
            <ZoomOut className="h-4 w-4 shrink-0 text-text-tertiary" />
            <Slider
              value={[zoom]}
              min={1} max={4} step={0.01}
              onValueChange={(v) => applyZoom(v[0])}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-text-tertiary" />
          </div>
          <p className="text-xs text-text-tertiary">Drag to reposition · scroll or use the slider to zoom.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancel</Button>
          <Button onClick={save} disabled={!img || uploading}>{uploading ? "Uploading…" : "Save photo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

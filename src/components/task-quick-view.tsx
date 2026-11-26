import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { TaskDetail } from "@/components/task-detail";

/** Pick the best "featured image" URL from a submission row, if any. */
export function submissionImage(s: {
  screenshot_url?: string | null;
  file_url?: string | null;
  url?: string | null;
  submission_type?: string | null;
}): string | null {
  const looksImage = (u?: string | null) =>
    !!u && /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u);
  if (s.screenshot_url) return s.screenshot_url;
  if (looksImage(s.file_url)) return s.file_url!;
  if (looksImage(s.url)) return s.url!;
  if (s.submission_type === "screenshot" && s.file_url) return s.file_url;
  return null;
}

/** Most recent submission image across a list (submissions expected newest-first). */
export function featuredImageFromSubs(subs: any[]): string | null {
  for (const s of subs) {
    const img = submissionImage(s);
    if (img) return img;
  }
  return null;
}

interface Props {
  taskId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Route pattern for the full task detail page, e.g. "/manager/all-tasks/$id". */
  taskRoute?: string;
  /** Called after a task mutation (featured image, submission) so the board can refresh. */
  onChanged?: () => void;
}

/**
 * Opens the full task detail (all the same sections as the detail page) in a
 * popup, so a card click never leaves the board. Also offers a link to the
 * standalone page.
 */
export function TaskQuickView({ taskId, open, onOpenChange, taskRoute = "/manager/all-tasks/$id", onChanged }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle className="sr-only">Task details</DialogTitle>
        {taskId && (
          <div className="space-y-4">
            <TaskDetail id={taskId} onChanged={onChanged} onClose={() => onOpenChange(false)} />
            <div className="flex justify-end border-t border-border pt-3">
              <Link to={taskRoute as any} params={{ id: taskId } as any} onClick={() => onOpenChange(false)}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  Open full page <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

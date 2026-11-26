import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Copy, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { duplicateTask } from "@/lib/tasks-create.functions";
import { deleteTask } from "@/lib/contracts.functions";
import { TaskEditDialog } from "@/components/task-edit-dialog";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Edit / Duplicate / Delete controls for a single task. Manager & super-admin
 * only; Delete shows only for not-started tasks (matching the server rule).
 * Shared across the board, calendar popup and list view so behaviour is identical.
 */
export function TaskActionButtons({
  task,
  onChanged,
  onDeleted,
}: {
  task: { id: string; status: string };
  onChanged?: () => void;
  onDeleted?: () => void;
}) {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const canManage = profile?.role === "manager" || profile?.role === "super_admin";
  const callDuplicate = useServerFn(duplicateTask);
  const callDelete = useServerFn(deleteTask);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  async function duplicate() {
    setBusy(true);
    try {
      await callDuplicate({ data: { task_id: task.id } });
      toast.success("Task duplicated — all fields copied. Open it to edit.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't duplicate task.");
    } finally { setBusy(false); }
  }

  async function del() {
    if (!(await confirm({ title: "Delete task?", description: "This permanently deletes the task. This can't be undone.", confirmText: "Delete", danger: true }))) return;
    setBusy(true);
    try {
      await callDelete({ data: { id: task.id } });
      toast.success("Task deleted.");
      onChanged?.();
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete task.");
    } finally { setBusy(false); }
  }

  const btn = "rounded p-1.5 text-text-tertiary transition hover:bg-secondary hover:text-text-primary disabled:opacity-50";

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" title="Edit task" aria-label="Edit task" disabled={busy} onClick={() => setEditOpen(true)} className={btn}>
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" title="Duplicate task (copies all fields)" aria-label="Duplicate task" disabled={busy} onClick={duplicate} className={btn}>
        <Copy className="h-4 w-4" />
      </button>
      {task.status === "not_started" && (
        <button type="button" title="Delete task" aria-label="Delete task" disabled={busy} onClick={del} className="rounded p-1.5 text-text-tertiary transition hover:bg-danger-light hover:text-danger disabled:opacity-50">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <TaskEditDialog
        taskId={editOpen ? task.id : null}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
    </div>
  );
}

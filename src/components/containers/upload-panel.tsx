import { useEffect } from "react";
import { useStore } from "zustand";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FileIcon,
  Folder,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { uploadStore, setUploadOnComplete, UploadTask } from "@/stores/upload-store";
import { cn, readableBytes } from "@/lib/utils";
import Button from "@/components/ui/button";

const UploadPanel = () => {
  const queryClient = useQueryClient();
  const tasks = useStore(uploadStore, (s) => s.tasks);
  const collapsed = useStore(uploadStore, (s) => s.collapsed);

  useEffect(() => {
    setUploadOnComplete((bucket) =>
      queryClient.invalidateQueries({ queryKey: ["browse", bucket] })
    );
  }, [queryClient]);

  const active = tasks.filter(
    (t) => t.status === "pending" || t.status === "uploading"
  ).length;
  const done = tasks.filter((t) => t.status === "success").length;
  const errors = tasks.filter((t) => t.status === "error").length;
  const allDone = active === 0;

  // Leaving the page would abort in-flight uploads, so ask first.
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  const onClose = () => {
    if (
      active &&
      !window.confirm(
        `Cancel ${active} upload${active > 1 ? "s" : ""} in progress?`
      )
    ) {
      return;
    }
    uploadStore.clearAll();
  };

  // Auto-dismiss once everything finished cleanly.
  useEffect(() => {
    if (tasks.length && allDone && errors === 0) {
      const t = setTimeout(() => uploadStore.clearFinished(), 4000);
      return () => clearTimeout(t);
    }
  }, [tasks.length, allDone, errors]);

  if (!tasks.length) return null;

  const overall = Math.round(
    tasks.reduce((a, t) => a + (t.status === "success" ? 100 : t.progress), 0) /
      tasks.length
  );

  const title = allDone
    ? errors
      ? `Uploaded ${done}, ${errors} failed`
      : "Uploads complete"
    : `Uploading ${done}/${tasks.length}`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg">
      <div className="flex items-center gap-1 border-b px-4 py-2.5">
        <p className="flex-1 truncate text-sm font-medium">{title}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={collapsed ? "Expand" : "Collapse"}
          onClick={() => uploadStore.toggleCollapsed()}
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </div>

      {/* Overall progress */}
      <div className="h-1 w-full bg-muted">
        <div
          className={cn(
            "h-full transition-all",
            errors ? "bg-red-500" : allDone ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${overall}%` }}
        />
      </div>

      {!collapsed ? (
        <div className="max-h-72 divide-y overflow-y-auto">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const TaskRow = ({ task }: { task: UploadTask }) => {
  const isBusy = task.status === "pending" || task.status === "uploading";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="shrink-0 text-muted-foreground">
        {task.isDir ? <Folder size={16} /> : <FileIcon size={16} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm" title={task.key}>
            {task.name}
          </p>
          <span
            className={cn(
              "shrink-0 text-xs",
              task.status === "error" && task.error !== "Cancelled"
                ? "text-red-500"
                : "text-muted-foreground"
            )}
            title={task.detail}
          >
            {task.status === "uploading"
              ? `${task.progress}%`
              : task.status === "pending"
                ? "Queued"
                : task.status === "error"
                  ? task.error
                  : task.size
                    ? readableBytes(task.size)
                    : ""}
          </span>
        </div>

        {isBusy ? (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        ) : null}
      </div>

      <span className="flex min-w-6 shrink-0 justify-end">
        {task.status === "success" ? (
          <Check size={16} className="text-emerald-500" />
        ) : task.status === "error" ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Retry"
              title="Retry"
              onClick={() => uploadStore.retry(task.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCw size={14} />
            </button>
            <CircleAlert size={16} className="text-red-500" />
          </span>
        ) : task.status === "uploading" ? (
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => uploadStore.cancel(task.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={15} />
          </button>
        ) : (
          <Loader2 size={15} className="animate-spin text-muted-foreground" />
        )}
      </span>
    </div>
  );
};

export default UploadPanel;

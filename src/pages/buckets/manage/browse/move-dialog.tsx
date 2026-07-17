import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Button from "@/components/ui/button";
import { useBrowseObjects, useMoveObjects } from "./hooks";
import { useBucketContext } from "../context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { ChevronRight, CornerLeftUp, Folder, FolderInput, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: string[];
  currentPrefix: string;
  onMoved: () => void;
};

const MoveDialog = ({
  open,
  onOpenChange,
  items,
  currentPrefix,
  onMoved,
}: Props) => {
  const { bucketName } = useBucketContext();
  const [destination, setDestination] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useBrowseObjects(bucketName, {
    prefix: destination,
    limit: 1000,
  });

  const moveObjects = useMoveObjects(bucketName, {
    onSuccess: (res) => {
      toast.success(`Moved ${res.moved} object(s)!`);
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
      onOpenChange(false);
      onMoved();
    },
    onError: handleError,
  });

  // Folders being moved cannot receive themselves or their own subtree.
  const movingFolders = useMemo(
    () => items.filter((i) => i.endsWith("/")),
    [items]
  );

  const isInvalidDestination = (dest: string) =>
    movingFolders.some((folder) => dest.startsWith(folder));

  const folders = data?.prefixes || [];

  const isSameLocation = destination === currentPrefix;
  const canMoveHere = !isInvalidDestination(destination) && !isSameLocation;

  const parentPrefix = useMemo(() => {
    if (!destination) return null;
    const trimmed = destination.slice(0, -1);
    const idx = trimmed.lastIndexOf("/");
    return idx >= 0 ? trimmed.slice(0, idx + 1) : "";
  }, [destination]);

  const crumbs = useMemo(() => {
    const parts = destination.split("/").filter(Boolean);
    return parts.map((part, i) => ({
      label: part,
      prefix: parts.slice(0, i + 1).join("/") + "/",
    }));
  }, [destination]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {items.length} item(s)</DialogTitle>
          <DialogDescription>
            Choose a destination folder in this bucket.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="flex flex-row flex-wrap items-center gap-1 rounded-md border bg-muted/50 px-2 py-1.5 text-sm">
          <button
            type="button"
            onClick={() => setDestination("")}
            className={cn(
              "rounded px-1.5 py-0.5 transition-colors hover:text-foreground",
              destination === ""
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {bucketName}
          </button>
          {crumbs.map((crumb) => (
            <span key={crumb.prefix} className="flex items-center gap-1">
              <ChevronRight size={13} className="text-muted-foreground" />
              <button
                type="button"
                onClick={() => setDestination(crumb.prefix)}
                className={cn(
                  "max-w-[120px] truncate rounded px-1.5 py-0.5 transition-colors hover:text-foreground",
                  crumb.prefix === destination
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="h-56 overflow-y-auto rounded-md border">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={22} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col p-1">
              {parentPrefix !== null ? (
                <FolderRow
                  icon={CornerLeftUp}
                  label=".."
                  onClick={() => setDestination(parentPrefix)}
                />
              ) : null}

              {folders.map((prefix) => {
                const name = prefix
                  .substring(0, prefix.lastIndexOf("/"))
                  .split("/")
                  .pop();
                const disabled =
                  items.includes(prefix) || isInvalidDestination(prefix);
                return (
                  <FolderRow
                    key={prefix}
                    icon={Folder}
                    label={name || prefix}
                    disabled={disabled}
                    onClick={() => setDestination(prefix)}
                  />
                );
              })}

              {!folders.length && parentPrefix === null ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No folders here
                </p>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          {isSameLocation ? (
            <p className="flex-1 text-xs text-muted-foreground">
              Items are already in this folder.
            </p>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            icon={FolderInput}
            disabled={!canMoveHere || moveObjects.isPending}
            loading={moveObjects.isPending}
            onClick={() => moveObjects.mutate({ items, destination })}
          >
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type FolderRowProps = {
  icon: typeof Folder;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

const FolderRow = ({ icon: Icon, label, disabled, onClick }: FolderRowProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
      disabled
        ? "cursor-not-allowed opacity-40"
        : "hover:bg-accent hover:text-accent-foreground"
    )}
  >
    <Icon size={16} className="shrink-0 text-muted-foreground" />
    <span className="truncate">{label}</span>
  </button>
);

export default MoveDialog;

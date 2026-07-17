import Button from "@/components/ui/button";
import { FolderInput, Share2, Trash, X } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useBucketContext } from "../context";
import { useDeleteObjects } from "./hooks";
import { shareDialog } from "./share-dialog";
import MoveDialog from "./move-dialog";

type Props = {
  selected: string[];
  prefix: string;
  onClear: () => void;
};

const BulkActions = ({ selected, prefix, onClear }: Props) => {
  const { bucketName } = useBucketContext();
  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);

  const files = selected.filter((key) => !key.endsWith("/"));
  const folders = selected.filter((key) => key.endsWith("/"));

  const deleteObjects = useDeleteObjects(bucketName, {
    onSuccess: () => {
      toast.success(`Deleted ${selected.length} item(s)!`);
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
      onClear();
    },
    onError: handleError,
  });

  const onDelete = () => {
    const detail = [
      files.length ? `${files.length} file(s)` : null,
      folders.length ? `${folders.length} folder(s) and their contents` : null,
    ]
      .filter(Boolean)
      .join(" and ");

    if (window.confirm(`Are you sure you want to delete ${detail}?`)) {
      deleteObjects.mutate(selected);
    }
  };

  if (!selected.length) {
    return null;
  }

  return (
    <>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          icon={X}
          aria-label="Clear selection"
          onClick={onClear}
          className="h-7 w-7"
        />
        <p className="flex-1 text-sm font-medium">
          {selected.length} selected
        </p>

        <Button
          variant="outline"
          size="sm"
          icon={FolderInput}
          onClick={() => setMoveOpen(true)}
        >
          Move
        </Button>

        <Button
          variant="outline"
          size="sm"
          icon={Share2}
          disabled={!files.length}
          title={!files.length ? "Select at least one file to share" : undefined}
          onClick={() => shareDialog.open({ keys: files })}
        >
          Share
        </Button>

        <Button
          variant="destructive"
          size="sm"
          icon={Trash}
          loading={deleteObjects.isPending}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        items={selected}
        currentPrefix={prefix}
        onMoved={onClear}
      />
    </>
  );
};

export default BulkActions;

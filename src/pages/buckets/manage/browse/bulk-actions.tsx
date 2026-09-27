import Button from "@/components/ui/button";
import { FolderInput, Share2, Trash, X } from "lucide-react";
import { useBrowseContext } from "./browse-context";
import { shareDialog } from "./share-dialog";

type Props = {
  selected: string[];
  onClear: () => void;
};

const BulkActions = ({ selected, onClear }: Props) => {
  const browse = useBrowseContext();
  const files = selected.filter((key) => !key.endsWith("/"));

  if (!selected.length) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        icon={X}
        aria-label="Clear selection"
        onClick={onClear}
        className="h-7 w-7"
      />
      <p className="flex-1 text-sm font-medium">{selected.length} selected</p>

      <Button
        variant="outline"
        size="sm"
        icon={FolderInput}
        onClick={() => browse.openMove(selected)}
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
        loading={browse.isDeleting}
        onClick={() => browse.deleteKeys(selected)}
      >
        Delete
      </Button>
    </div>
  );
};

export default BulkActions;

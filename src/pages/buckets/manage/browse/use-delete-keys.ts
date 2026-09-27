import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { handleError } from "@/lib/utils";
import { useBucketContext } from "../context";
import { useDeleteObjects } from "./hooks";
import { describeKeys, keyName } from "./browse-utils";

/** Asks for confirmation, then deletes the keys (folders recursively).
 * `onDeleted` runs after a successful delete. */
export const useDeleteKeys = (onDeleted: (keys: string[]) => void) => {
  const { bucketName } = useBucketContext();
  const queryClient = useQueryClient();
  const deleteObjects = useDeleteObjects(bucketName);

  const run = async (keys: string[]) => {
    if (!keys.length) return false;

    const ok = await confirmDialog({
      title:
        keys.length === 1
          ? `Delete ${keys[0].endsWith("/") ? "folder" : "file"}?`
          : `Delete ${keys.length} items?`,
      description: `This permanently deletes ${describeKeys(keys)}. This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return false;

    try {
      await deleteObjects.mutateAsync(keys);
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      // Refresh even after a partial failure so the list matches reality.
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
    }

    toast.success(
      keys.length === 1 ? `Deleted "${keyName(keys[0])}"` : `Deleted ${keys.length} items`
    );
    onDeleted(keys);
    return true;
  };

  return { run, isPending: deleteObjects.isPending };
};

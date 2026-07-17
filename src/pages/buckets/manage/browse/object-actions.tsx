import { Object } from "./types";
import Button from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DownloadIcon, EllipsisVertical, Share2, Trash } from "lucide-react";
import { useDeleteObject } from "./hooks";
import { useBucketContext } from "../context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import { shareDialog } from "./share-dialog";

type Props = {
  prefix?: string;
  object: Pick<Object, "objectKey" | "url">;
  end?: boolean;
};

const ObjectActions = ({ prefix = "", object }: Props) => {
  const { bucketName } = useBucketContext();
  const queryClient = useQueryClient();
  const isDirectory = object.objectKey.endsWith("/");

  const deleteObject = useDeleteObject(bucketName, {
    onSuccess: () => {
      toast.success("Object deleted!");
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
    },
    onError: handleError,
  });

  const onDownload = () => {
    window.open(API_URL + object.url + "?dl=1", "_blank");
  };

  const onDelete = () => {
    if (
      window.confirm(
        `Are you sure you want to delete this ${
          isDirectory ? "directory and its content" : "object"
        }?`
      )
    ) {
      deleteObject.mutate({
        key: prefix + object.objectKey,
        recursive: isDirectory,
      });
    }
  };

  return (
    <td className="w-auto !p-0">
      <span className="flex w-full flex-row justify-end gap-1 pr-2">
        {!isDirectory && (
          <Button
            icon={DownloadIcon}
            variant="ghost"
            size="icon"
            onClick={onDownload}
          />
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={EllipsisVertical} variant="ghost" size="icon" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                shareDialog.open({ keys: [prefix + object.objectKey] })
              }
            >
              <Share2 /> Share
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              <Trash /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </td>
  );
};

export default ObjectActions;

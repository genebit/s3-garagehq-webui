import {
  Download,
  ExternalLink,
  Eye,
  FolderInput,
  FolderOpen,
  LucideIcon,
  PencilLine,
  Share2,
  Trash,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useBucketContext } from "../context";
import { useBrowseContext } from "./browse-context";
import { objectPath } from "./browse-utils";
import { shareDialog } from "./share-dialog";

/** What a menu acts on: one row, or the current multi-selection. */
export type MenuTarget =
  | { kind: "entry"; key: string }
  | { kind: "selection"; keys: string[] };

export type MenuItemSpec = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

/** Actions shared by the ⋯ row menu and the right-click menu. */
export const useObjectMenuItems = (target: MenuTarget): MenuItemSpec[] => {
  const { bucketName } = useBucketContext();
  const browse = useBrowseContext();

  if (target.kind === "selection") {
    const { keys } = target;
    const files = keys.filter((k) => !k.endsWith("/"));
    return [
      {
        id: "share",
        label: `Share ${files.length} file${files.length === 1 ? "" : "s"}`,
        icon: Share2,
        disabled: !files.length,
        onSelect: () => shareDialog.open({ keys: files }),
      },
      {
        id: "move",
        label: `Move ${keys.length} items`,
        icon: FolderInput,
        onSelect: () => browse.openMove(keys),
      },
      {
        id: "delete",
        label: `Delete ${keys.length} items`,
        icon: Trash,
        destructive: true,
        separatorBefore: true,
        onSelect: () => browse.deleteKeys(keys),
      },
    ];
  }

  const { key } = target;
  const rename: MenuItemSpec = {
    id: "rename",
    label: "Rename",
    icon: PencilLine,
    separatorBefore: true,
    onSelect: () => browse.openRename(key),
  };
  const move: MenuItemSpec = {
    id: "move",
    label: "Move",
    icon: FolderInput,
    onSelect: () => browse.openMove([key]),
  };
  const remove: MenuItemSpec = {
    id: "delete",
    label: "Delete",
    icon: Trash,
    destructive: true,
    separatorBefore: true,
    onSelect: () => browse.deleteKeys([key]),
  };

  if (key.endsWith("/")) {
    return [
      { id: "open", label: "Open", icon: FolderOpen, onSelect: () => browse.openFolder(key) },
      rename,
      move,
      remove,
    ];
  }

  const url = API_URL + objectPath(bucketName, key);
  return [
    { id: "preview", label: "Preview", icon: Eye, onSelect: () => browse.openPreview(key) },
    {
      id: "open-tab",
      label: "Open in new tab",
      icon: ExternalLink,
      onSelect: () => window.open(url + "?view=1", "_blank"),
    },
    {
      id: "download",
      label: "Download",
      icon: Download,
      onSelect: () => window.open(url + "?dl=1", "_blank"),
    },
    rename,
    {
      id: "share",
      label: "Share",
      icon: Share2,
      onSelect: () => shareDialog.open({ keys: [key] }),
    },
    move,
    remove,
  ];
};

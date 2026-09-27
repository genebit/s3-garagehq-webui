import { useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { PanelRightClose, PanelRightOpen, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import Button from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readDataTransferItems } from "@/lib/file-drop";
import { uploadStore } from "@/stores/upload-store";
import appStore from "@/stores/app-store";
import { useDebounce } from "@/hooks/useDebounce";
import { useFillHeight } from "@/hooks/useFillHeight";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useBucketContext } from "../context";
import Actions from "./actions";
import { BrowseContext, BrowseContextValue } from "./browse-context";
import BulkActions from "./bulk-actions";
import MoveDialog from "./move-dialog";
import ObjectList from "./object-list";
import ObjectListNavigator from "./object-list-navigator";
import PreviewPane from "./preview-pane";
import RenameDialog from "./rename-dialog";
import SearchBox from "./search-box";
import ShareDialog from "./share-dialog";
import { useDeleteKeys } from "./use-delete-keys";

const getInitialPrefixes = (searchParams: URLSearchParams) => {
  const prefix = searchParams.get("prefix");
  if (prefix) {
    const paths = prefix.split("/").filter((p) => p);
    return paths.map((_, i) => paths.slice(0, i + 1).join("/") + "/");
  }
  return [];
};

/** True when `key` is one of `keys`, or inside one of the folders in `keys`. */
const isCovered = (key: string, keys: string[]) =>
  keys.some((k) => key === k || (k.endsWith("/") && key.startsWith(k)));

const BrowseTab = () => {
  const { bucket, bucketName } = useBucketContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prefixHistory, setPrefixHistory] = useState<string[]>(
    getInitialPrefixes(searchParams)
  );
  const [curPrefix, setCurPrefix] = useState(prefixHistory.length - 1);
  const [selected, setSelected] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [moveKeys, setMoveKeys] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const areaRef = useRef<HTMLDivElement>(null);

  const height = useFillHeight(areaRef);
  const isWide = useMediaQuery("(min-width: 1280px)");
  const paneCollapsed = useStore(appStore, (s) => s.browsePaneCollapsed);
  const applySearch = useDebounce(setSearch, 300);

  const prefix = prefixHistory[curPrefix] || "";

  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("prefix", prefix);
    setSearchParams(newParams);
    setSelected([]);
    setSearchInput("");
    setSearch("");
    setPreviewKey(null);
  }, [curPrefix]);

  // Esc closes the floating details pane.
  useEffect(() => {
    if (isWide || !previewKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWide, previewKey]);

  const deleteKeys = useDeleteKeys((keys) => {
    setSelected((s) => s.filter((k) => !isCovered(k, keys)));
    setPreviewKey((k) => (k && isCovered(k, keys) ? null : k));
  });

  const onRenamed = (oldKey: string, newKey: string) => {
    setSelected((s) => s.filter((k) => !isCovered(k, [oldKey])));
    // Keep the pane on the renamed file (or the same file in a renamed folder).
    setPreviewKey((k) =>
      k && isCovered(k, [oldKey]) ? newKey + k.slice(oldKey.length) : k
    );
  };

  const gotoPrefix = (prefix: string) => {
    const history = prefixHistory.slice(0, curPrefix + 1);
    setPrefixHistory([...history, prefix]);
    setCurPrefix(history.length);
  };

  const openPreview = (key: string) => {
    setPreviewKey(key);
    if (isWide && paneCollapsed) appStore.setBrowsePaneCollapsed(false);
  };

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (!value.trim()) {
      setSearch("");
    } else {
      applySearch(value.trim());
    }
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDragging(true);
  };

  const onDragLeave = () => {
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);

    let items;
    try {
      items = await readDataTransferItems(e.dataTransfer);
    } catch (err) {
      console.error("Cannot read dropped files:", err);
      toast.error("Couldn't read the dropped files.", {
        description: "Please try again, or use the upload buttons instead.",
      });
      return;
    }
    if (!items.length) return;

    uploadStore.enqueue(
      items.map((it) => ({
        bucket: bucketName,
        key: prefix + it.path,
        file: it.file,
      }))
    );
  };

  if (!bucket.keys.find((k) => k.permissions.read && k.permissions.write)) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center p-4">
        <p className="max-w-sm text-center">
          You need to add a key with read &amp; write access to your bucket to be
          able to browse it.
        </p>
      </div>
    );
  }

  const browseContext: BrowseContextValue = {
    prefix,
    previewKey,
    openFolder: gotoPrefix,
    openPreview,
    openRename: setRenameKey,
    openMove: setMoveKeys,
    deleteKeys: deleteKeys.run,
    isDeleting: deleteKeys.isPending,
  };

  return (
    <BrowseContext.Provider value={browseContext}>
      <div ref={areaRef} className="relative flex gap-4" style={{ height }}>
        <div
          className="relative flex min-w-0 flex-1 flex-col"
          onDragEnter={onDragEnter}
          onDragOver={(e) => {
            if (dragging) e.preventDefault();
          }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ObjectListNavigator
              curPrefix={curPrefix}
              setCurPrefix={setCurPrefix}
              prefixHistory={prefixHistory}
              search={<SearchBox value={searchInput} onChange={onSearchChange} />}
              actions={
                <>
                  <Actions prefix={prefix} />
                  {isWide ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      icon={paneCollapsed ? PanelRightOpen : PanelRightClose}
                      aria-label={paneCollapsed ? "Show details" : "Hide details"}
                      title={paneCollapsed ? "Show details" : "Hide details"}
                      onClick={() => appStore.setBrowsePaneCollapsed(!paneCollapsed)}
                    />
                  ) : null}
                </>
              }
            />

            <BulkActions selected={selected} onClear={() => setSelected([])} />

            <ObjectList
              key={`${prefix}\u0000${search}`}
              search={search}
              selected={selected}
              onSelectedChange={setSelected}
            />
          </Card>

          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm transition-opacity",
              dragging ? "opacity-100" : "opacity-0"
            )}
          >
            <div className="flex flex-col items-center gap-2 text-primary">
              <UploadCloud size={40} />
              <p className="text-sm font-medium">Drop files or folders to upload</p>
              {prefix ? (
                <p className="text-xs text-muted-foreground">into /{prefix}</p>
              ) : null}
            </div>
          </div>
        </div>

        {isWide && !paneCollapsed ? (
          <PreviewPane
            objectKey={previewKey}
            floating={false}
            onClose={() => appStore.setBrowsePaneCollapsed(true)}
          />
        ) : null}
        {!isWide && previewKey ? (
          <PreviewPane
            objectKey={previewKey}
            floating
            onClose={() => setPreviewKey(null)}
          />
        ) : null}
      </div>

      <ShareDialog />
      <RenameDialog
        objectKey={renameKey}
        onClose={() => setRenameKey(null)}
        onRenamed={onRenamed}
      />
      <MoveDialog
        open={!!moveKeys}
        onOpenChange={(open) => !open && setMoveKeys(null)}
        items={moveKeys || []}
        currentPrefix={prefix}
        onMoved={() => setSelected([])}
      />
    </BrowseContext.Provider>
  );
};

export default BrowseTab;

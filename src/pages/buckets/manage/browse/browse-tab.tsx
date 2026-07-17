import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";

import ObjectList from "./object-list";
import { useEffect, useRef, useState } from "react";
import ObjectListNavigator from "./object-list-navigator";
import Actions from "./actions";
import { useBucketContext } from "../context";
import ShareDialog from "./share-dialog";
import BulkActions from "./bulk-actions";
import { readDataTransferItems } from "@/lib/file-drop";
import { uploadStore } from "@/stores/upload-store";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

const getInitialPrefixes = (searchParams: URLSearchParams) => {
  const prefix = searchParams.get("prefix");
  if (prefix) {
    const paths = prefix.split("/").filter((p) => p);
    return paths.map((_, i) => paths.slice(0, i + 1).join("/") + "/");
  }
  return [];
};

const BrowseTab = () => {
  const { bucket, bucketName } = useBucketContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prefixHistory, setPrefixHistory] = useState<string[]>(
    getInitialPrefixes(searchParams)
  );
  const [curPrefix, setCurPrefix] = useState(prefixHistory.length - 1);
  const [selected, setSelected] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const prefix = prefixHistory[curPrefix] || "";

  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("prefix", prefix);
    setSearchParams(newParams);
    setSelected([]);
  }, [curPrefix]);

  const gotoPrefix = (prefix: string) => {
    const history = prefixHistory.slice(0, curPrefix + 1);
    setPrefixHistory([...history, prefix]);
    setCurPrefix(history.length);
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

    const items = await readDataTransferItems(e.dataTransfer);
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

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (dragging) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Card className="relative overflow-hidden pb-2">
        <ObjectListNavigator
          curPrefix={curPrefix}
          setCurPrefix={setCurPrefix}
          prefixHistory={prefixHistory}
          actions={<Actions prefix={prefix} />}
        />

        <BulkActions
          selected={selected}
          prefix={prefix}
          onClear={() => setSelected([])}
        />

        <ObjectList
          prefix={prefix}
          onPrefixChange={gotoPrefix}
          selected={selected}
          onSelectedChange={setSelected}
        />

        <ShareDialog />

        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm transition-opacity",
            dragging ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex flex-col items-center gap-2 text-primary">
            <UploadCloud size={40} />
            <p className="text-sm font-medium">
              Drop files or folders to upload
            </p>
            {prefix ? (
              <p className="text-xs text-muted-foreground">into /{prefix}</p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BrowseTab;

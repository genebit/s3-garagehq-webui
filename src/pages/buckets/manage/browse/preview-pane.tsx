import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  MousePointerClick,
  PanelRightClose,
  PencilLine,
  Share2,
  Trash,
  X,
} from "lucide-react";
import Button from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { cn, dayjs, readableBytes } from "@/lib/utils";
import { useBucketContext } from "../context";
import { useBrowseContext } from "./browse-context";
import { keyName, objectPath, PreviewKind, previewKind } from "./browse-utils";
import FileTypeIcon from "./file-type-icon";
import { useObjectInfo, useTextPreview } from "./hooks";
import { shareDialog } from "./share-dialog";

type Props = {
  /** File shown in the pane; null shows the empty state. */
  objectKey: string | null;
  /** Floating overlay (narrow screens) instead of a docked column. */
  floating: boolean;
  onClose: () => void;
};

const PreviewPane = ({ objectKey, floating, onClose }: Props) => {
  const { bucketName } = useBucketContext();
  const browse = useBrowseContext();
  const info = useObjectInfo(bucketName, objectKey);

  const name = objectKey ? keyName(objectKey) : "";
  const url = objectKey ? API_URL + objectPath(bucketName, objectKey) : "";
  const size = info.data?.ContentLength;
  // Object responses are cached for a day, so key the view URL on the ETag:
  // a file that was overwritten gets a fresh URL instead of the old copy.
  const etag = info.data?.ETag?.replace(/"/g, "");
  const viewUrl = url + "?view=1" + (etag ? `&v=${encodeURIComponent(etag)}` : "");
  const kind = previewKind(name, info.data?.ContentType, size);

  return (
    <aside
      aria-label="File details"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
        floating
          ? "absolute inset-y-0 right-0 z-30 w-[min(380px,100%)] shadow-2xl animate-in slide-in-from-right-8"
          : "w-[380px] shrink-0"
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={name}>
          {objectKey ? name : "Details"}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          icon={floating ? X : PanelRightClose}
          aria-label={floating ? "Close details" : "Hide details"}
          title={floating ? "Close" : "Hide details"}
          onClick={onClose}
        />
      </header>

      {!objectKey ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <MousePointerClick size={28} />
          Select a file to see its preview and details.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex h-64 items-center justify-center border-b bg-muted/30 p-3">
            {info.isLoading ? (
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            ) : (
              <PreviewContent
                kind={info.error ? "none" : kind}
                url={viewUrl}
                name={name}
                etag={info.data?.ETag}
              />
            )}
          </div>

          {info.error ? (
            <p className="p-4 text-sm text-destructive">
              {info.error.status === 404
                ? "This file no longer exists."
                : info.error.message}
            </p>
          ) : info.data ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm">
              <Detail label="Size">
                {size != null
                  ? `${readableBytes(size)} (${size.toLocaleString()} bytes)`
                  : "—"}
              </Detail>
              <Detail label="Type">{info.data.ContentType || "Unknown"}</Detail>
              <Detail label="Modified">
                {info.data.LastModified
                  ? `${dayjs(info.data.LastModified).format("YYYY-MM-DD HH:mm")} (${dayjs(info.data.LastModified).fromNow()})`
                  : "—"}
              </Detail>
              <Detail label="Path">{objectKey}</Detail>
              <Detail label="ETag">
                {etag || "—"}
              </Detail>
            </dl>
          ) : null}

          <div className="grid grid-cols-2 gap-2 border-t p-4">
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={() => window.open(url + "?dl=1", "_blank")}
            >
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={ExternalLink}
              onClick={() => window.open(viewUrl, "_blank")}
            >
              Open in new tab
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Share2}
              onClick={() => shareDialog.open({ keys: [objectKey] })}
            >
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={PencilLine}
              onClick={() => browse.openRename(objectKey)}
            >
              Rename
            </Button>
            <Button
              variant="destructive"
              size="sm"
              icon={Trash}
              className="col-span-2"
              onClick={() => browse.deleteKeys([objectKey])}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
};

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-all">{children}</dd>
  </>
);

type PreviewContentProps = {
  kind: PreviewKind;
  url: string;
  name: string;
  etag?: string;
};

const PreviewContent = ({ kind, url, name, etag }: PreviewContentProps) => {
  const [failed, setFailed] = useState(false);
  const text = useTextPreview(kind === "text" ? url : null, etag);

  useEffect(() => setFailed(false), [url]);

  const icon = (
    <FileTypeIcon name={name} size={72} strokeWidth={1.25} className="text-muted-foreground" />
  );
  if (failed || kind === "none") return icon;

  switch (kind) {
    case "image":
      return (
        <img
          src={url}
          alt={name}
          className="max-h-full max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      );
    case "video":
      return (
        <video
          src={url}
          controls
          className="max-h-full max-w-full"
          onError={() => setFailed(true)}
        />
      );
    case "audio":
      return (
        <audio src={url} controls className="w-full" onError={() => setFailed(true)} />
      );
    case "pdf":
      return <iframe src={url} title={name} className="h-full w-full rounded border bg-white" />;
    case "text":
      if (text.isLoading) {
        return <Loader2 size={24} className="animate-spin text-muted-foreground" />;
      }
      if (text.error) return icon;
      return (
        <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-xs">
          {text.data}
        </pre>
      );
  }
};

export default PreviewPane;

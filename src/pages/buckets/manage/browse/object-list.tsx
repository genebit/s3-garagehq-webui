import { useBrowseObjects } from "./hooks";
import { dayjs, readableBytes } from "@/lib/utils";
import mime from "mime/lite";
import { Object } from "./types";
import { API_URL } from "@/lib/api";
import {
  CircleXIcon,
  FileArchive,
  FileIcon,
  FileType,
  Folder,
  Loader2,
} from "lucide-react";
import { useBucketContext } from "../context";
import ObjectActions from "./object-actions";
import GotoTopButton from "@/components/ui/goto-top-btn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  prefix?: string;
  onPrefixChange?: (prefix: string) => void;
  selected?: string[];
  onSelectedChange?: (keys: string[]) => void;
};

const ObjectList = ({
  prefix,
  onPrefixChange,
  selected = [],
  onSelectedChange,
}: Props) => {
  const { bucketName } = useBucketContext();
  const { data, error, isLoading } = useBrowseObjects(bucketName, {
    prefix,
    limit: 1000,
  });

  const onObjectClick = (object: Object) => {
    window.open(API_URL + object.url + "?view=1", "_blank");
  };

  // Full keys of every row: folders keep their trailing "/".
  const allKeys = [
    ...(data?.prefixes || []),
    ...(data?.objects || []).map((o) => (data?.prefix || "") + o.objectKey),
  ];
  const allSelected = allKeys.length > 0 && selected.length === allKeys.length;

  const toggleAll = () => {
    onSelectedChange?.(allSelected ? [] : allKeys);
  };

  const toggleOne = (key: string) => {
    onSelectedChange?.(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key]
    );
  };

  return (
    <div className="min-h-[400px] overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Select all"
                className="h-4 w-4 cursor-pointer rounded border-input accent-primary align-middle"
                checked={allSelected}
                onChange={toggleAll}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Last Modified</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <tr>
              <td colSpan={5}>
                <div className="flex h-[320px] items-center justify-center">
                  <Loader2
                    size={28}
                    className="animate-spin text-muted-foreground"
                  />
                </div>
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={5} className="p-4">
                <Alert variant="destructive">
                  <CircleXIcon />
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              </td>
            </tr>
          ) : !data?.prefixes?.length && !data?.objects?.length ? (
            <tr>
              <td
                className="py-16 text-center text-muted-foreground"
                colSpan={5}
              >
                No objects
              </td>
            </tr>
          ) : null}

          {data?.prefixes.map((prefix) => (
            <TableRow key={prefix} className="group">
              <td className="w-10 p-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${prefix}`}
                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary align-middle"
                  checked={selected.includes(prefix)}
                  onChange={() => toggleOne(prefix)}
                />
              </td>
              <td
                className="cursor-pointer p-3"
                role="button"
                onClick={() => onPrefixChange?.(prefix)}
              >
                <span className="flex items-center gap-2 font-normal">
                  <Folder size={20} className="text-muted-foreground" />
                  {prefix
                    .substring(0, prefix.lastIndexOf("/"))
                    .split("/")
                    .pop()}
                </span>
              </td>
              <td colSpan={2} />
              <ObjectActions object={{ objectKey: prefix, url: "" }} />
            </TableRow>
          ))}

          {data?.objects.map((object) => {
            const extIdx = object.objectKey.lastIndexOf(".");
            const filename =
              extIdx >= 0
                ? object.objectKey.substring(0, extIdx)
                : object.objectKey;
            const ext = extIdx >= 0 ? object.objectKey.substring(extIdx) : null;

            const fullKey = (data?.prefix || "") + object.objectKey;

            return (
              <TableRow key={object.objectKey} className="group">
                <td className="w-10 p-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${object.objectKey}`}
                    className="h-4 w-4 cursor-pointer rounded border-input accent-primary align-middle"
                    checked={selected.includes(fullKey)}
                    onChange={() => toggleOne(fullKey)}
                  />
                </td>
                <td
                  className="cursor-pointer p-3"
                  role="button"
                  onClick={() => onObjectClick(object)}
                >
                  <span className="flex w-full items-center font-normal">
                    <FilePreview ext={ext?.substring(1)} object={object} />
                    <span className="max-w-[40vw] truncate">{filename}</span>
                    {ext && (
                      <span className="text-muted-foreground">{ext}</span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap p-3">
                  {readableBytes(object.size)}
                </td>
                <td className="whitespace-nowrap p-3">
                  {dayjs(object.lastModified).fromNow()}
                </td>
                <ObjectActions prefix={data.prefix} object={object} />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <GotoTopButton />
    </div>
  );
};

type FilePreviewProps = {
  ext?: string | null;
  object: Object;
};

const FilePreview = ({ ext, object }: FilePreviewProps) => {
  const type = mime.getType(ext || "")?.split("/")[0];
  let Icon = FileIcon;

  if (
    ["zip", "rar", "7z", "iso", "tar", "gz", "bz2", "xz"].includes(ext || "")
  ) {
    Icon = FileArchive;
  }

  if (type === "image") {
    const thumbnailSupport = ["jpg", "jpeg", "png", "gif"].includes(ext || "");
    return (
      <img
        src={API_URL + object.url + (thumbnailSupport ? "?thumb=1" : "?view=1")}
        alt={object.objectKey}
        className="mr-2 size-5 overflow-hidden object-cover"
      />
    );
  }

  if (type === "text") {
    Icon = FileType;
  }

  return <Icon size={20} className="mr-2 text-muted-foreground" />;
};

export default ObjectList;

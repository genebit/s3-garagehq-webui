import mime from "mime/lite";
import {
  FileArchive,
  FileAudio,
  FileIcon,
  FileImage,
  FileText,
  FileType,
  FileVideo,
  LucideProps,
} from "lucide-react";
import { splitExtension } from "./browse-utils";

const ARCHIVE_EXTS = ["zip", "rar", "7z", "iso", "tar", "gz", "bz2", "xz"];

/** A lucide file icon matching the file's type, picked from its extension. */
const FileTypeIcon = ({ name, ...props }: { name: string } & LucideProps) => {
  const ext = splitExtension(name)[1].slice(1).toLowerCase();
  const type = mime.getType(ext)?.split("/")[0];

  const Icon = ARCHIVE_EXTS.includes(ext)
    ? FileArchive
    : ext === "pdf"
      ? FileText
      : type === "image"
        ? FileImage
        : type === "video"
          ? FileVideo
          : type === "audio"
            ? FileAudio
            : type === "text"
              ? FileType
              : FileIcon;

  return <Icon {...props} />;
};

export default FileTypeIcon;

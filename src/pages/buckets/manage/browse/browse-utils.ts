// Pure helpers for the object browser, kept free of React so they can be
// unit tested.

/** Splits "photo.final.jpg" into ["photo.final", ".jpg"]. Dotfiles (".env")
 * and names without a dot have no extension. */
export const splitExtension = (name: string): [string, string] => {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return [name, ""];
  return [name.slice(0, idx), name.slice(idx)];
};

/** Display name of an object key: its last segment, without a folder's
 * trailing "/". */
export const keyName = (key: string) => {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
};

/** API path of an object, with every key segment percent-encoded so names
 * containing "#", "?" or "%" reach the right object. */
export const objectPath = (bucket: string, key: string) =>
  `/browse/${encodeURIComponent(bucket)}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

/** Text previews only load files under this size... */
const TEXT_PREVIEW_MAX_SIZE = 1024 * 1024;
/** ...and only their first 256 KB. */
export const TEXT_PREVIEW_BYTES = 256 * 1024;

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];
const VIDEO_EXTS = ["mp4", "webm", "ogv", "mov", "m4v"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac"];
const TEXT_EXTS = [
  "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "xml", "log",
  "ini", "toml", "conf", "env", "sh", "js", "ts", "tsx", "jsx", "py", "go",
  "rs", "java", "c", "h", "cpp", "css", "html", "sql",
];

/** How the details pane can preview a file. */
export const previewKind = (
  name: string,
  contentType?: string | null,
  size?: number | null
): PreviewKind => {
  const ext = splitExtension(name)[1].slice(1).toLowerCase();
  const type = contentType?.split(";")[0].trim().toLowerCase() || "";

  if (type.startsWith("image/") || IMAGE_EXTS.includes(ext)) return "image";
  if (type.startsWith("video/") || VIDEO_EXTS.includes(ext)) return "video";
  if (type.startsWith("audio/") || AUDIO_EXTS.includes(ext)) return "audio";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("text/") || type === "application/json" || TEXT_EXTS.includes(ext)) {
    return size != null && size >= TEXT_PREVIEW_MAX_SIZE ? "none" : "text";
  }
  return "none";
};

/** Applies a shift-click from `anchor` to `target` over the rows in display
 * order: every row in the inclusive range takes the target's new state.
 * `changed` lists the rows whose state changed, from the anchor outward. */
export const selectRange = (
  rows: string[],
  selected: string[],
  anchor: string,
  target: string,
  checked: boolean
): { selected: string[]; changed: string[] } => {
  const set = new Set(selected);
  const from = rows.indexOf(anchor);
  const to = rows.indexOf(target);

  if (from < 0 || to < 0) {
    if (checked) set.add(target);
    else set.delete(target);
    return { selected: [...set], changed: [target] };
  }

  const range = rows.slice(Math.min(from, to), Math.max(from, to) + 1);
  const changed = range.filter((key) => set.has(key) !== checked);
  for (const key of range) {
    if (checked) set.add(key);
    else set.delete(key);
  }
  return {
    selected: [...set],
    changed: from <= to ? changed : changed.reverse(),
  };
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Human description of keys about to be deleted. */
export const describeKeys = (keys: string[]) => {
  if (keys.length === 1) {
    const [key] = keys;
    return key.endsWith("/")
      ? `the folder "${keyName(key)}" and everything in it`
      : `"${keyName(key)}"`;
  }
  const folders = keys.filter((k) => k.endsWith("/")).length;
  const files = keys.length - folders;
  return [
    files ? plural(files, "file") : null,
    folders
      ? `${plural(folders, "folder")} and everything in ${folders === 1 ? "it" : "them"}`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");
};

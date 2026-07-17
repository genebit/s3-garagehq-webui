// Reads a drag-and-drop DataTransfer into a flat list of files with their
// relative paths, recursing into dropped folders (including nested ones).
// Directory entries are emitted with a trailing "/" and a null file so an
// explicit folder marker can be created for empty folders.

export type DroppedItem = { path: string; file: File | null };

export async function readDataTransferItems(
  dt: DataTransfer
): Promise<DroppedItem[]> {
  // webkitGetAsEntry() must be called synchronously, before any await, because
  // the DataTransferItemList is only valid during the drop event.
  const entries: any[] = [];
  const items = dt.items;
  if (items && items.length && (items[0] as any).webkitGetAsEntry) {
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as any).webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
  }

  if (!entries.length) {
    // Fallback for browsers without the entries API: flat file list only.
    return Array.from(dt.files).map((file) => ({ path: file.name, file }));
  }

  const results: DroppedItem[] = [];
  for (const entry of entries) {
    await traverseEntry(entry, "", results);
  }
  return results;
}

function traverseEntry(
  entry: any,
  prefix: string,
  out: DroppedItem[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      entry.file((file: File) => {
        out.push({ path: prefix + entry.name, file });
        resolve();
      }, reject);
      return;
    }

    if (entry.isDirectory) {
      const dirPath = prefix + entry.name + "/";
      out.push({ path: dirPath, file: null });

      const reader = entry.createReader();
      // readEntries returns at most 100 entries per call, so keep reading
      // until an empty batch signals the end of the directory.
      const readBatch = () => {
        reader.readEntries(async (batch: any[]) => {
          if (!batch.length) {
            resolve();
            return;
          }
          for (const child of batch) {
            await traverseEntry(child, dirPath, out);
          }
          readBatch();
        }, reject);
      };
      readBatch();
      return;
    }

    resolve();
  });
}

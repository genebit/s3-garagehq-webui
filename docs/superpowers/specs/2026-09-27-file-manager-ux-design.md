# File manager UX — design

Date: 2026-09-27 · Branch: `feat/file-manager-ux`

## Goal

Make the bucket **Browse** tab work like a real file manager: find files quickly, act on them from a
right-click menu, see a file's preview and details without leaving the page, and select ranges of
rows. Fix the share dialog that closes immediately when opened from a row menu in Zen (Firefox).

Must keep working for developers on their assigned buckets, on narrow screens, and on folders with
tens of thousands of objects.

## Scope

1. Search bar (current folder, all pages).
2. Right-click context menu on rows, sharing its actions with the existing ⋯ row menu.
3. Rename (files and folders), delete, and share from those menus.
4. An in-app confirmation dialog replacing every `window.confirm` in the app.
5. Pinned toolbar/column header at the top and pinned pagination bar at the bottom.
6. Shift-click range selection with a highlight animation.
7. A preview and details pane replacing the "open in new tab" click on files.
8. Bug: share dialog opened from a row's ⋯ menu closes immediately in Zen/Firefox.

Out of scope: overwrite prompts on upload, search across subfolders or the whole bucket, keyboard
shortcuts beyond shift-click.

## 1. Layout

- The bucket manage page (`src/pages/buckets/manage/page.tsx`) drops its `container` max-width so
  the Browse tab uses the full page width, removing the unused whitespace on the right.
- The Browse card becomes a fixed-height flex column that fills the rest of the viewport: its height
  is `100dvh` minus its own top offset (measured on mount and on resize), minus the main area's
  bottom padding, with a 480 px minimum. Only the object list scrolls.
- Top block, always visible: folder navigator + search box + upload actions, the "N selected" bulk
  bar, and the table column header (`sticky top-0` inside the scroll area).
- Bottom block, always visible: the pagination bar (item range + Prev / Page N / Next).
- The drag-and-drop overlay keeps covering the whole card.

## 2. Search

- **UI:** a search input in the navigator row (`Search this folder…`), debounced 300 ms with the
  existing `useDebounce`. A clear (✕) button empties it. Changing folder clears the search. While a
  search is active, results replace the normal listing and a caption reads `Results for "term"`.
- **Matching:** case-insensitive substring on the entry's own name (the key minus the current
  prefix), across the entire current folder — files and immediate subfolders, not nested contents.
- **API:** `GET /browse/{bucket}?prefix=…&search=term&limit=50&next=…`. When `search` is non-empty
  the backend lists every entry directly under `prefix` (`ListObjectsV2` with delimiter `/`, looping
  all pages), filters by name, and returns one page of results in the existing
  `BrowseObjectResult` shape. `nextToken` is an opaque offset token for search mode.
- **Performance:** the filtered result list is cached for 30 s (`utils.Cache`, key =
  bucket + prefix + lowercased term) so paging does not re-list the folder. The scan stops after
  50,000 entries; the response then sets a new `truncated: true` field and the UI shows "Results may
  be incomplete — narrow your search".
- **Permissions:** unchanged — `/browse/{bucket}` is already allowed for developers on assigned
  buckets.

## 3. Context menu and row menu

- New `src/components/ui/context-menu.tsx`: the shadcn context menu built on
  `@radix-ui/react-context-menu` (the project uses Radix, not Base UI).
- One shared item list renders in both the right-click menu and the existing ⋯ dropdown, so they
  can't drift apart.
- **File row:** Preview · Open in new tab · Download · Rename · Share · Move · Delete.
- **Folder row:** Open · Rename · Move · Delete.
- **Right-clicking a row that is part of a multi-selection:** the menu acts on the whole selection
  and shows only Share (files in the selection) · Move · Delete, labelled with the count.
- Right-clicking a row that is not selected acts on that row only and leaves the selection as is.

## 4. Rename

- **UI:** a dialog with the current name, pre-selected up to the extension for files. Validation:
  non-empty, no `/`, different from the current name.
- **API:** `PATCH /browse/{bucket}/{key...}` with body `{ "name": "new-name" }`. The new key is the
  same parent prefix + new name (+ `/` for folders).
  - `409 Conflict` if an object (file) or any object under the prefix (folder) already exists at
    the new key — renames never overwrite.
  - Files: copy then delete (`moveSingleObject`). Folders: `moveObjectsWithPrefix`.
  - Audit event `object_rename` with bucket, old key, new key, and moved count.
- **Large objects:** S3 caps a single `CopyObject` at 5 GiB. During implementation, test whether
  Garage enforces this. If it does, the shared copy helper switches to a multipart copy
  (`UploadPartCopy`) for objects over 5 GiB, which also fixes Move for large files.
- **Permissions:** falls under `/browse/` and is allowed for developers on assigned buckets, like
  move.

## 5. Confirmation dialog

- New `src/components/ui/confirm-dialog.tsx`: an imperative `confirm({ title, description,
  confirmText, destructive }) => Promise<boolean>` backed by a small store, with a single
  `<ConfirmDialog />` mounted in `app.tsx`.
- Destructive confirmations use a red confirm button; Esc / Cancel / backdrop resolve `false`.
- Replaces all 11 `window.confirm` call sites: object browser (row delete, bulk delete), bucket
  remove, alias remove, key remove (keys page and permissions tab), user remove, cluster
  unassign / revert / apply, and the upload panel's "cancel uploads in progress".

## 6. Shift-click range selection

- The object list remembers the last checkbox clicked (the anchor). Shift-clicking another
  checkbox sets every row between the anchor and it (inclusive, in display order) to the new state
  of the clicked row.
- Rows whose selection changed by a range click play a highlight: a primary-tinted background that
  fades out over ~600 ms, staggered ~15 ms per row from the anchor outward.
- Selected rows keep a subtle `bg-muted` background (`data-state="selected"` on `TableRow`).
- The anchor resets when the page, folder, or search changes.

## 7. Preview and details pane

- **Opening:** clicking a file row opens it in the pane (the row is highlighted as active); clicking
  a folder still opens the folder. "Open in new tab" moves to the menus and the pane.
- **Wide screens (≥ `xl`, 1280 px):** the pane is **docked** on the right of the Browse card as
  part of the layout (~380 px), and always present. With no file open it shows an empty state
  ("Select a file to see its preview and details"). It can be collapsed with a toggle; the choice is
  remembered in `app-store`.
- **Narrow screens (< `xl`):** the pane **floats** over the right side of the list as an overlay
  (with shadow, not taking layout space) and only appears when a file is opened; ✕ or Esc closes it.
- **Preview** (via the existing `?view=1` URL):

  | Type | Preview |
  |---|---|
  | Image (jpg, jpeg, png, gif, webp, avif, bmp, svg) | `<img>`, fit to the pane |
  | Video / audio | `<video>` / `<audio>` with controls |
  | PDF | `<iframe>` viewer |
  | Text, code, JSON, CSV, Markdown, YAML, logs | first 256 KB in a `<pre>`, only if the file is under 1 MB |
  | Anything else, or a preview that fails to load | a large file-type icon |

- **Details** (from the existing `GET /browse/{bucket}/{key}` HEAD response): name, full path, size
  (human-readable and bytes), content type, last modified (absolute and relative), ETag.
- **Actions:** Download · Open in new tab · Share · Rename · Delete.
- **Backend:** `GetOneObject` passes the request's `Range` header to Garage and answers `206
  Partial Content` with `Content-Range` / `Accept-Ranges`, so video and audio can seek.

## 8. Share dialog bug

- **Cause (to confirm in Firefox before fixing):** the row menu item opens the dialog while the
  dropdown is still closing; the dropdown then returns focus to its ⋯ trigger, outside the dialog.
  Dialogs are non-modal here (for react-select), so Radix treats that focus move as "focus outside"
  and dismisses the dialog. Multi-select Share opens from a plain button, so it is unaffected.
- **Fix:** `DialogContent` ignores focus-outside dismissal (`onFocusOutside` → `preventDefault`).
  Dialogs still close on Esc, ✕, and backdrop click. This also protects the new Rename and Delete
  dialogs, which open from menus the same way.

## Components and files

| Unit | Responsibility |
|---|---|
| `components/ui/context-menu.tsx` (new) | shadcn/Radix context menu primitives |
| `components/ui/confirm-dialog.tsx` (new) | imperative confirm dialog + store |
| `components/ui/dialog.tsx` | ignore focus-outside dismissal (bug fix) |
| `browse/object-menu-items.tsx` (new) | shared action list for ⋯ and right-click menus |
| `browse/rename-dialog.tsx` (new) | rename form and mutation |
| `browse/preview-pane.tsx` (new) | docked/floating pane: preview, details, actions |
| `browse/use-range-selection.ts` (new) | anchor + shift-click range logic, highlight keys |
| `browse/browse-tab.tsx`, `object-list.tsx`, `object-list-navigator.tsx` | layout, search box, pane wiring |
| `backend/router/browse.go` | `search` listing, `Rename` handler, `Range` support |
| `backend/router/router.go` | register `PATCH /browse/{bucket}/{key...}` |

## Error handling

- Search, rename, and delete failures show the existing error toast (`handleError`); rename
  conflicts show "A file or folder named X already exists".
- A preview that fails to load (network, unsupported codec) falls back to the file icon and keeps
  the details and actions usable.
- Folder rename of many objects shows a loading state on the dialog's button until the server
  responds; the listing refreshes afterwards.

## Testing

- **Go unit tests** (fake S3, extending `upload_test.go`'s server): search filtering, case
  insensitivity, paging with offset tokens, truncation flag; rename of a file, rename of a folder,
  409 on conflicts; `Range` passthrough returning 206.
- **Browser check** in Chromium **and Firefox** (Playwright) against a throwaway local Garage:
  search, context menu actions, rename, confirm dialog, shift-click range + highlight, docked pane
  at 1440 px and floating pane at 1024 px, sticky header/footer while scrolling, and the share
  dialog opened from a row menu staying open in Firefox (fails before the fix, passes after).
- `tsc -b`, `go vet`, `go test`, and ESLint not above the current 73 problems.

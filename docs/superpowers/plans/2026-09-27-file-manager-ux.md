# File Manager UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bucket Browse tab into a file manager with search, a right-click menu, rename,
in-app confirmations, pinned toolbar/pagination, shift-click range selection, and a preview/details
pane, and fix the share dialog that closes instantly when opened from a row menu in Firefox/Zen.

**Architecture:** The Go backend gains folder search (list + filter + short cache), a rename endpoint,
multipart copy for objects over 5 GiB, paginated recursive delete, and `Range` support, all behind a
small `s3API` interface so they can be unit-tested against an in-memory fake. The React Browse tab is
rebuilt around a `BrowseContext` that owns navigation, preview, rename, move and delete, with shared
menu definitions rendered by both the ⋯ dropdown and a Radix context menu.

**Tech Stack:** Go 1.23 + aws-sdk-go-v2 (s3 v1.59.0); React 18, TypeScript, Vite 5, TanStack Query 5,
Zustand 4, Radix UI, Tailwind 3; Vitest 2 (new) for pure frontend helpers; Playwright (outside the
repo) for browser verification in Chromium and Firefox.

**Spec:** `docs/superpowers/specs/2026-09-27-file-manager-ux-design.md`

**Spec deviations and additions (found while planning):**
- Objects over 5 GiB are always copied part by part (`UploadPartCopy`) instead of first probing
  whether Garage enforces the 5 GiB `CopyObject` cap — correct either way, verified in Task 11 by
  renaming a real 6 GiB file.
- Recursive folder delete only deleted the first 1,000 objects (one listing page); Task 6 fixes it.
- `GetOneObject`'s metadata branch fell through after an error; Task 6 adds the missing `return` and
  maps "not found" to 404 (the preview pane relies on it).
- Download filenames with spaces or non-ASCII characters were sent unquoted in
  `Content-Disposition`; Task 6 encodes them properly.

## Global Constraints

- Work on branch `feat/file-manager-ux`. Never push. Never commit to `main` (pushing `main`
  publishes the Docker image).
- Commit messages: `type(scope): lowercase sentence ending with a period.` — no `Co-Authored-By` or
  any other attribution trailer.
- UI primitives come from Radix (not Base UI), styled with the existing shadcn theme tokens
  (`bg-card`, `bg-popover`, `text-muted-foreground`, `border`, …).
- Page size 50; search debounce 300 ms; search scans at most 50,000 entries; search cache 30 s.
- Text previews only for files under 1 MB, showing the first 256 KB.
- Details pane 380 px wide; docked at ≥ 1280 px (`xl`), floating below.
- Range highlight 600 ms, 15 ms stagger per row. Browse card minimum height 480 px.
- New endpoints stay under `/browse/` so developer (assigned-bucket) permissions apply unchanged.
- Renames never overwrite: an existing target returns `409 Conflict`.
- Done means: `pnpm exec tsc -b` clean, `pnpm test` passes, `cd backend && go vet ./... && go test ./...`
  pass, `pnpm exec eslint .` reports **no more than 73 problems** (the current baseline).

## Review Focus

1. **Names with special characters** (`#`, `?`, `%`, spaces, parentheses, non-ASCII) in preview,
   download and rename URLs must reach the right object. → Task 7 `objectPath` test; Task 11 e2e
   previews and downloads `report #1 (final)?.txt`.
2. **Case-only rename** (`a.txt` → `A.txt`) must be allowed — S3 keys are case-sensitive, so it is not
   a conflict. → Task 5 `TestRenameFileCaseOnly`.
3. **Search terms with regex/glob characters** (`(1)`, `.`, `*`) must match literally.
   → Task 4 `TestSearchFolderTreatsTermLiterally`.
4. **Deleting or renaming the file shown in the preview pane** must close the pane or follow the new
   name — never show a stale or broken file. → Task 11 e2e steps.
5. **Deleting a folder with more than 1,000 objects** must delete all of them.
   → Task 6 `TestDeleteObjectsWithPrefixDeletesEveryPage`; Task 11 e2e deletes a 1,100-object folder.

---

### Task 1: Browser test harness (outside the repo)

A throwaway Garage + the production web UI build + Playwright with Chromium and Firefox, under
`/var/tmp/fm-e2e`. Nothing here is committed.

**Files:**
- Create: `/var/tmp/fm-e2e/setup.sh`, `/var/tmp/fm-e2e/serve.sh`, `/var/tmp/fm-e2e/seed.sh`,
  `/var/tmp/fm-e2e/teardown.sh`, `/var/tmp/fm-e2e/pw/lib.mjs`

**Interfaces:**
- Produces: web UI at `http://127.0.0.1:13909` (login `owner` / `e2e-password`), bucket alias `e2e`
  whose id is in `/var/tmp/fm-e2e/bucket_id`; `pw/lib.mjs` exports `BASE`, `BID`, `openApp(browser,
  viewport)`, `browseUrl(prefix)`, `row(page, text)`, `check(cond, msg)`. Run Playwright scripts with
  `cd /var/tmp/fm-e2e/pw && PLAYWRIGHT_BROWSERS_PATH=/var/tmp/fm-e2e/pw/browsers node <script>.mjs
  <chromium|firefox>`.

- [ ] **Step 1: Write `setup.sh` (Garage container, layout, bucket, key)**

```bash
#!/bin/bash
# Starts a single-node Garage v2.0.0 and creates bucket "e2e" with a read/write key.
set -euo pipefail
D=/var/tmp/fm-e2e
mkdir -p "$D/meta" "$D/data" "$D/webui"
cd "$D"
[ -f admin_token ] || openssl rand -hex 16 > admin_token
ADMIN=$(cat admin_token)
cat > garage.toml <<EOF
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
compression_level = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$(openssl rand -hex 32)"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.localhost"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "$ADMIN"
EOF
docker run -d --name fm-e2e-garage -p 13900:3900 -p 13903:3903 \
  -v "$D/garage.toml:/etc/garage.toml" -v "$D/meta:/var/lib/garage/meta" \
  -v "$D/data:/var/lib/garage/data" dxflrs/garage:v2.0.0 >/dev/null
H="Authorization: Bearer $ADMIN"; U=http://127.0.0.1:13903
for _ in $(seq 1 30); do curl -sf -H "$H" $U/v2/GetClusterStatus >/dev/null && break; sleep 1; done
NODE=$(curl -s -H "$H" $U/v2/GetClusterStatus | python3 -c 'import json,sys; print(json.load(sys.stdin)["nodes"][0]["id"])')
curl -sf -H "$H" -X POST $U/v2/UpdateClusterLayout \
  -d "{\"roles\":[{\"id\":\"$NODE\",\"zone\":\"dc1\",\"capacity\":100000000000,\"tags\":[]}]}" >/dev/null
curl -sf -H "$H" -X POST $U/v2/ApplyClusterLayout -d '{"version":1}' >/dev/null
BID=$(curl -sf -H "$H" -X POST $U/v2/CreateBucket -d '{"globalAlias":"e2e"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
KID=$(curl -sf -H "$H" -X POST $U/v2/CreateKey -d '{"name":"e2e-key"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessKeyId"])')
curl -sf -H "$H" -X POST $U/v2/AllowBucketKey \
  -d "{\"bucketId\":\"$BID\",\"accessKeyId\":\"$KID\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":true}}" >/dev/null
echo "$BID" > bucket_id
echo "garage ready, bucket $BID"
```

- [ ] **Step 2: Write `serve.sh` (build the repo's production binary and run it)**

```bash
#!/bin/bash
# Builds the current working tree (UI embedded) and (re)starts it on :13909.
set -euo pipefail
REPO=/home/gennux/Developer/adnu/s3-garagehq-webui
D=/var/tmp/fm-e2e
cd "$REPO"
pnpm build >/dev/null
rm -rf backend/ui/dist && cp -r dist backend/ui/dist
(cd backend && CGO_ENABLED=0 go build -o "$D/webui-bin.new" -tags=prod main.go)
pkill -x webui-bin || true
sleep 1
mv "$D/webui-bin.new" "$D/webui-bin"
cd "$D"
env CONFIG_PATH="$D/garage.toml" API_BASE_URL=http://127.0.0.1:13903 \
  S3_ENDPOINT_URL=http://127.0.0.1:13900 API_ADMIN_KEY="$(cat admin_token)" \
  USERS_PATH="$D/webui/users.json" LOGS_PATH="$D/webui/app.log" TMPDIR="$D/webui/tmp" \
  PORT=13909 HOST=127.0.0.1 nohup ./webui-bin >> webui/stdout.log 2>&1 &
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:13909/api/auth/status >/dev/null && break; sleep 0.25; done
curl -s -X POST http://127.0.0.1:13909/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"e2e-password"}' >/dev/null || true
echo "web ui ready on :13909"
```

- [ ] **Step 3: Write `seed.sh` (objects the verification scripts expect)**

```bash
#!/bin/bash
# Seeds bucket e2e: 120 files in many/, preview samples, a folder tree, and a 1,100-object folder.
# Wipes those folders first, so it can be re-run to reset state between verification runs.
set -euo pipefail
D=/var/tmp/fm-e2e; J=$D/cookies; W=http://127.0.0.1:13909/api
curl -s -c "$J" -X POST $W/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"e2e-password"}' >/dev/null
for p in many preview folders bulk large; do
  curl -s -b "$J" -X DELETE "$W/browse/e2e/$p/?recursive=true" >/dev/null || true
done
put() { # put <key> <content-type> <file>
  local enc; enc=$(python3 -c 'import sys,urllib.parse; print("/".join(urllib.parse.quote(s, safe="") for s in sys.argv[1].split("/")))' "$1")
  curl -sf -b "$J" -X PUT -H "Content-Type: $2" --data-binary @"$3" "$W/browse/e2e/$enc" >/dev/null
}
T=$(mktemp -d)
for i in $(seq -w 1 120); do echo "file $i" > "$T/f"; put "many/file-$i.txt" text/plain "$T/f"; done
python3 - "$T/photo.png" <<'EOF'
import struct, sys, zlib
w = h = 64
# One filter byte per scanline, then RGB pixels: a simple colour gradient.
raw = b"".join(b"\x00" + b"".join(bytes([x * 4 % 256, y * 4 % 256, 160]) for x in range(w)) for y in range(h))
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
open(sys.argv[1], "wb").write(png)
EOF
put "preview/photo.png" image/png "$T/photo.png"
echo "hello from notes" > "$T/notes"; put "preview/notes.txt" text/plain "$T/notes"
echo '{"ok": true}' > "$T/data"; put "preview/data.json" application/json "$T/data"
head -c 4096 /dev/urandom > "$T/zip"; put "preview/archive.zip" application/zip "$T/zip"
echo "special characters" > "$T/special"; put "preview/report #1 (final)?.txt" text/plain "$T/special"
echo "inner" > "$T/inner"; put "folders/alpha/inner.txt" text/plain "$T/inner"
put "folders/alpha/deep/leaf.txt" text/plain "$T/inner"
for i in $(seq -w 1 1100); do echo "$i" > "$T/b"; put "bulk/obj-$i.txt" text/plain "$T/b"; done
rm -rf "$T"
echo "seeded"
```

- [ ] **Step 4: Write `teardown.sh`**

```bash
#!/bin/bash
# Stops everything the harness started and removes its files and images.
D=/var/tmp/fm-e2e
pkill -x webui-bin || true
docker rm -f fm-e2e-garage >/dev/null 2>&1 || true
# Garage writes its data as root; delete it from a container.
docker run --rm -v /var/tmp:/v alpine rm -rf /v/fm-e2e >/dev/null 2>&1 || rm -rf "$D"
docker rmi alpine dxflrs/garage:v2.0.0 >/dev/null 2>&1 || true
rm -rf /home/gennux/Developer/adnu/s3-garagehq-webui/backend/ui/dist
echo "torn down"
```

- [ ] **Step 5: Write `pw/lib.mjs` and install Playwright with Chromium and Firefox**

```js
// Shared helpers for the browser verification scripts.
import { chromium, firefox } from "playwright";
import fs from "fs";

export const BASE = "http://127.0.0.1:13909";
export const BID = fs.readFileSync("/var/tmp/fm-e2e/bucket_id", "utf8").trim();

export async function openApp(browserName = "chromium", viewport = { width: 1440, height: 900 }) {
  const type = browserName === "firefox" ? firefox : chromium;
  const browser = await type.launch(browserName === "chromium" ? { args: ["--no-sandbox"] } : {});
  const ctx = await browser.newContext({ viewport });
  await ctx.request.post(BASE + "/api/auth/login", {
    data: { username: "owner", password: "e2e-password" },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, ctx, page, errors };
}

export const browseUrl = (prefix) =>
  `${BASE}/buckets/${BID}?tab=browse&prefix=${encodeURIComponent(prefix)}`;

export const row = (page, text) => page.locator("tbody tr", { hasText: text });

export function check(cond, msg) {
  if (cond) {
    console.log("ok  ", msg);
  } else {
    console.log("FAIL", msg);
    process.exitCode = 1;
  }
}
```

Run:

```bash
chmod +x /var/tmp/fm-e2e/*.sh
cd /var/tmp/fm-e2e/pw && npm init -y >/dev/null && npm i playwright@1
PLAYWRIGHT_BROWSERS_PATH=/var/tmp/fm-e2e/pw/browsers npx playwright install chromium-headless-shell firefox
```

- [ ] **Step 6: Bring the harness up and confirm it answers**

Run: `/var/tmp/fm-e2e/setup.sh && /var/tmp/fm-e2e/serve.sh && /var/tmp/fm-e2e/seed.sh`
Expected: `garage ready …`, `web ui ready on :13909`, `seeded`. Then
`curl -s -b /var/tmp/fm-e2e/cookies "http://127.0.0.1:13909/api/browse/e2e?prefix=many/&limit=50" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["objects"]))'`
prints `50`.

No commit (nothing in the repo changed).

---

### Task 2: Share dialog from a row menu stays open (Firefox/Zen bug)

**Files:**
- Modify: `src/components/ui/dialog.tsx` (the `DialogContent` component)
- Test: `/var/tmp/fm-e2e/pw/share-bug.mjs` (outside the repo)

**Interfaces:**
- Produces: every `DialogContent` ignores focus-outside dismissal. Later tasks open Rename, Delete
  confirmation, Move and Share dialogs from dropdown and context menus and rely on this.

- [ ] **Step 1: Write the failing browser check**

`/var/tmp/fm-e2e/pw/share-bug.mjs`:

```js
import { openApp, browseUrl, row, check } from "./lib.mjs";

const { browser, page } = await openApp(process.argv[2] || "firefox");
await page.goto(browseUrl("preview/"));
await row(page, "data.json").waitFor();
// The ⋯ button is the last button in the row.
await row(page, "data.json").locator("button").last().click();
await page.getByRole("menuitem", { name: "Share" }).click();
await page.waitForTimeout(800);
check(await page.getByRole("dialog").isVisible(), "share dialog opened from a row menu stays open");
await browser.close();
```

- [ ] **Step 2: Run it in Firefox to confirm the bug reproduces**

Run: `cd /var/tmp/fm-e2e/pw && PLAYWRIGHT_BROWSERS_PATH=/var/tmp/fm-e2e/pw/browsers node share-bug.mjs firefox`
Expected: `FAIL share dialog opened from a row menu stays open`.
If it passes instead, the cause is different from the spec's hypothesis — stop and use
superpowers:systematic-debugging before changing code.

- [ ] **Step 3: Ignore focus-outside dismissal in `DialogContent`**

In `src/components/ui/dialog.tsx`, change the `DialogContent` destructuring and add the handler
right after the existing `onInteractOutside` prop:

```tsx
const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, onFocusOutside, ...props }, ref) => (
```

```tsx
      // Dialogs are non-modal (see Dialog above), so Radix dismisses one
      // whenever focus lands outside it. A dropdown or context menu that
      // opens a dialog hands focus back to its own trigger as it closes —
      // outside the dialog — which dismissed the dialog the moment it
      // opened (reliably in Firefox). Esc, the close button and backdrop
      // clicks still dismiss it.
      onFocusOutside={(e) => {
        e.preventDefault();
        onFocusOutside?.(e);
      }}
```

- [ ] **Step 4: Rebuild and re-run in both browsers**

Run: `/var/tmp/fm-e2e/serve.sh && cd /var/tmp/fm-e2e/pw && for b in firefox chromium; do PLAYWRIGHT_BROWSERS_PATH=/var/tmp/fm-e2e/pw/browsers node share-bug.mjs $b; done`
Expected: `ok   share dialog opened from a row menu stays open` twice.

- [ ] **Step 5: Typecheck and commit**

Run: `cd /home/gennux/Developer/adnu/s3-garagehq-webui && pnpm exec tsc -b`
Expected: no output, exit 0.

```bash
git add src/components/ui/dialog.tsx
git commit -m "fix(ui): keep dialogs opened from menus from closing immediately."
```

---

### Task 3: Vitest and the app-wide confirmation dialog

**Files:**
- Modify: `package.json` (add `vitest`, `"test"` script), `pnpm-lock.yaml`
- Modify: `.github/workflows/docker-publish.yml` (run `pnpm test` in the `check` job)
- Create: `src/lib/confirm.ts`, `src/lib/confirm.test.ts`, `src/components/ui/confirm-dialog.tsx`
- Modify: `src/app/app.tsx`, `src/pages/cluster/components/nodes-list.tsx`, `src/pages/users/page.tsx`,
  `src/pages/buckets/manage/overview/overview-aliases.tsx`,
  `src/pages/buckets/manage/permissions/permissions-tab.tsx`,
  `src/pages/buckets/manage/components/menu-button.tsx`, `src/pages/keys/page.tsx`,
  `src/components/containers/upload-panel.tsx`

**Interfaces:**
- Produces: `confirmDialog(options: ConfirmOptions): Promise<boolean>` from `@/lib/confirm`, where
  `ConfirmOptions = { title: string; description?: ReactNode; confirmText?: string; cancelText?:
  string; destructive?: boolean }`. `<ConfirmDialog />` is mounted once in `app.tsx`.
- The two object-browser call sites (`bulk-actions.tsx`, `object-actions.tsx`) are replaced in
  Task 10 by `useDeleteKeys`, which uses `confirmDialog`; after Task 10 no `window.confirm` remains.

- [ ] **Step 1: Add Vitest and the test script**

Run: `cd /home/gennux/Developer/adnu/s3-garagehq-webui && pnpm add -w -D vitest@^2.1.9`
Then in `package.json` `"scripts"`, add after `"lint"`:

```json
    "test": "vitest run",
```

In `.github/workflows/docker-publish.yml`, add after the `Typecheck frontend` step:

```yaml
      - name: Frontend unit tests
        run: pnpm test
```

- [ ] **Step 2: Write the failing test**

`src/lib/confirm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { confirmDialog, confirmStore, settleConfirm } from "./confirm";

describe("confirmDialog", () => {
  it("resolves with the user's answer and clears the dialog", async () => {
    const answer = confirmDialog({ title: "Delete?" });
    expect(confirmStore.getState().options?.title).toBe("Delete?");
    settleConfirm(true);
    await expect(answer).resolves.toBe(true);
    expect(confirmStore.getState().options).toBeNull();
  });

  it("settles a replaced request as cancelled", async () => {
    const first = confirmDialog({ title: "First" });
    const second = confirmDialog({ title: "Second" });
    await expect(first).resolves.toBe(false);
    settleConfirm(true);
    await expect(second).resolves.toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./confirm"`.

- [ ] **Step 4: Implement `src/lib/confirm.ts`**

```ts
import { ReactNode } from "react";
import { createStore } from "zustand";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmState = {
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
};

export const confirmStore = createStore<ConfirmState>(() => ({
  options: null,
  resolve: null,
}));

/** Shows the app's confirmation dialog. Resolves true if the user confirms,
 * false if they cancel or dismiss it. */
export const confirmDialog = (options: ConfirmOptions) =>
  new Promise<boolean>((resolve) => {
    // A new request replaces any dialog still open; that one counts as cancelled.
    confirmStore.getState().resolve?.(false);
    confirmStore.setState({ options, resolve });
  });

export const settleConfirm = (value: boolean) => {
  const { resolve } = confirmStore.getState();
  confirmStore.setState({ options: null, resolve: null });
  resolve?.(value);
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test`
Expected: `2 passed`.

- [ ] **Step 6: Create `src/components/ui/confirm-dialog.tsx` and mount it**

```tsx
import { useRef } from "react";
import { useStore } from "zustand";
import { confirmStore, settleConfirm } from "@/lib/confirm";
import Button from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

const ConfirmDialog = () => {
  const options = useStore(confirmStore, (s) => s.options);
  // Keep showing the last content while the dialog animates closed.
  const lastRef = useRef(options);
  if (options) lastRef.current = options;
  const shown = options ?? lastRef.current;

  return (
    <Dialog
      open={!!options}
      onOpenChange={(open) => !open && settleConfirm(false)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{shown?.title}</DialogTitle>
          {shown?.description ? (
            <DialogDescription>{shown.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => settleConfirm(false)}>
            {shown?.cancelText || "Cancel"}
          </Button>
          <Button
            variant={shown?.destructive ? "destructive" : "default"}
            onClick={() => settleConfirm(true)}
          >
            {shown?.confirmText || "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmDialog;
```

In `src/app/app.tsx` add `import ConfirmDialog from "@/components/ui/confirm-dialog";` and render
`<ConfirmDialog />` directly after `<Toaster richColors />`.

- [ ] **Step 7: Replace the nine `window.confirm` calls outside the object browser**

Add `import { confirmDialog } from "@/lib/confirm";` to each file, then replace:

`src/pages/cluster/components/nodes-list.tsx`:

```tsx
  const onUnassign = async (id: string) => {
    const ok = await confirmDialog({
      title: "Unassign this node?",
      description:
        "It will be removed from the staged cluster layout. Apply the layout to make it take effect.",
      confirmText: "Unassign",
      destructive: true,
    });
    if (ok) {
      unassignNode.mutate(id);
    }
  };

  const onRevert = async () => {
    const ok = await confirmDialog({
      title: "Revert layout changes?",
      description: "All staged changes to the cluster layout will be discarded.",
      confirmText: "Revert",
      destructive: true,
    });
    if (ok && data?.version != null) {
      revertChanges.mutate(data?.version + 1);
    }
  };

  const onApply = async () => {
    const ok = await confirmDialog({
      title: "Apply layout changes?",
      description:
        "Garage will rebalance data across the cluster to match the new layout.",
      confirmText: "Apply",
    });
    if (ok && data?.version != null) {
      applyChanges.mutate(data?.version + 1);
    }
  };
```

`src/pages/users/page.tsx`:

```tsx
  const onRemove = async (user: User) => {
    const ok = await confirmDialog({
      title: `Remove user "${user.username}"?`,
      description: "They will no longer be able to sign in.",
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) {
      deleteUser.mutate(user.id);
    }
  };
```

`src/pages/buckets/manage/overview/overview-aliases.tsx`:

```tsx
  const onRemoveAlias = async (alias: string) => {
    const ok = await confirmDialog({
      title: "Remove this alias?",
      description: `The bucket will no longer be reachable as "${alias}".`,
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) {
      removeAlias.mutate(alias);
    }
  };
```

`src/pages/buckets/manage/permissions/permissions-tab.tsx`:

```tsx
  const onRemove = async (id: string) => {
    const ok = await confirmDialog({
      title: "Remove this key's access?",
      description:
        "The key will lose all read, write and owner access to this bucket.",
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) {
      denyKey.mutate({
        keyId: id,
        permissions: { read: true, write: true, owner: true },
      });
    }
  };
```

`src/pages/buckets/manage/components/menu-button.tsx`:

```tsx
  const onRemove = async () => {
    const ok = await confirmDialog({
      title: "Remove this bucket?",
      description: "The bucket must be empty. This can't be undone.",
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) {
      removeBucket.mutate(id!);
    }
  };
```

`src/pages/keys/page.tsx`:

```tsx
  const onRemove = async (id: string) => {
    const ok = await confirmDialog({
      title: "Remove this key?",
      description:
        "Applications using it will lose access to every bucket it was granted. This can't be undone.",
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) {
      removeKey.mutate(id);
    }
  };
```

`src/components/containers/upload-panel.tsx`:

```tsx
  const onClose = async () => {
    if (active) {
      const ok = await confirmDialog({
        title: `Cancel ${active} upload${active > 1 ? "s" : ""}?`,
        description: "Files that haven't finished uploading won't be saved.",
        confirmText: "Cancel uploads",
        cancelText: "Keep uploading",
        destructive: true,
      });
      if (!ok) return;
    }
    uploadStore.clearAll();
  };
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm exec tsc -b && pnpm test && grep -rn "window.confirm" src --include=*.tsx`
Expected: tsc clean, tests pass, grep lists only `bulk-actions.tsx` and `object-actions.tsx`.

```bash
git add package.json pnpm-lock.yaml .github/workflows/docker-publish.yml src/lib/confirm.ts src/lib/confirm.test.ts src/components/ui/confirm-dialog.tsx src/app/app.tsx src/pages/cluster/components/nodes-list.tsx src/pages/users/page.tsx src/pages/buckets/manage/overview/overview-aliases.tsx src/pages/buckets/manage/permissions/permissions-tab.tsx src/pages/buckets/manage/components/menu-button.tsx src/pages/keys/page.tsx src/components/containers/upload-panel.tsx
git commit -m "feat(ui): replace native confirm popups with an in-app confirmation dialog."
```

---

### Task 4: Backend folder search

**Files:**
- Create: `backend/router/s3api.go`, `backend/router/search.go`,
  `backend/router/memstore_test.go`, `backend/router/search_test.go`
- Modify: `backend/router/browse.go` (`GetObjects`, new `toBrowserObjects`),
  `backend/schema/browse.go` (`Truncated`)

**Interfaces:**
- Produces: `type s3API interface` (satisfied by `*s3.Client`); `isNotFound(err error) bool`;
  `toBrowserObjects(bucket, prefix string, objects []types.Object) []schema.BrowserObject`;
  `searchFolder(ctx, client s3API, bucket, prefix, term string) (*searchMatches, error)`;
  `searchObjects(ctx, client s3API, bucket, prefix, term, next string, limit int)
  (schema.BrowseObjectResult, error)`; test fake `newMemS3(keys ...string) *memS3` with fields
  `objects map[string][]byte`, counters `lists`, `copies`, `partCopies`, `aborted`, knobs
  `maxCopySize int64`, `failPartCopy int32`, `ignoreDeletes bool`, helper `has(key) bool`.
- API: `GET /browse/{bucket}?prefix=&search=&limit=&next=` — `search` switches to search mode;
  response gains `"truncated": bool`.

- [ ] **Step 1: Add the `s3API` interface**

`backend/router/s3api.go`:

```go
package router

import (
	"context"
	"errors"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

// s3API is the subset of the S3 client the object browser uses, so its
// listing, search, rename, copy and delete logic can be tested against a fake.
type s3API interface {
	ListObjectsV2(ctx context.Context, in *s3.ListObjectsV2Input, opts ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
	HeadObject(ctx context.Context, in *s3.HeadObjectInput, opts ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
	CopyObject(ctx context.Context, in *s3.CopyObjectInput, opts ...func(*s3.Options)) (*s3.CopyObjectOutput, error)
	DeleteObject(ctx context.Context, in *s3.DeleteObjectInput, opts ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
	DeleteObjects(ctx context.Context, in *s3.DeleteObjectsInput, opts ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error)
	CreateMultipartUpload(ctx context.Context, in *s3.CreateMultipartUploadInput, opts ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error)
	UploadPartCopy(ctx context.Context, in *s3.UploadPartCopyInput, opts ...func(*s3.Options)) (*s3.UploadPartCopyOutput, error)
	CompleteMultipartUpload(ctx context.Context, in *s3.CompleteMultipartUploadInput, opts ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error)
	AbortMultipartUpload(ctx context.Context, in *s3.AbortMultipartUploadInput, opts ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error)
}

var _ s3API = (*s3.Client)(nil)

// isNotFound reports whether err is S3's "no such object" error.
func isNotFound(err error) bool {
	var notFound *types.NotFound
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &notFound) || errors.As(err, &noSuchKey) {
		return true
	}
	var apiErr smithy.APIError
	return errors.As(err, &apiErr) &&
		(apiErr.ErrorCode() == "NotFound" || apiErr.ErrorCode() == "NoSuchKey")
}
```

- [ ] **Step 2: Add the in-memory fake**

`backend/router/memstore_test.go`:

```go
package router

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// memS3 is an in-memory, single-bucket s3API for tests. Listings follow S3's
// rules: keys sorted, at most 1,000 entries per page, delimiter folding.
type memS3 struct {
	mu      sync.Mutex
	objects map[string][]byte
	uploads map[string]map[int32][]byte

	lists, copies, partCopies, aborted int

	maxCopySize   int64 // CopyObject fails above this size when > 0 (S3's 5 GiB cap)
	failPartCopy  int32 // UploadPartCopy fails for this part number when > 0
	ignoreDeletes bool  // DeleteObjects reports success without deleting
}

var _ s3API = (*memS3)(nil)

func newMemS3(keys ...string) *memS3 {
	m := &memS3{objects: map[string][]byte{}, uploads: map[string]map[int32][]byte{}}
	for _, k := range keys {
		m.objects[k] = []byte("data:" + k)
	}
	return m
}

func (m *memS3) has(key string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.objects[key]
	return ok
}

func (m *memS3) sortedKeys() []string {
	keys := make([]string, 0, len(m.objects))
	for k := range m.objects {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func (m *memS3) ListObjectsV2(_ context.Context, in *s3.ListObjectsV2Input, _ ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lists++

	prefix, delim := aws.ToString(in.Prefix), aws.ToString(in.Delimiter)
	start := aws.ToString(in.ContinuationToken)
	limit := 1000
	if n := aws.ToInt32(in.MaxKeys); n > 0 && int(n) < limit {
		limit = int(n)
	}

	out := &s3.ListObjectsV2Output{IsTruncated: aws.Bool(false)}
	seen := map[string]bool{}
	count, last := 0, ""
	for _, k := range m.sortedKeys() {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		entry, isPrefix := k, false
		if delim != "" {
			if i := strings.Index(k[len(prefix):], delim); i >= 0 {
				entry, isPrefix = k[:len(prefix)+i+len(delim)], true
			}
		}
		if entry <= start || seen[entry] {
			continue
		}
		if count == limit {
			out.IsTruncated, out.NextContinuationToken = aws.Bool(true), aws.String(last)
			break
		}
		if isPrefix {
			seen[entry] = true
			out.CommonPrefixes = append(out.CommonPrefixes, types.CommonPrefix{Prefix: aws.String(entry)})
		} else {
			out.Contents = append(out.Contents, types.Object{
				Key:          aws.String(k),
				Size:         aws.Int64(int64(len(m.objects[k]))),
				LastModified: aws.Time(time.Unix(0, 0)),
			})
		}
		count++
		last = entry
	}
	return out, nil
}

func (m *memS3) HeadObject(_ context.Context, in *s3.HeadObjectInput, _ ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[aws.ToString(in.Key)]
	if !ok {
		return nil, &types.NotFound{}
	}
	return &s3.HeadObjectOutput{ContentLength: aws.Int64(int64(len(data)))}, nil
}

// source resolves a CopySource ("bucket/key", path-escaped). Caller holds the lock.
func (m *memS3) source(copySource *string) ([]byte, error) {
	raw, err := url.PathUnescape(aws.ToString(copySource))
	if err != nil {
		return nil, err
	}
	_, key, _ := strings.Cut(raw, "/")
	data, ok := m.objects[key]
	if !ok {
		return nil, &types.NoSuchKey{}
	}
	return data, nil
}

func (m *memS3) CopyObject(_ context.Context, in *s3.CopyObjectInput, _ ...func(*s3.Options)) (*s3.CopyObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, err := m.source(in.CopySource)
	if err != nil {
		return nil, err
	}
	if m.maxCopySize > 0 && int64(len(data)) > m.maxCopySize {
		return nil, errors.New("EntityTooLarge: copy source is larger than the maximum allowable size")
	}
	m.objects[aws.ToString(in.Key)] = append([]byte(nil), data...)
	m.copies++
	return &s3.CopyObjectOutput{}, nil
}

func (m *memS3) DeleteObject(_ context.Context, in *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, aws.ToString(in.Key))
	return &s3.DeleteObjectOutput{}, nil
}

func (m *memS3) DeleteObjects(_ context.Context, in *s3.DeleteObjectsInput, _ ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(in.Delete.Objects) > 1000 {
		return nil, errors.New("MalformedXML: more than 1000 keys")
	}
	if !m.ignoreDeletes {
		for _, o := range in.Delete.Objects {
			delete(m.objects, aws.ToString(o.Key))
		}
	}
	return &s3.DeleteObjectsOutput{}, nil
}

func (m *memS3) CreateMultipartUpload(_ context.Context, _ *s3.CreateMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := "up-" + strconv.Itoa(len(m.uploads)+1)
	m.uploads[id] = map[int32][]byte{}
	return &s3.CreateMultipartUploadOutput{UploadId: aws.String(id)}, nil
}

func (m *memS3) UploadPartCopy(_ context.Context, in *s3.UploadPartCopyInput, _ ...func(*s3.Options)) (*s3.UploadPartCopyOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := aws.ToInt32(in.PartNumber)
	if n == m.failPartCopy {
		return nil, errors.New("InternalError: part copy failed")
	}
	data, err := m.source(in.CopySource)
	if err != nil {
		return nil, err
	}
	var from, to int64
	if _, err := fmt.Sscanf(aws.ToString(in.CopySourceRange), "bytes=%d-%d", &from, &to); err != nil {
		return nil, err
	}
	m.uploads[aws.ToString(in.UploadId)][n] = append([]byte(nil), data[from:to+1]...)
	m.partCopies++
	return &s3.UploadPartCopyOutput{CopyPartResult: &types.CopyPartResult{ETag: aws.String(fmt.Sprintf("etag-%d", n))}}, nil
}

func (m *memS3) CompleteMultipartUpload(_ context.Context, in *s3.CompleteMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	parts := m.uploads[aws.ToString(in.UploadId)]
	var buf bytes.Buffer
	for _, p := range in.MultipartUpload.Parts {
		buf.Write(parts[aws.ToInt32(p.PartNumber)])
	}
	m.objects[aws.ToString(in.Key)] = buf.Bytes()
	delete(m.uploads, aws.ToString(in.UploadId))
	return &s3.CompleteMultipartUploadOutput{}, nil
}

func (m *memS3) AbortMultipartUpload(_ context.Context, in *s3.AbortMultipartUploadInput, _ ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.uploads, aws.ToString(in.UploadId))
	m.aborted++
	return &s3.AbortMultipartUploadOutput{}, nil
}
```

- [ ] **Step 3: Write the failing search tests**

`backend/router/search_test.go`:

```go
package router

import (
	"context"
	"fmt"
	"khairul169/garage-webui/utils"
	"reflect"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

func photoStore() *memS3 {
	return newMemS3(
		"photos/",
		"photos/Beach.JPG",
		"photos/beach-2.png",
		"photos/city.png",
		"photos/report (1).txt",
		"photos/Beaches/a.png",
		"photos/archive/old-beach.png",
	)
}

func objectKeys(objects []types.Object) []string {
	keys := []string{}
	for _, o := range objects {
		keys = append(keys, aws.ToString(o.Key))
	}
	return keys
}

func TestSearchFolderMatchesNamesInFolderOnly(t *testing.T) {
	got, err := searchFolder(context.Background(), photoStore(), "b", "photos/", "BEACH")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"photos/Beaches/"}; !reflect.DeepEqual(got.Prefixes, want) {
		t.Errorf("prefixes = %v, want %v", got.Prefixes, want)
	}
	// Nested photos/archive/old-beach.png is not in this folder; the folder
	// marker "photos/" has an empty name and never matches.
	if want := []string{"photos/Beach.JPG", "photos/beach-2.png"}; !reflect.DeepEqual(objectKeys(got.Objects), want) {
		t.Errorf("objects = %v, want %v", objectKeys(got.Objects), want)
	}
	if got.Truncated {
		t.Error("truncated = true, want false")
	}
}

func TestSearchFolderTreatsTermLiterally(t *testing.T) {
	for _, term := range []string{"(1)", "."} {
		got, err := searchFolder(context.Background(), photoStore(), "b", "photos/", term)
		if err != nil {
			t.Fatal(err)
		}
		keys := objectKeys(got.Objects)
		if term == "(1)" && !reflect.DeepEqual(keys, []string{"photos/report (1).txt"}) {
			t.Errorf("term %q matched %v", term, keys)
		}
		if term == "." && len(keys) != 4 {
			t.Errorf("term %q matched %v, want the 4 files with a dot", term, keys)
		}
	}
	got, err := searchFolder(context.Background(), photoStore(), "b", "photos/", "*")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Objects)+len(got.Prefixes) != 0 {
		t.Errorf("term %q matched %v, want nothing", "*", objectKeys(got.Objects))
	}
}

func TestSearchFolderStopsAtScanLimit(t *testing.T) {
	prev := searchScanLimit
	searchScanLimit = 5
	t.Cleanup(func() { searchScanLimit = prev })

	keys := []string{}
	for i := 0; i < 3000; i++ {
		keys = append(keys, fmt.Sprintf("big/f-%04d.txt", i))
	}
	m := newMemS3(keys...)
	got, err := searchFolder(context.Background(), m, "b", "big/", "f-")
	if err != nil {
		t.Fatal(err)
	}
	if !got.Truncated {
		t.Error("truncated = false, want true")
	}
	if m.lists != 1 {
		t.Errorf("listed %d pages, want 1", m.lists)
	}
}

func TestSearchPagePaginatesFoldersThenFiles(t *testing.T) {
	matches := &searchMatches{
		Prefixes: []string{"p/a1/", "p/a2/"},
		Objects: []types.Object{
			{Key: aws.String("p/a3.txt")}, {Key: aws.String("p/a4.txt")}, {Key: aws.String("p/a5.txt")},
		},
	}

	first := searchPage("b", "p/", matches, 0, 2)
	if !reflect.DeepEqual(first.Prefixes, []string{"p/a1/", "p/a2/"}) || len(first.Objects) != 0 {
		t.Errorf("page 1 = %v / %d objects", first.Prefixes, len(first.Objects))
	}
	if aws.ToString(first.NextToken) != "s:2" {
		t.Errorf("page 1 next = %q, want s:2", aws.ToString(first.NextToken))
	}

	second := searchPage("b", "p/", matches, 2, 2)
	if len(second.Prefixes) != 0 || len(second.Objects) != 2 || *second.Objects[0].ObjectKey != "a3.txt" {
		t.Errorf("page 2 = %v / %v", second.Prefixes, second.Objects)
	}

	third := searchPage("b", "p/", matches, 4, 2)
	if len(third.Objects) != 1 || third.NextToken != nil {
		t.Errorf("page 3 = %d objects, next %v", len(third.Objects), third.NextToken)
	}
}

func TestSearchObjectsCachesLaterPages(t *testing.T) {
	utils.InitCacheManager()
	m := photoStore()
	ctx := context.Background()

	first, err := searchObjects(ctx, m, "b", "photos/", "png", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := searchObjects(ctx, m, "b", "photos/", "png", aws.ToString(first.NextToken), 1); err != nil {
		t.Fatal(err)
	}
	if m.lists != 1 {
		t.Errorf("paging re-listed the folder: %d lists, want 1", m.lists)
	}
	if _, err := searchObjects(ctx, m, "b", "photos/", "png", "", 1); err != nil {
		t.Fatal(err)
	}
	if m.lists != 2 {
		t.Errorf("a new search should re-list: %d lists, want 2", m.lists)
	}
}

func TestParseSearchToken(t *testing.T) {
	for in, want := range map[string]int{"": 0, "s:10": 10, "abc": 0, "s:-3": 0, "10": 0} {
		if got := parseSearchToken(in); got != want {
			t.Errorf("parseSearchToken(%q) = %d, want %d", in, got, want)
		}
	}
}
```

- [ ] **Step 4: Run to verify they fail**

Run: `cd backend && go test ./router/ -run 'Search|ParseSearch'`
Expected: build failure — `undefined: searchFolder`.

- [ ] **Step 5: Implement search**

Add to `backend/schema/browse.go` inside `BrowseObjectResult`, after `NextToken`:

```go
	Truncated bool            `json:"truncated"`
```

`backend/router/search.go`:

```go
package router

import (
	"context"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var (
	// searchScanLimit caps how many folder entries one search reads.
	searchScanLimit = 50000
	searchCacheTTL  = 30 * time.Second
)

// searchTokenPrefix marks a search page token (an offset into the matches),
// so it can't be confused with an S3 continuation token.
const searchTokenPrefix = "s:"

type searchMatches struct {
	Prefixes  []string
	Objects   []types.Object
	Truncated bool
}

// searchFolder lists every entry directly under prefix and keeps the ones
// whose name (the key without prefix) contains term, ignoring case.
func searchFolder(ctx context.Context, client s3API, bucket, prefix, term string) (*searchMatches, error) {
	needle := strings.ToLower(term)
	matches := &searchMatches{}
	scanned := 0
	var token *string

	for {
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucket),
			Prefix:            aws.String(prefix),
			Delimiter:         aws.String("/"),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, err
		}

		for _, p := range list.CommonPrefixes {
			name := strings.TrimSuffix(strings.TrimPrefix(aws.ToString(p.Prefix), prefix), "/")
			if strings.Contains(strings.ToLower(name), needle) {
				matches.Prefixes = append(matches.Prefixes, aws.ToString(p.Prefix))
			}
		}
		for _, o := range list.Contents {
			name := strings.TrimPrefix(aws.ToString(o.Key), prefix)
			if name != "" && strings.Contains(strings.ToLower(name), needle) {
				matches.Objects = append(matches.Objects, o)
			}
		}
		scanned += len(list.CommonPrefixes) + len(list.Contents)

		if !aws.ToBool(list.IsTruncated) {
			return matches, nil
		}
		if scanned >= searchScanLimit {
			matches.Truncated = true
			return matches, nil
		}
		token = list.NextContinuationToken
	}
}

// searchObjects answers one page of a folder search. The full match list is
// cached briefly so paging through results doesn't re-list the folder; a new
// search (no page token) always re-lists.
func searchObjects(ctx context.Context, client s3API, bucket, prefix, term, next string, limit int) (schema.BrowseObjectResult, error) {
	cacheKey := "search:" + bucket + "\x00" + prefix + "\x00" + strings.ToLower(term)
	offset := parseSearchToken(next)

	matches, _ := utils.Cache.Get(cacheKey).(*searchMatches)
	if matches == nil || offset == 0 {
		found, err := searchFolder(ctx, client, bucket, prefix, term)
		if err != nil {
			return schema.BrowseObjectResult{}, err
		}
		matches = found
		utils.Cache.Set(cacheKey, matches, searchCacheTTL)
	}

	return searchPage(bucket, prefix, matches, offset, limit), nil
}

func parseSearchToken(next string) int {
	if !strings.HasPrefix(next, searchTokenPrefix) {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimPrefix(next, searchTokenPrefix))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// searchPage slices one page out of the matches: folders first, then files,
// the same order as a normal listing.
func searchPage(bucket, prefix string, matches *searchMatches, offset, limit int) schema.BrowseObjectResult {
	if limit <= 0 {
		limit = 100
	}
	nPrefixes := len(matches.Prefixes)
	total := nPrefixes + len(matches.Objects)
	offset = min(offset, total)
	end := min(offset+limit, total)

	res := schema.BrowseObjectResult{
		Prefixes:  []string{},
		Objects:   []schema.BrowserObject{},
		Prefix:    prefix,
		Truncated: matches.Truncated,
	}
	if offset < nPrefixes {
		res.Prefixes = append(res.Prefixes, matches.Prefixes[offset:min(end, nPrefixes)]...)
	}
	if end > nPrefixes {
		res.Objects = toBrowserObjects(bucket, prefix, matches.Objects[max(offset-nPrefixes, 0):end-nPrefixes])
	}
	if end < total {
		res.NextToken = aws.String(searchTokenPrefix + strconv.Itoa(end))
	}
	return res
}
```

In `backend/router/browse.go`, add `toBrowserObjects` (below `GetObjects`) and use it in
`GetObjects`, plus the search branch. Replace the body of `GetObjects` from the
`client, err := getS3Client(bucket)` line to the end of the function with:

```go
	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	if search := strings.TrimSpace(query.Get("search")); search != "" {
		result, err := searchObjects(r.Context(), client, bucket, prefix, search, continuationToken, limit)
		if err != nil {
			utils.ResponseError(w, err)
			return
		}
		utils.ResponseSuccess(w, result)
		return
	}

	objects, err := client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket:            aws.String(bucket),
		Prefix:            aws.String(prefix),
		Delimiter:         aws.String("/"),
		MaxKeys:           aws.Int32(int32(limit)),
		ContinuationToken: aws.String(continuationToken),
	})

	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	result := schema.BrowseObjectResult{
		Prefixes:  []string{},
		Objects:   toBrowserObjects(bucket, prefix, objects.Contents),
		Prefix:    prefix,
		NextToken: objects.NextContinuationToken,
	}

	for _, prefix := range objects.CommonPrefixes {
		result.Prefixes = append(result.Prefixes, *prefix.Prefix)
	}

	utils.ResponseSuccess(w, result)
}

// toBrowserObjects converts S3 objects to browser rows, with keys made
// relative to prefix. The folder's own marker object (empty name) is skipped.
func toBrowserObjects(bucket, prefix string, objects []types.Object) []schema.BrowserObject {
	out := []schema.BrowserObject{}
	for _, object := range objects {
		key := strings.TrimPrefix(*object.Key, prefix)
		if key == "" {
			continue
		}
		out = append(out, schema.BrowserObject{
			ObjectKey:    &key,
			LastModified: object.LastModified,
			Size:         object.Size,
			Url:          fmt.Sprintf("/browse/%s/%s", bucket, *object.Key),
		})
	}
	return out
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && gofmt -l . ; go vet ./... && go test ./router/`
Expected: no gofmt output, `ok  khairul169/garage-webui/router`.

- [ ] **Step 7: Commit**

```bash
git add backend/router/s3api.go backend/router/search.go backend/router/memstore_test.go backend/router/search_test.go backend/router/browse.go backend/schema/browse.go
git commit -m "feat(browse): add case-insensitive search across the whole current folder."
```

---

### Task 5: Backend rename and large-object copy

**Files:**
- Create: `backend/router/object_ops.go`, `backend/router/rename.go`, `backend/router/rename_test.go`
- Modify: `backend/router/browse.go` (remove `moveSingleObject` and `moveObjectsWithPrefix`, update
  the `MoveObjects` call), `backend/router/router.go` (register the route)

**Interfaces:**
- Consumes: `s3API`, `isNotFound`, `memS3` (Task 4); `maxUploadParts` (`upload.go`).
- Produces: `copyObject(ctx, client s3API, bucket, key, newKey string, size int64) error` (size < 0 =
  unknown); `moveSingleObject(ctx, client s3API, bucket, key, newKey string, size int64) error`;
  `moveObjectsWithPrefix(ctx, client s3API, bucket, prefix, destPrefix string) (int, error)`;
  `renameTarget(key, name string) (string, error)`; `renameObject(ctx, client s3API, bucket, key,
  newKey string) (int, error)`; errors `errNameTaken`, `errSourceMissing`.
- API: `PATCH /browse/{bucket}/{key...}` body `{"name": "…"}` → `200 {"key": newKey, "moved": n}`,
  `400` invalid name, `404` missing source, `409` name taken.

- [ ] **Step 1: Write the failing tests**

`backend/router/rename_test.go`:

```go
package router

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

func TestRenameTarget(t *testing.T) {
	ok := []struct{ key, name, want string }{
		{"docs/a.txt", "b.txt", "docs/b.txt"},
		{"a.txt", "A.txt", "A.txt"},
		{"docs/old/", "new", "docs/new/"},
		{"top/", "x", "x/"},
		{"docs/a.txt", "  padded.txt  ", "docs/padded.txt"},
	}
	for _, c := range ok {
		got, err := renameTarget(c.key, c.name)
		if err != nil || got != c.want {
			t.Errorf("renameTarget(%q, %q) = %q, %v; want %q", c.key, c.name, got, err, c.want)
		}
	}
	for _, name := range []string{"", "  ", "a/b", ".", "..", "a.txt"} {
		if _, err := renameTarget("docs/a.txt", name); err == nil {
			t.Errorf("renameTarget(%q) should fail", name)
		}
	}
}

func TestRenameFile(t *testing.T) {
	m := newMemS3("docs/a.txt", "docs/b.txt")
	moved, err := renameObject(context.Background(), m, "b", "docs/a.txt", "docs/c.txt")
	if err != nil || moved != 1 {
		t.Fatalf("moved %d, err %v", moved, err)
	}
	if !m.has("docs/c.txt") || m.has("docs/a.txt") {
		t.Error("docs/a.txt was not renamed to docs/c.txt")
	}
}

func TestRenameFileRefusesExistingName(t *testing.T) {
	m := newMemS3("docs/a.txt", "docs/b.txt")
	_, err := renameObject(context.Background(), m, "b", "docs/a.txt", "docs/b.txt")
	if !errors.Is(err, errNameTaken) {
		t.Fatalf("err = %v, want errNameTaken", err)
	}
	if string(m.objects["docs/b.txt"]) != "data:docs/b.txt" || !m.has("docs/a.txt") {
		t.Error("a refused rename must leave both files untouched")
	}
}

func TestRenameFileCaseOnly(t *testing.T) {
	m := newMemS3("docs/a.txt")
	if _, err := renameObject(context.Background(), m, "b", "docs/a.txt", "docs/A.txt"); err != nil {
		t.Fatal(err)
	}
	if !m.has("docs/A.txt") || m.has("docs/a.txt") {
		t.Error("case-only rename did not happen")
	}
}

func TestRenameMissingSource(t *testing.T) {
	m := newMemS3()
	if _, err := renameObject(context.Background(), m, "b", "gone.txt", "new.txt"); !errors.Is(err, errSourceMissing) {
		t.Fatalf("err = %v, want errSourceMissing", err)
	}
	if _, err := renameObject(context.Background(), m, "b", "gone/", "new/"); !errors.Is(err, errSourceMissing) {
		t.Fatalf("folder err = %v, want errSourceMissing", err)
	}
}

func TestRenameFolder(t *testing.T) {
	m := newMemS3("p/old/", "p/old/x.txt", "p/old/sub/y.txt", "p/other.txt")
	moved, err := renameObject(context.Background(), m, "b", "p/old/", "p/new/")
	if err != nil || moved != 3 {
		t.Fatalf("moved %d, err %v", moved, err)
	}
	for _, k := range []string{"p/new/", "p/new/x.txt", "p/new/sub/y.txt", "p/other.txt"} {
		if !m.has(k) {
			t.Errorf("missing %s", k)
		}
	}
	for _, k := range []string{"p/old/", "p/old/x.txt", "p/old/sub/y.txt"} {
		if m.has(k) {
			t.Errorf("%s should have moved", k)
		}
	}
}

func TestRenameFolderRefusesExistingName(t *testing.T) {
	m := newMemS3("p/old/x.txt", "p/new/z.txt")
	if _, err := renameObject(context.Background(), m, "b", "p/old/", "p/new/"); !errors.Is(err, errNameTaken) {
		t.Fatalf("err = %v, want errNameTaken", err)
	}
}

func withSmallCopyLimits(t *testing.T) {
	prevMax, prevPart := maxSingleCopySize, minCopyPartSize
	maxSingleCopySize, minCopyPartSize = 4, 3
	t.Cleanup(func() { maxSingleCopySize, minCopyPartSize = prevMax, prevPart })
}

func TestCopyObjectUsesMultipartAboveLimit(t *testing.T) {
	withSmallCopyLimits(t)
	m := newMemS3()
	m.maxCopySize = 4
	m.objects["big"] = []byte("0123456789")

	if err := copyObject(context.Background(), m, "b", "big", "big2", -1); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(m.objects["big2"], []byte("0123456789")) {
		t.Errorf("copy = %q", m.objects["big2"])
	}
	if m.partCopies != 4 || m.copies != 0 {
		t.Errorf("partCopies %d copies %d, want 4 and 0", m.partCopies, m.copies)
	}
}

func TestCopyObjectAbortsFailedMultipartCopy(t *testing.T) {
	withSmallCopyLimits(t)
	m := newMemS3()
	m.objects["big"] = []byte("0123456789")
	m.failPartCopy = 2

	if err := copyObject(context.Background(), m, "b", "big", "big2", -1); err == nil {
		t.Fatal("expected an error")
	}
	if m.aborted != 1 || m.has("big2") || !m.has("big") {
		t.Errorf("aborted %d, big2 %v, big %v", m.aborted, m.has("big2"), m.has("big"))
	}
}

func TestCopyPartSizeStaysWithinPartLimit(t *testing.T) {
	for _, size := range []int64{5<<30 + 1, 1 << 40, maxObjectSize} {
		part := copyPartSize(size)
		if part < minCopyPartSize || (size+part-1)/part > maxUploadParts {
			t.Errorf("size %d: part %d gives %d parts", size, part, (size+part-1)/part)
		}
	}
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && go test ./router/ -run 'Rename|Copy'`
Expected: build failure — `undefined: renameTarget`.

- [ ] **Step 3: Move the copy/move helpers into `object_ops.go` with multipart copy**

Delete `moveSingleObject` and `moveObjectsWithPrefix` from `backend/router/browse.go`, and in
`MoveObjects` change `moveSingleObject(ctx, client, bucket, item, newKey)` to
`moveSingleObject(ctx, client, bucket, item, newKey, -1)`.

`backend/router/object_ops.go`:

```go
package router

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var (
	// maxSingleCopySize is the largest object S3 copies in one CopyObject
	// call; bigger objects are copied part by part.
	maxSingleCopySize int64 = 5 << 30

	// minCopyPartSize is the smallest part used for multipart copies.
	minCopyPartSize int64 = 512 << 20
)

func copySource(bucket, key string) *string {
	return aws.String(url.PathEscape(bucket + "/" + key))
}

// copyPartSize picks a part size for a multipart copy that stays within S3's
// part-count limit.
func copyPartSize(size int64) int64 {
	part := minCopyPartSize
	if needed := (size + maxUploadParts - 1) / maxUploadParts; needed > part {
		part = needed
	}
	return part
}

// copyObject copies key to newKey inside bucket. size is the object's size,
// or negative when unknown (it is then looked up).
func copyObject(ctx context.Context, client s3API, bucket, key, newKey string, size int64) error {
	if size < 0 {
		head, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
		if err != nil {
			return err
		}
		size = aws.ToInt64(head.ContentLength)
	}

	if size <= maxSingleCopySize {
		_, err := client.CopyObject(ctx, &s3.CopyObjectInput{
			Bucket:     aws.String(bucket),
			CopySource: copySource(bucket, key),
			Key:        aws.String(newKey),
		})
		return err
	}
	return multipartCopy(ctx, client, bucket, key, newKey, size)
}

// multipartCopy copies an object too large for CopyObject in ranged parts.
// A failed copy is aborted so no orphaned parts are left behind.
func multipartCopy(ctx context.Context, client s3API, bucket, key, newKey string, size int64) error {
	upload, err := client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(newKey),
	})
	if err != nil {
		return err
	}

	abort := func(cause error) error {
		abortCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if _, err := client.AbortMultipartUpload(abortCtx, &s3.AbortMultipartUploadInput{
			Bucket:   aws.String(bucket),
			Key:      aws.String(newKey),
			UploadId: upload.UploadId,
		}); err != nil {
			log.Printf("Cannot abort multipart copy %s for %s/%s: %v", aws.ToString(upload.UploadId), bucket, newKey, err)
		}
		return cause
	}

	partSize := copyPartSize(size)
	var parts []types.CompletedPart
	for n, offset := int32(1), int64(0); offset < size; n, offset = n+1, offset+partSize {
		end := min(offset+partSize, size) - 1
		out, err := client.UploadPartCopy(ctx, &s3.UploadPartCopyInput{
			Bucket:          aws.String(bucket),
			Key:             aws.String(newKey),
			UploadId:        upload.UploadId,
			PartNumber:      aws.Int32(n),
			CopySource:      copySource(bucket, key),
			CopySourceRange: aws.String(fmt.Sprintf("bytes=%d-%d", offset, end)),
		})
		if err != nil {
			return abort(err)
		}
		parts = append(parts, types.CompletedPart{ETag: out.CopyPartResult.ETag, PartNumber: aws.Int32(n)})
	}

	if _, err := client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:          aws.String(bucket),
		Key:             aws.String(newKey),
		UploadId:        upload.UploadId,
		MultipartUpload: &types.CompletedMultipartUpload{Parts: parts},
	}); err != nil {
		return abort(err)
	}
	return nil
}

// moveSingleObject copies key to newKey, then deletes key.
func moveSingleObject(ctx context.Context, client s3API, bucket, key, newKey string, size int64) error {
	if err := copyObject(ctx, client, bucket, key, newKey, size); err != nil {
		return err
	}
	_, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

// moveObjectsWithPrefix moves every object under prefix to destPrefix,
// keeping their paths relative to the prefix.
func moveObjectsWithPrefix(ctx context.Context, client s3API, bucket, prefix, destPrefix string) (int, error) {
	moved := 0
	var continuationToken *string

	for {
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return moved, err
		}

		for _, object := range list.Contents {
			key := *object.Key
			newKey := destPrefix + strings.TrimPrefix(key, prefix)
			if newKey == key {
				continue
			}
			size := int64(-1)
			if object.Size != nil {
				size = *object.Size
			}
			if err := moveSingleObject(ctx, client, bucket, key, newKey, size); err != nil {
				return moved, err
			}
			moved++
		}

		if list.IsTruncated == nil || !*list.IsTruncated {
			break
		}
		continuationToken = list.NextContinuationToken
	}

	return moved, nil
}
```

- [ ] **Step 4: Implement rename**

`backend/router/rename.go`:

```go
package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"khairul169/garage-webui/utils"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var (
	errNameTaken     = errors.New("name already taken")
	errSourceMissing = errors.New("the file or folder no longer exists")
)

// RenameObject renames a file, or a folder and everything in it, within its
// current folder. It never overwrites an existing file or folder.
func (b *Browse) RenameObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	newKey, err := renameTarget(key, body.Name)
	if err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	moved, err := renameObject(r.Context(), client, bucket, key, newKey)
	switch {
	case errors.Is(err, errNameTaken):
		utils.ResponseErrorStatus(w, fmt.Errorf("a file or folder named %q already exists", strings.TrimSpace(body.Name)), http.StatusConflict)
		return
	case errors.Is(err, errSourceMissing):
		utils.ResponseErrorStatus(w, err, http.StatusNotFound)
		return
	case err != nil:
		utils.ResponseError(w, fmt.Errorf("cannot rename %q: %w", key, err))
		return
	}

	utils.Audit(r, "INFO", fmt.Sprintf("User %s renamed %q to %q in bucket %q", utils.AuditUser(r), key, newKey, bucket), map[string]interface{}{
		"event":  "object_rename",
		"bucket": bucket,
		"key":    key,
		"newKey": newKey,
		"moved":  moved,
	})
	utils.ResponseSuccess(w, map[string]interface{}{"key": newKey, "moved": moved})
}

// renameTarget returns the key that renaming key to name produces: same
// parent folder, new last segment (folders keep their trailing "/").
func renameTarget(key, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." || strings.Contains(name, "/") {
		return "", errors.New("enter a name without \"/\"")
	}

	isDir := strings.HasSuffix(key, "/")
	trimmed := strings.TrimSuffix(key, "/")
	parent := ""
	if i := strings.LastIndex(trimmed, "/"); i >= 0 {
		parent = trimmed[:i+1]
	}

	newKey := parent + name
	if isDir {
		newKey += "/"
	}
	if newKey == key {
		return "", errors.New("the new name is the same as the current one")
	}
	return newKey, nil
}

// renameObject moves key to newKey, refusing to overwrite. It returns the
// number of objects moved.
func renameObject(ctx context.Context, client s3API, bucket, key, newKey string) (int, error) {
	taken, err := keyExists(ctx, client, bucket, newKey)
	if err != nil {
		return 0, err
	}
	if taken {
		return 0, errNameTaken
	}

	if strings.HasSuffix(key, "/") {
		moved, err := moveObjectsWithPrefix(ctx, client, bucket, key, newKey)
		if err == nil && moved == 0 {
			return 0, errSourceMissing
		}
		return moved, err
	}

	head, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if isNotFound(err) {
		return 0, errSourceMissing
	}
	if err != nil {
		return 0, err
	}
	if err := moveSingleObject(ctx, client, bucket, key, newKey, aws.ToInt64(head.ContentLength)); err != nil {
		return 0, err
	}
	return 1, nil
}

// keyExists reports whether an object exists at key or, for a folder key
// (trailing "/"), whether any object lives under it.
func keyExists(ctx context.Context, client s3API, bucket, key string) (bool, error) {
	if strings.HasSuffix(key, "/") {
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:  aws.String(bucket),
			Prefix:  aws.String(key),
			MaxKeys: aws.Int32(1),
		})
		if err != nil {
			return false, err
		}
		return len(list.Contents) > 0, nil
	}

	_, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if isNotFound(err) {
		return false, nil
	}
	return err == nil, err
}
```

In `backend/router/router.go`, after the `DELETE /browse/{bucket}/{key...}` line:

```go
	router.HandleFunc("PATCH /browse/{bucket}/{key...}", browse.RenameObject)
```

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && gofmt -l . ; go vet ./... && go test ./...`
Expected: no gofmt output, `ok  khairul169/garage-webui/router`.

- [ ] **Step 6: Commit**

```bash
git add backend/router/object_ops.go backend/router/rename.go backend/router/rename_test.go backend/router/browse.go backend/router/router.go
git commit -m "feat(browse): add a rename endpoint and copy objects over 5 gib in parts."
```

---

### Task 6: Backend delete pagination, Range requests, object headers

**Files:**
- Modify: `backend/router/object_ops.go` (add `deleteObjectsWithPrefix`),
  `backend/router/browse.go` (`DeleteObject`, `GetOneObject`, new `writeObjectHeaders`)
- Create: `backend/router/browse_test.go`

**Interfaces:**
- Consumes: `s3API`, `memS3` (`ignoreDeletes`), `isNotFound`.
- Produces: `deleteObjectsWithPrefix(ctx, client s3API, bucket, prefix string) (int, error)`;
  `writeObjectHeaders(h http.Header, object *s3.GetObjectOutput, filename string, download bool) int`.
- API: `GET /browse/{bucket}/{key}?view=1|dl=1` honours `Range` (206 + `Content-Range`,
  `Accept-Ranges: bytes`; 416 for an unsatisfiable range); metadata `GET` returns 404 for a missing
  object; recursive `DELETE` returns `{"deleted": n}` and deletes every object under the folder.

- [ ] **Step 1: Write the failing tests**

`backend/router/browse_test.go`:

```go
package router

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestDeleteObjectsWithPrefixDeletesEveryPage(t *testing.T) {
	keys := []string{"keep.txt"}
	for i := 0; i < 2500; i++ {
		keys = append(keys, fmt.Sprintf("bulk/f-%04d.txt", i))
	}
	m := newMemS3(keys...)

	deleted, err := deleteObjectsWithPrefix(context.Background(), m, "b", "bulk/")
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 2500 || len(m.objects) != 1 || !m.has("keep.txt") {
		t.Errorf("deleted %d, %d objects left", deleted, len(m.objects))
	}
}

func TestDeleteObjectsWithPrefixStopsWhenNothingIsDeleted(t *testing.T) {
	m := newMemS3("bulk/a.txt", "bulk/b.txt")
	m.ignoreDeletes = true

	done := make(chan error, 1)
	go func() {
		_, err := deleteObjectsWithPrefix(context.Background(), m, "b", "bulk/")
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected an error when objects are not actually deleted")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("deleteObjectsWithPrefix looped forever")
	}
}

func TestWriteObjectHeaders(t *testing.T) {
	modified := time.Date(2026, 9, 27, 8, 0, 0, 0, time.UTC)
	full := &s3.GetObjectOutput{
		ContentType:   aws.String("video/mp4"),
		ContentLength: aws.Int64(1000),
		ETag:          aws.String(`"abc"`),
		LastModified:  &modified,
	}
	rec := httptest.NewRecorder()
	if status := writeObjectHeaders(rec.Header(), full, "clip.mp4", false); status != http.StatusOK {
		t.Errorf("status %d, want 200", status)
	}
	if rec.Header().Get("Accept-Ranges") != "bytes" || rec.Header().Get("Content-Length") != "1000" ||
		rec.Header().Get("Last-Modified") != "Sun, 27 Sep 2026 08:00:00 GMT" {
		t.Errorf("headers %v", rec.Header())
	}

	ranged := *full
	ranged.ContentLength = aws.Int64(10)
	ranged.ContentRange = aws.String("bytes 0-9/1000")
	rec = httptest.NewRecorder()
	if status := writeObjectHeaders(rec.Header(), &ranged, "clip.mp4", false); status != http.StatusPartialContent {
		t.Errorf("status %d, want 206", status)
	}
	if rec.Header().Get("Content-Range") != "bytes 0-9/1000" {
		t.Errorf("Content-Range %q", rec.Header().Get("Content-Range"))
	}

	rec = httptest.NewRecorder()
	writeObjectHeaders(rec.Header(), full, "report #1 (final)?.txt", true)
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="report #1 (final)?.txt"` {
		t.Errorf("Content-Disposition %q", got)
	}
	rec = httptest.NewRecorder()
	writeObjectHeaders(rec.Header(), full, "ünï.txt", true)
	if got := rec.Header().Get("Content-Disposition"); got != "attachment; filename*=utf-8''%C3%BCn%C3%AF.txt" {
		t.Errorf("Content-Disposition %q", got)
	}
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && go test ./router/ -run 'DeleteObjectsWithPrefix|WriteObjectHeaders'`
Expected: build failure — `undefined: deleteObjectsWithPrefix`.

- [ ] **Step 3: Implement paginated delete**

Append to `backend/router/object_ops.go`:

```go
// deleteObjectsWithPrefix deletes every object under prefix, 1,000 at a time
// (the S3 limit per DeleteObjects call), and returns how many were deleted.
func deleteObjectsWithPrefix(ctx context.Context, client s3API, bucket, prefix string) (int, error) {
	deleted := 0
	prevFirst := ""

	for {
		// Always list from the start: the previous batch is gone, so the
		// next objects are at the front again.
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket),
			Prefix: aws.String(prefix),
		})
		if err != nil {
			return deleted, err
		}
		if len(list.Contents) == 0 {
			return deleted, nil
		}

		first := aws.ToString(list.Contents[0].Key)
		if first == prevFirst {
			return deleted, fmt.Errorf("objects under %q could not be deleted", prefix)
		}
		prevFirst = first

		ids := make([]types.ObjectIdentifier, 0, len(list.Contents))
		for _, object := range list.Contents {
			ids = append(ids, types.ObjectIdentifier{Key: object.Key})
		}

		res, err := client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(bucket),
			Delete: &types.Delete{Objects: ids, Quiet: aws.Bool(true)},
		})
		if err != nil {
			return deleted, err
		}
		if len(res.Errors) > 0 {
			return deleted, fmt.Errorf("%s: %s", aws.ToString(res.Errors[0].Key), aws.ToString(res.Errors[0].Message))
		}
		deleted += len(ids)
	}
}
```

In `backend/router/browse.go` `DeleteObject`, replace the whole `if isDirectory && recursive { … }`
block with:

```go
	// Delete directory and its content
	if isDirectory && recursive {
		count, err := deleteObjectsWithPrefix(r.Context(), client, bucket, key)
		if err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot delete folder: %w", err))
			return
		}

		utils.Audit(r, "INFO", fmt.Sprintf("User %s deleted folder %q (%d object(s)) from bucket %q", utils.AuditUser(r), key, count, bucket), map[string]interface{}{
			"event":  "object_delete_folder",
			"bucket": bucket,
			"key":    key,
			"count":  count,
		})

		utils.ResponseSuccess(w, map[string]int{"deleted": count})
		return
	}
```

- [ ] **Step 4: Implement `writeObjectHeaders` and use it in `GetOneObject`**

Add to `backend/router/browse.go` (import `mime` from the standard library):

```go
// writeObjectHeaders copies an object's metadata onto the response and
// returns the status to send: 206 for a ranged read, 200 otherwise.
func writeObjectHeaders(h http.Header, object *s3.GetObjectOutput, filename string, download bool) int {
	if download {
		h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}
	h.Set("Cache-Control", "max-age=86400")
	h.Set("Accept-Ranges", "bytes")
	if object.LastModified != nil {
		h.Set("Last-Modified", object.LastModified.UTC().Format(http.TimeFormat))
	}
	if object.ContentType != nil {
		h.Set("Content-Type", *object.ContentType)
	} else {
		h.Set("Content-Type", "application/octet-stream")
	}
	if object.ContentLength != nil {
		h.Set("Content-Length", strconv.FormatInt(*object.ContentLength, 10))
	}
	if object.ETag != nil {
		h.Set("Etag", *object.ETag)
	}
	if object.ContentRange != nil {
		h.Set("Content-Range", *object.ContentRange)
		return http.StatusPartialContent
	}
	return http.StatusOK
}
```

In `GetOneObject`, make these replacements:

1. The metadata branch error handling becomes:

```go
		if err != nil {
			if isNotFound(err) {
				utils.ResponseErrorStatus(w, err, http.StatusNotFound)
			} else {
				utils.ResponseError(w, err)
			}
			return
		}
```

2. The `GetObject` call and its error handling become:

```go
	input := &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}
	// Pass ranged reads through so video/audio previews can seek.
	if rng := r.Header.Get("Range"); rng != "" && !thumbnail {
		input.Range = aws.String(rng)
	}
	object, err := client.GetObject(r.Context(), input)

	if err != nil {
		var ae smithy.APIError
		if errors.As(err, &ae) && ae.ErrorCode() == "NoSuchKey" {
			utils.ResponseErrorStatus(w, err, http.StatusNotFound)
			return
		}
		if errors.As(err, &ae) && ae.ErrorCode() == "InvalidRange" {
			utils.ResponseErrorStatus(w, err, http.StatusRequestedRangeNotSatisfiable)
			return
		}

		utils.ResponseError(w, err)
		return
	}
```

3. Delete the `if download { w.Header().Set("Content-Disposition", …) } else if thumbnail {` opener,
   keeping the thumbnail block as `if thumbnail { … }`.

4. Replace everything from `w.Header().Set("Cache-Control", "max-age=86400")` to the end of the
   function with:

```go
	w.WriteHeader(writeObjectHeaders(w.Header(), object, keys[len(keys)-1], download))
	// Headers are already sent, so a failed copy (usually the client going
	// away) can only be logged.
	if _, err := io.Copy(w, object.Body); err != nil {
		log.Printf("Cannot send %s/%s: %v", bucket, key, err)
	}
}
```

Add `"log"` and `"mime"` to the imports.

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && gofmt -l . ; go vet ./... && go test ./...`
Expected: no gofmt output, `ok  khairul169/garage-webui/router`.

- [ ] **Step 6: Commit**

```bash
git add backend/router/object_ops.go backend/router/browse.go backend/router/browse_test.go
git commit -m "fix(browse): delete every object in large folders and support ranged reads."
```

---

### Task 7: Pure browse helpers

**Files:**
- Create: `src/pages/buckets/manage/browse/browse-utils.ts`,
  `src/pages/buckets/manage/browse/browse-utils.test.ts`

**Interfaces:**
- Produces: `splitExtension(name): [string, string]`, `keyName(key): string`,
  `objectPath(bucket, key): string`, `type PreviewKind = "image" | "video" | "audio" | "pdf" |
  "text" | "none"`, `previewKind(name, contentType?, size?): PreviewKind`,
  `TEXT_PREVIEW_BYTES = 262144`, `selectRange(rows, selected, anchor, target, checked):
  { selected: string[]; changed: string[] }`, `describeKeys(keys): string`.

- [ ] **Step 1: Write the failing tests**

`src/pages/buckets/manage/browse/browse-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  describeKeys,
  keyName,
  objectPath,
  previewKind,
  selectRange,
  splitExtension,
} from "./browse-utils";

describe("splitExtension", () => {
  it("splits on the last dot", () => {
    expect(splitExtension("photo.final.jpg")).toEqual(["photo.final", ".jpg"]);
  });
  it("treats dotfiles and dotless names as having no extension", () => {
    expect(splitExtension(".env")).toEqual([".env", ""]);
    expect(splitExtension("README")).toEqual(["README", ""]);
  });
});

describe("keyName", () => {
  it("returns the last segment of files and folders", () => {
    expect(keyName("a/b/c.txt")).toBe("c.txt");
    expect(keyName("a/b/")).toBe("b");
    expect(keyName("top.txt")).toBe("top.txt");
  });
});

describe("objectPath", () => {
  it("percent-encodes each key segment but keeps the slashes", () => {
    expect(objectPath("my bucket", "docs/report #1 (final)?.txt")).toBe(
      "/browse/my%20bucket/docs/report%20%231%20(final)%3F.txt"
    );
    expect(objectPath("b", "ünï/%.txt")).toBe("/browse/b/%C3%BCn%C3%AF/%25.txt");
    expect(objectPath("b", "folder/")).toBe("/browse/b/folder/");
  });
});

describe("previewKind", () => {
  it("detects images, media, pdf and text", () => {
    expect(previewKind("a.PNG")).toBe("image");
    expect(previewKind("clip", "video/mp4")).toBe("video");
    expect(previewKind("song.mp3")).toBe("audio");
    expect(previewKind("doc.pdf")).toBe("pdf");
    expect(previewKind("data.json", null, 100)).toBe("text");
  });
  it("skips text previews for files of 1 MB or more", () => {
    expect(previewKind("big.log", "text/plain", 1024 * 1024)).toBe("none");
    expect(previewKind("small.log", "text/plain", 1024 * 1024 - 1)).toBe("text");
  });
  it("falls back to none for unknown types", () => {
    expect(previewKind("archive.zip", "application/zip")).toBe("none");
  });
});

describe("selectRange", () => {
  const rows = ["a", "b", "c", "d", "e"];

  it("selects every row between the anchor and the target", () => {
    const res = selectRange(rows, ["a"], "a", "d", true);
    expect([...res.selected].sort()).toEqual(["a", "b", "c", "d"]);
    expect(res.changed).toEqual(["b", "c", "d"]);
  });
  it("works upwards and orders changes from the anchor outward", () => {
    expect(selectRange(rows, ["e"], "e", "b", true).changed).toEqual(["d", "c", "b"]);
  });
  it("clears the range when the target is being unchecked", () => {
    const res = selectRange(rows, ["a", "b", "c", "d"], "a", "c", false);
    expect(res.selected).toEqual(["d"]);
  });
  it("toggles only the target when the anchor is not on the page", () => {
    const res = selectRange(rows, ["x"], "gone", "c", true);
    expect([...res.selected].sort()).toEqual(["c", "x"]);
    expect(res.changed).toEqual(["c"]);
  });
});

describe("describeKeys", () => {
  it("names a single file or folder", () => {
    expect(describeKeys(["a/b.txt"])).toBe('"b.txt"');
    expect(describeKeys(["a/pics/"])).toBe('the folder "pics" and everything in it');
  });
  it("counts mixed selections", () => {
    expect(describeKeys(["a.txt", "b.txt", "c/"])).toBe(
      "2 files and 1 folder and everything in it"
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./browse-utils"`.

- [ ] **Step 3: Implement `browse-utils.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test`
Expected: all tests pass (confirm + browse-utils).

- [ ] **Step 5: Commit**

```bash
git add src/pages/buckets/manage/browse/browse-utils.ts src/pages/buckets/manage/browse/browse-utils.test.ts
git commit -m "feat(browse): add helpers for names, urls, previews and range selection."
```

---

### Task 8: UI primitives

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (add `@radix-ui/react-context-menu`)
- Create: `src/components/ui/context-menu.tsx`, `src/hooks/useMediaQuery.ts`,
  `src/hooks/useFillHeight.ts`
- Modify: `src/stores/app-store.ts`, `src/lib/api.ts`, `src/app/styles.css`

**Interfaces:**
- Produces: `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`,
  `ContextMenuSeparator` (shadcn/Radix); `useMediaQuery(query: string): boolean`;
  `useFillHeight(ref: RefObject<HTMLElement>, minHeight?: number): number | undefined`;
  `appStore.browsePaneCollapsed` (state) + `appStore.setBrowsePaneCollapsed(value: boolean)`;
  `api.patch<T>(url, options)`; CSS utility class `animate-row-flash`.

- [ ] **Step 1: Add the Radix context menu dependency**

Run: `pnpm add -w @radix-ui/react-context-menu@^2.2.2`

- [ ] **Step 2: Create `src/components/ui/context-menu.tsx`**

```tsx
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { ComponentPropsWithoutRef, ElementRef, forwardRef } from "react";
import { cn } from "@/lib/utils";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuContent = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        "z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));

const ContextMenuItem = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  />
));

const ContextMenuSeparator = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
};
```

- [ ] **Step 3: Create the two hooks**

`src/hooks/useMediaQuery.ts`:

```ts
import { useCallback, useSyncExternalStore } from "react";

/** Whether the CSS media query currently matches; updates live. */
export const useMediaQuery = (query: string) => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
};
```

`src/hooks/useFillHeight.ts`:

```ts
import { RefObject, useLayoutEffect, useState } from "react";

/** Height that makes `ref`'s element reach the bottom of the viewport, less
 * the main content area's bottom padding. Recomputed on window resize. */
export const useFillHeight = (ref: RefObject<HTMLElement>, minHeight = 480) => {
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const main = el.closest("main");
      const scrollTop = main?.scrollTop ?? 0;
      const padding = main
        ? parseFloat(getComputedStyle(main).paddingBottom) || 0
        : 0;
      const top = el.getBoundingClientRect().top + scrollTop;
      setHeight(Math.max(minHeight, Math.floor(window.innerHeight - top - padding)));
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [ref, minHeight]);

  return height;
};
```

- [ ] **Step 4: Store flag, `api.patch`, highlight animation**

`src/stores/app-store.ts`: add `browsePaneCollapsed: boolean;` to `AppState`,
`browsePaneCollapsed: false,` to the initial state, and to `appStore`:

```ts
  setBrowsePaneCollapsed: (browsePaneCollapsed: boolean) =>
    store.setState({ browsePaneCollapsed }),
```

`src/lib/api.ts`: add after `put` (`unknown`, not `any`, so it adds no lint error — callers
pass the response type explicitly):

```ts
  async patch<T = unknown>(url: string, options?: Partial<FetchOptions>) {
    return this.fetch<T>(url, {
      ...options,
      method: "PATCH",
    });
  },
```

`src/app/styles.css`: append at the end of the file:

```css
/* Rows whose selection changed through a shift-click range flash briefly.
   Only a `from` frame, so the row settles on its normal (selected or not)
   background; `backwards` holds the tint during the stagger delay. */
@keyframes row-flash {
  from {
    background-color: hsl(var(--primary) / 0.2);
  }
}

.animate-row-flash {
  animation: row-flash 600ms ease-out backwards;
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec tsc -b && pnpm test`
Expected: clean, tests pass.

```bash
git add package.json pnpm-lock.yaml src/components/ui/context-menu.tsx src/hooks/useMediaQuery.ts src/hooks/useFillHeight.ts src/stores/app-store.ts src/lib/api.ts src/app/styles.css
git commit -m "feat(ui): add a context menu, layout hooks and a row highlight animation."
```

---

### Task 9: Browse building blocks (context, menus, rename, preview)

All new files; nothing renders them until Task 10.

**Files:**
- Create: `src/pages/buckets/manage/browse/browse-context.ts`,
  `src/pages/buckets/manage/browse/use-delete-keys.ts`,
  `src/pages/buckets/manage/browse/use-object-menu-items.ts`,
  `src/pages/buckets/manage/browse/object-menu.tsx`,
  `src/pages/buckets/manage/browse/file-type-icon.tsx`,
  `src/pages/buckets/manage/browse/rename-dialog.tsx`,
  `src/pages/buckets/manage/browse/search-box.tsx`,
  `src/pages/buckets/manage/browse/preview-pane.tsx`
- Modify: `src/pages/buckets/manage/browse/hooks.ts`, `src/pages/buckets/manage/browse/types.ts`

**Interfaces:**
- Consumes: Task 3 `confirmDialog`; Task 7 helpers; Task 8 context menu, `api.patch`.
- Produces:
  - `BrowseContextValue = { prefix: string; previewKey: string | null; openFolder(prefix: string):
    void; openPreview(key: string): void; openRename(key: string): void; openMove(keys: string[]):
    void; deleteKeys(keys: string[]): Promise<boolean>; isDeleting: boolean }`, `BrowseContext`,
    `useBrowseContext()`.
  - `useDeleteKeys(onDeleted: (keys: string[]) => void): { run(keys): Promise<boolean>; isPending:
    boolean }`.
  - `type MenuTarget = { kind: "entry"; key: string } | { kind: "selection"; keys: string[] }`,
    `useObjectMenuItems(target): MenuItemSpec[]`.
  - Components: `ObjectRowMenu({ target })`, `ObjectContextMenu({ target, children })`,
    `FileTypeIcon({ name, ...LucideProps })` (default export), `RenameDialog({ objectKey, onClose,
    onRenamed(oldKey, newKey) })`, `SearchBox({ value, onChange })`, `PreviewPane({ objectKey,
    floating, onClose })`.
  - Hooks: `useRenameObject(bucket, options)`, `useObjectInfo(bucket, key)`,
    `useTextPreview(url, etag)`; `UseBrowserObjectOptions.search`, `GetObjectsResult.truncated`.

- [ ] **Step 1: Types and data hooks**

`types.ts`: add `search: string;` to `UseBrowserObjectOptions` and `truncated?: boolean;` to
`GetObjectsResult`, and append:

```ts
/** Object metadata as returned by GET /browse/{bucket}/{key} (S3 HeadObject). */
export type ObjectInfo = {
  ContentLength?: number;
  ContentType?: string;
  ETag?: string;
  LastModified?: string;
};
```

`hooks.ts`: change the `api` import to `import api, { APIError } from "@/lib/api";`, add
`ObjectInfo` to the `./types` import, add `import { objectPath, TEXT_PREVIEW_BYTES } from
"./browse-utils";`, and append:

```ts
export const useRenameObject = (
  bucket: string,
  options?: UseMutationOptions<
    { key: string; moved: number },
    APIError,
    { key: string; name: string }
  >
) => {
  return useMutation({
    mutationFn: ({ key, name }) =>
      api.patch<{ key: string; moved: number }>(objectPath(bucket, key), {
        body: { name },
      }),
    ...options,
  });
};

export const useObjectInfo = (bucket: string, key: string | null) => {
  return useQuery<ObjectInfo, APIError>({
    queryKey: ["browse", bucket, "info", key],
    queryFn: () => api.get<ObjectInfo>(objectPath(bucket, key!)),
    enabled: !!key,
    retry: false,
  });
};

/** The first TEXT_PREVIEW_BYTES of a text file, via a ranged request. */
export const useTextPreview = (url: string | null, etag?: string) => {
  return useQuery({
    queryKey: ["text-preview", url, etag],
    enabled: !!url,
    retry: false,
    queryFn: async () => {
      const res = await fetch(url!, {
        credentials: "include",
        headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  });
};
```

- [ ] **Step 2: Context and delete hook**

`browse-context.ts`:

```ts
import { createContext, useContext } from "react";

export type BrowseContextValue = {
  prefix: string;
  previewKey: string | null;
  openFolder: (prefix: string) => void;
  openPreview: (key: string) => void;
  openRename: (key: string) => void;
  openMove: (keys: string[]) => void;
  deleteKeys: (keys: string[]) => Promise<boolean>;
  isDeleting: boolean;
};

export const BrowseContext = createContext<BrowseContextValue | null>(null);

export const useBrowseContext = () => {
  const value = useContext(BrowseContext);
  if (!value) {
    throw new Error("useBrowseContext must be used inside the Browse tab");
  }
  return value;
};
```

`use-delete-keys.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { handleError } from "@/lib/utils";
import { useBucketContext } from "../context";
import { useDeleteObjects } from "./hooks";
import { describeKeys, keyName } from "./browse-utils";

/** Asks for confirmation, then deletes the keys (folders recursively).
 * `onDeleted` runs after a successful delete. */
export const useDeleteKeys = (onDeleted: (keys: string[]) => void) => {
  const { bucketName } = useBucketContext();
  const queryClient = useQueryClient();
  const deleteObjects = useDeleteObjects(bucketName);

  const run = async (keys: string[]) => {
    if (!keys.length) return false;

    const ok = await confirmDialog({
      title:
        keys.length === 1
          ? `Delete ${keys[0].endsWith("/") ? "folder" : "file"}?`
          : `Delete ${keys.length} items?`,
      description: `This permanently deletes ${describeKeys(keys)}. This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return false;

    try {
      await deleteObjects.mutateAsync(keys);
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      // Refresh even after a partial failure so the list matches reality.
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
    }

    toast.success(
      keys.length === 1 ? `Deleted "${keyName(keys[0])}"` : `Deleted ${keys.length} items`
    );
    onDeleted(keys);
    return true;
  };

  return { run, isPending: deleteObjects.isPending };
};
```

- [ ] **Step 3: Shared menu items and the two menus**

`use-object-menu-items.ts`:

```ts
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
```

`object-menu.tsx`:

```tsx
import { Fragment, ReactNode } from "react";
import { EllipsisVertical } from "lucide-react";
import Button from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { MenuTarget, useObjectMenuItems } from "./use-object-menu-items";

const destructiveClass = "text-destructive focus:text-destructive";

/** The ⋯ button menu at the end of each row. */
export const ObjectRowMenu = ({ target }: { target: MenuTarget }) => {
  const items = useObjectMenuItems(target);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={EllipsisVertical}
          variant="ghost"
          size="icon"
          aria-label="More actions"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(item.destructive && destructiveClass)}
            >
              <item.icon /> {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Wraps a row so right-clicking it opens the same actions. */
export const ObjectContextMenu = ({
  target,
  children,
}: {
  target: MenuTarget;
  children: ReactNode;
}) => {
  const items = useObjectMenuItems(target);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(item.destructive && destructiveClass)}
            >
              <item.icon /> {item.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
};
```

- [ ] **Step 4: File-type icon and search box**

`file-type-icon.tsx`:

```tsx
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
```

`search-box.tsx`:

```tsx
import { Search, X } from "lucide-react";
import Input from "@/components/ui/input";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const SearchBox = ({ value, onChange }: Props) => (
  <div className="relative">
    <Search
      size={15}
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search this folder…"
      aria-label="Search this folder"
      className="h-9 w-40 pl-8 pr-8 md:w-56"
    />
    {value ? (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <X size={15} />
      </button>
    ) : null}
  </div>
);

export default SearchBox;
```

- [ ] **Step 5: Rename dialog**

`rename-dialog.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { handleError } from "@/lib/utils";
import { useBucketContext } from "../context";
import { keyName, splitExtension } from "./browse-utils";
import { useRenameObject } from "./hooks";

type Props = {
  /** Key being renamed; the dialog is open while this is set. */
  objectKey: string | null;
  onClose: () => void;
  onRenamed: (oldKey: string, newKey: string) => void;
};

const RenameDialog = ({ objectKey, onClose, onRenamed }: Props) => {
  const { bucketName } = useBucketContext();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isDir = !!objectKey?.endsWith("/");
  const current = objectKey ? keyName(objectKey) : "";

  useEffect(() => {
    if (!objectKey) return;
    setName(current);
    setError(null);
    // Select the name up to its extension, like a desktop file manager.
    const timer = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(
        0,
        isDir ? current.length : splitExtension(current)[0].length
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [objectKey, current, isDir]);

  const rename = useRenameObject(bucketName, {
    onSuccess: (res, vars) => {
      toast.success(`Renamed to "${keyName(res.key)}"`);
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
      onRenamed(vars.key, res.key);
      onClose();
    },
    onError: (err) => {
      if (err.status === 400 || err.status === 409) {
        setError(err.message);
      } else {
        handleError(err);
      }
    },
  });

  const validate = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "Enter a name";
    if (trimmed.includes("/")) return 'Names can\'t contain "/"';
    if (trimmed === "." || trimmed === "..") return "That name isn't allowed";
    if (trimmed === current) return "Enter a different name";
    return null;
  };

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const problem = validate(name);
    if (problem) {
      setError(problem);
      return;
    }
    if (objectKey) {
      rename.mutate({ key: objectKey, name: name.trim() });
    }
  };

  return (
    <Dialog open={!!objectKey} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {isDir ? "folder" : "file"}</DialogTitle>
          {isDir ? (
            <DialogDescription>
              Everything inside the folder moves to the new name. Large
              folders can take a while.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
          <Input
            ref={inputRef}
            value={name}
            aria-label="New name"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </form>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit()} loading={rename.isPending}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameDialog;
```

- [ ] **Step 6: Preview pane**

`preview-pane.tsx`:

```tsx
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
                url={url + "?view=1"}
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
                {info.data.ETag?.replace(/"/g, "") || "—"}
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
              onClick={() => window.open(url + "?view=1", "_blank")}
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
```

- [ ] **Step 7: Verify and commit**

Run: `pnpm exec tsc -b && pnpm test`
Expected: clean, tests pass.

```bash
git add src/pages/buckets/manage/browse/browse-context.ts src/pages/buckets/manage/browse/use-delete-keys.ts src/pages/buckets/manage/browse/use-object-menu-items.ts src/pages/buckets/manage/browse/object-menu.tsx src/pages/buckets/manage/browse/file-type-icon.tsx src/pages/buckets/manage/browse/rename-dialog.tsx src/pages/buckets/manage/browse/search-box.tsx src/pages/buckets/manage/browse/preview-pane.tsx src/pages/buckets/manage/browse/hooks.ts src/pages/buckets/manage/browse/types.ts
git commit -m "feat(browse): add menus, rename dialog, search box and preview pane components."
```

---

### Task 10: Wire the new Browse tab

**Files:**
- Modify (full rewrites below): `src/pages/buckets/manage/browse/browse-tab.tsx`,
  `src/pages/buckets/manage/browse/object-list.tsx`,
  `src/pages/buckets/manage/browse/bulk-actions.tsx`
- Modify: `src/pages/buckets/manage/browse/object-list-navigator.tsx` (search slot),
  `src/pages/buckets/manage/page.tsx` (full width)
- Delete: `src/pages/buckets/manage/browse/object-actions.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3, 7, 8, 9.
- Produces: the finished Browse tab. `ObjectList` props become `{ search: string; selected:
  string[]; onSelectedChange(keys: string[]): void }`; `BulkActions` props `{ selected; onClear }`;
  `ObjectListNavigator` gains `search?: React.ReactNode`.

- [ ] **Step 1: Full-width manage page and navigator search slot**

`src/pages/buckets/manage/page.tsx`: change `<div className="container">` to `<div>`.

`object-list-navigator.tsx`: add `search?: React.ReactNode;` to `Props`, destructure `search`, and
render it before `{actions}` inside the last `order-2 …` div:

```tsx
      <div className="order-2 flex flex-1 flex-row items-center justify-end gap-1 md:order-3 md:flex-initial">
        {search}
        {actions}
      </div>
```

- [ ] **Step 2: Rewrite `bulk-actions.tsx`**

```tsx
import Button from "@/components/ui/button";
import { FolderInput, Share2, Trash, X } from "lucide-react";
import { useBrowseContext } from "./browse-context";
import { shareDialog } from "./share-dialog";

type Props = {
  selected: string[];
  onClear: () => void;
};

const BulkActions = ({ selected, onClear }: Props) => {
  const browse = useBrowseContext();
  const files = selected.filter((key) => !key.endsWith("/"));

  if (!selected.length) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        icon={X}
        aria-label="Clear selection"
        onClick={onClear}
        className="h-7 w-7"
      />
      <p className="flex-1 text-sm font-medium">{selected.length} selected</p>

      <Button
        variant="outline"
        size="sm"
        icon={FolderInput}
        onClick={() => browse.openMove(selected)}
      >
        Move
      </Button>

      <Button
        variant="outline"
        size="sm"
        icon={Share2}
        disabled={!files.length}
        title={!files.length ? "Select at least one file to share" : undefined}
        onClick={() => shareDialog.open({ keys: files })}
      >
        Share
      </Button>

      <Button
        variant="destructive"
        size="sm"
        icon={Trash}
        loading={browse.isDeleting}
        onClick={() => browse.deleteKeys(selected)}
      >
        Delete
      </Button>
    </div>
  );
};

export default BulkActions;
```

- [ ] **Step 3: Rewrite `object-list.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { CircleXIcon, DownloadIcon, Folder, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/api";
import { cn, dayjs, readableBytes } from "@/lib/utils";
import Button from "@/components/ui/button";
import Checkbox from "@/components/ui/checkbox";
import Pagination from "@/components/ui/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBucketContext } from "../context";
import { useBrowseContext } from "./browse-context";
import { keyName, objectPath, selectRange, splitExtension } from "./browse-utils";
import FileTypeIcon from "./file-type-icon";
import { useBrowseObjects } from "./hooks";
import { ObjectContextMenu, ObjectRowMenu } from "./object-menu";
import { MenuTarget } from "./use-object-menu-items";

const PAGE_SIZE = 50;
const THUMBNAIL_EXTS = ["jpg", "jpeg", "png", "gif"];

type Props = {
  search: string;
  selected: string[];
  onSelectedChange: (keys: string[]) => void;
};

type Row = {
  key: string;
  isDir: boolean;
  size?: number;
  lastModified?: Date;
};

const ObjectList = ({ search, selected, onSelectedChange }: Props) => {
  const { bucketName } = useBucketContext();
  const browse = useBrowseContext();
  // S3 listing is cursor-based: cursors[i] is the token that loads page
  // i + 2, recorded as the user pages forward so Prev works.
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<string[]>([]);
  // Last checkbox clicked; shift-clicking another selects the rows between.
  const anchorRef = useRef<string | null>(null);
  const [flash, setFlash] = useState<{ id: number; keys: string[] }>({
    id: 0,
    keys: [],
  });

  const { data, error, isLoading } = useBrowseObjects(bucketName, {
    prefix: browse.prefix,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(page > 1 ? { next: cursors[page - 2] } : {}),
  });

  const rows: Row[] = [
    ...(data?.prefixes || []).map((key) => ({ key, isDir: true })),
    ...(data?.objects || []).map((o) => ({
      key: (data?.prefix || "") + o.objectKey,
      isDir: false,
      size: o.size,
      lastModified: o.lastModified,
    })),
  ];
  const allKeys = rows.map((r) => r.key);

  // Step back if the current page was emptied (e.g. after a bulk delete).
  useEffect(() => {
    if (data && page > 1 && rows.length === 0) {
      setPage((p) => p - 1);
    }
  }, [data, page, rows.length]);

  const onPageChange = (value: number) => {
    if (value > page) {
      if (!data?.nextToken) return;
      const token = data.nextToken;
      setCursors((prev) => [...prev.slice(0, page - 1), token]);
    }
    setPage(value);
    anchorRef.current = null;
    onSelectedChange([]);
  };

  const selectedOnPage = allKeys.filter((k) => selected.includes(k)).length;
  const allSelected = allKeys.length > 0 && selectedOnPage === allKeys.length;

  const toggleAll = () => {
    anchorRef.current = null;
    onSelectedChange(allSelected ? [] : allKeys);
  };

  const onCheckboxClick = (key: string, e: React.MouseEvent) => {
    const checked = !selected.includes(key);
    const anchor = anchorRef.current;
    anchorRef.current = key;

    if (e.shiftKey && anchor && anchor !== key) {
      const res = selectRange(allKeys, selected, anchor, key, checked);
      onSelectedChange(res.selected);
      setFlash((f) => ({ id: f.id + 1, keys: res.changed }));
      return;
    }
    onSelectedChange(
      checked ? [...selected, key] : selected.filter((k) => k !== key)
    );
  };

  // Right-clicking a row that's part of a multi-selection acts on all of it.
  const menuTarget = (key: string): MenuTarget =>
    selected.length > 1 && selected.includes(key)
      ? { kind: "selection", keys: selected }
      : { kind: "entry", key };

  const firstItem = (page - 1) * PAGE_SIZE + 1;
  const range = rows.length
    ? `Items ${firstItem}–${firstItem + rows.length - 1}`
    : "No items";
  const summary = search ? `Results for "${search}" · ${range}` : range;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {data?.truncated ? (
        <p className="shrink-0 border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Results may be incomplete — narrow your search.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))] [&_tr]:border-0">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all"
                  className="align-middle"
                  checked={
                    allSelected
                      ? true
                      : selectedOnPage > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAll}
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
                    <Loader2 size={28} className="animate-spin text-muted-foreground" />
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
            ) : !rows.length ? (
              <tr>
                <td className="py-16 text-center text-muted-foreground" colSpan={5}>
                  {search ? `No matches for "${search}"` : "No objects"}
                </td>
              </tr>
            ) : null}

            {rows.map((row) => {
              const name = keyName(row.key);
              const [base, ext] = row.isDir ? [name, ""] : splitExtension(name);
              const url = API_URL + objectPath(bucketName, row.key);
              const isSelected = selected.includes(row.key);
              const flashIndex = flash.keys.indexOf(row.key);

              return (
                <ObjectContextMenu
                  // A new key restarts the highlight animation.
                  key={flashIndex >= 0 ? `${row.key}:${flash.id}` : row.key}
                  target={menuTarget(row.key)}
                >
                  <TableRow
                    data-state={isSelected ? "selected" : undefined}
                    data-active={browse.previewKey === row.key || undefined}
                    className={cn(
                      "group data-[active]:bg-accent data-[active]:shadow-[inset_2px_0_0_hsl(var(--primary))]",
                      flashIndex >= 0 && "animate-row-flash"
                    )}
                    style={
                      flashIndex >= 0
                        ? { animationDelay: `${flashIndex * 15}ms` }
                        : undefined
                    }
                  >
                    <td className="w-10 p-3">
                      <Checkbox
                        aria-label={`Select ${name}`}
                        className="align-middle"
                        checked={isSelected}
                        // Shift-click would otherwise select text across rows.
                        onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                        onClick={(e) => onCheckboxClick(row.key, e)}
                      />
                    </td>
                    <td
                      className="cursor-pointer p-3"
                      role="button"
                      onClick={() =>
                        row.isDir
                          ? browse.openFolder(row.key)
                          : browse.openPreview(row.key)
                      }
                    >
                      <span className="flex w-full items-center font-normal">
                        {row.isDir ? (
                          <Folder size={20} className="mr-2 shrink-0 text-muted-foreground" />
                        ) : (
                          <RowIcon name={name} url={url} />
                        )}
                        <span className="max-w-[40vw] truncate">{base}</span>
                        {ext ? <span className="text-muted-foreground">{ext}</span> : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {row.isDir ? null : readableBytes(row.size)}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {row.lastModified ? dayjs(row.lastModified).fromNow() : null}
                    </td>
                    <td className="w-auto !p-0">
                      <span className="flex w-full flex-row justify-end gap-1 pr-2">
                        {!row.isDir ? (
                          <Button
                            icon={DownloadIcon}
                            variant="ghost"
                            size="icon"
                            aria-label={`Download ${name}`}
                            onClick={() => window.open(url + "?dl=1", "_blank")}
                          />
                        ) : null}
                        <ObjectRowMenu target={{ kind: "entry", key: row.key }} />
                      </span>
                    </td>
                  </TableRow>
                </ObjectContextMenu>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {data ? (
        <Pagination
          className="shrink-0 border-t px-3 py-2"
          page={page}
          hasNext={!!data.nextToken}
          onPageChange={onPageChange}
          summary={summary}
        />
      ) : null}
    </div>
  );
};

const RowIcon = ({ name, url }: { name: string; url: string }) => {
  const ext = splitExtension(name)[1].slice(1).toLowerCase();
  if (THUMBNAIL_EXTS.includes(ext)) {
    return (
      <img
        src={url + "?thumb=1"}
        alt=""
        loading="lazy"
        className="mr-2 size-5 shrink-0 overflow-hidden object-cover"
      />
    );
  }
  return <FileTypeIcon name={name} size={20} className="mr-2 shrink-0 text-muted-foreground" />;
};

export default ObjectList;
```

- [ ] **Step 4: Rewrite `browse-tab.tsx`**

```tsx
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
```

Note: the hooks above all run before the early `return` for buckets without a read/write key.

- [ ] **Step 5: Delete `object-actions.tsx` and run the checks**

Run:

```bash
git rm src/pages/buckets/manage/browse/object-actions.tsx
pnpm exec tsc -b && pnpm test
grep -rn "window.confirm" src --include=*.tsx ; echo "confirm calls left: $?"
pnpm exec eslint . 2>&1 | tail -1
```

Expected: tsc clean; tests pass; grep finds nothing (`confirm calls left: 1`); ESLint summary
**≤ 73 problems**. If the count rose, fix the new findings in the files this task touched.

- [ ] **Step 6: Smoke-check in the browser, then commit**

Run: `/var/tmp/fm-e2e/serve.sh && cd /var/tmp/fm-e2e/pw && PLAYWRIGHT_BROWSERS_PATH=/var/tmp/fm-e2e/pw/browsers node share-bug.mjs chromium`
Expected: `ok   share dialog opened from a row menu stays open` (the ⋯ button is still the row's
last button).

```bash
git add -A src/pages/buckets/manage
git commit -m "feat(browse): wire search, context menus, range selection and the details pane."
```

---

### Task 11: Verify in Chromium and Firefox, large rename, docs, teardown

**Files:**
- Create: `/var/tmp/fm-e2e/pw/verify.mjs` (outside the repo)
- Modify: `README.md` (Object management section)

**Interfaces:**
- Consumes: the harness (Task 1) and the finished tab (Task 10).

- [ ] **Step 1: Write the verification script**

`/var/tmp/fm-e2e/pw/verify.mjs`:

```js
import { openApp, browseUrl, row, check, BASE } from "./lib.mjs";

const name = process.argv[2] || "chromium";
const shots = `/var/tmp/fm-e2e/shots/${name}`;
const { mkdirSync } = await import("fs");
mkdirSync(shots, { recursive: true });

const { browser, ctx, page, errors } = await openApp(name);
const nameCell = (text) => row(page, text).locator("td").nth(1);
const pane = page.getByRole("complementary", { name: "File details" });

// Pinned header and pagination while the list scrolls
await page.goto(browseUrl("many/"));
await row(page, "file-001").waitFor();
const scroller = page.locator("div.overflow-auto", { has: page.locator("table") });
await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
check(await page.getByRole("columnheader", { name: "Name" }).isVisible(), "column header stays visible");
check(await page.getByRole("navigation", { name: "Pagination" }).isVisible(), "pagination bar stays visible");
check(
  await page.evaluate(() => {
    const main = document.querySelector("main");
    return main.scrollHeight <= main.clientHeight + 1;
  }),
  "the page itself does not scroll"
);
await page.screenshot({ path: `${shots}/1-list.png` });
await scroller.evaluate((el) => el.scrollTo(0, 0));

// Shift-click range selection and highlight
await page.getByRole("checkbox", { name: "Select file-003.txt" }).click();
await page.getByRole("checkbox", { name: "Select file-008.txt" }).click({ modifiers: ["Shift"] });
check(await page.getByText("6 selected").isVisible(), "shift-click selects rows 3–8");
check(
  await row(page, "file-005").evaluate((el) => el.classList.contains("animate-row-flash")),
  "range rows play the highlight"
);
await page.getByRole("checkbox", { name: "Select file-006.txt" }).click({ modifiers: ["Shift"] });
check(await page.getByText("3 selected").isVisible(), "shift-click on a selected row clears the range");

// Right-click on a selected row acts on the selection
await row(page, "file-004").click({ button: "right" });
check(await page.getByRole("menuitem", { name: "Move 3 items" }).isVisible(), "context menu acts on the selection");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Clear selection" }).click();

// Search across pages, case-insensitively
await page.getByRole("textbox", { name: "Search this folder" }).fill("FILE-11");
await page.getByText('Results for "FILE-11"').waitFor();
check((await page.locator("tbody tr").count()) === 10, "search finds file-110…119 from page 3");
await page.getByRole("button", { name: "Clear search" }).click();
await row(page, "file-001").waitFor();

// Docked details pane
await page.goto(browseUrl("preview/"));
check(await page.getByText("Select a file to see its preview and details").isVisible(), "docked pane shows its empty state");
await nameCell("photo").click();
await pane.getByRole("img", { name: "photo.png" }).waitFor();
check(await pane.getByText("image/png").isVisible(), "pane shows image preview and content type");
await page.screenshot({ path: `${shots}/2-pane-image.png` });
await nameCell("archive").click();
await pane.getByText("application/zip").waitFor();
check((await pane.locator("pre, img").count()) === 0, "unpreviewable file shows an icon");
await nameCell("report #1").click();
await pane.getByText("special characters").waitFor();
check(true, "special-character names preview correctly");
const dl = await ctx.request.get(`${BASE}/api/browse/e2e/preview/${encodeURIComponent("report #1 (final)?.txt")}?dl=1`);
check(dl.headers()["content-disposition"]?.includes("report #1 (final)?.txt"), "download keeps the special-character filename");
await nameCell("notes").click();
await pane.getByText("hello from notes").waitFor();
check(true, "text preview renders");

// Rename the previewed file via the context menu, including a conflict
await row(page, "notes").click({ button: "right" });
await page.getByRole("menuitem", { name: "Rename" }).click();
const dialog = page.getByRole("dialog");
await dialog.getByRole("textbox", { name: "New name" }).fill("data.json");
await dialog.getByRole("button", { name: "Rename" }).click();
await dialog.getByText("already exists").waitFor();
check(true, "rename refuses to overwrite an existing file");
await dialog.getByRole("textbox", { name: "New name" }).fill("notes-renamed.txt");
await dialog.getByRole("button", { name: "Rename" }).click();
await row(page, "notes-renamed").waitFor();
check(await pane.getByText("notes-renamed.txt").first().isVisible(), "pane follows the renamed file");

// Share from a row menu stays open
await row(page, "data.json").getByRole("button", { name: "More actions" }).click();
await page.getByRole("menuitem", { name: "Share" }).click();
await page.waitForTimeout(800);
check(await page.getByRole("dialog").isVisible(), "share dialog from a row menu stays open");
await page.keyboard.press("Escape");

// Delete the previewed file with the confirmation dialog
await nameCell("data.json").click();
await pane.getByText("application/json").waitFor();
await row(page, "data.json").click({ button: "right" });
await page.getByRole("menuitem", { name: "Delete" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
check(await row(page, "data.json").isVisible(), "cancelled delete keeps the file");
await row(page, "data.json").click({ button: "right" });
await page.getByRole("menuitem", { name: "Delete" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
await row(page, "data.json").waitFor({ state: "detached" });
check(await page.getByText("Select a file to see its preview and details").isVisible(), "pane closes when its file is deleted");

// Collapse and restore the docked pane
await page.getByRole("button", { name: "Hide details" }).first().click();
check(await pane.isHidden(), "docked pane collapses");
await page.getByRole("button", { name: "Show details" }).click();
check(await pane.isVisible(), "docked pane comes back");

// Rename a folder
await page.goto(browseUrl("folders/"));
await row(page, "alpha").click({ button: "right" });
await page.getByRole("menuitem", { name: "Rename" }).click();
await page.getByRole("dialog").getByRole("textbox", { name: "New name" }).fill("beta");
await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
await row(page, "beta").waitFor();
await nameCell("beta").click();
check(await row(page, "inner.txt").isVisible(), "folder rename moves its contents");

// Delete a folder with 1,100 objects
await page.goto(browseUrl(""));
await row(page, "bulk").click({ button: "right" });
await page.getByRole("menuitem", { name: "Delete" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
await row(page, "bulk").waitFor({ state: "detached", timeout: 60000 });
const left = await (await ctx.request.get(`${BASE}/api/browse/e2e?prefix=bulk/&limit=10`)).json();
check(left.prefixes.length + left.objects.length === 0, "all 1,100 objects in the folder were deleted");

// Bucket menu uses the confirmation dialog too
await page.goto(browseUrl("").replace("?tab=browse&prefix=", "?"));
await page.getByRole("button").filter({ has: page.locator("svg.lucide-ellipsis-vertical") }).first().click();
await page.getByRole("menuitem", { name: /remove/i }).click();
check(await page.getByRole("dialog").getByText("Remove this bucket?").isVisible(), "bucket removal asks in-app");
await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

// Floating pane on a narrow screen
const narrow = await openApp(name, { width: 1024, height: 800 });
const npane = narrow.page.getByRole("complementary", { name: "File details" });
await narrow.page.goto(browseUrl("preview/"));
await row(narrow.page, "photo").waitFor();
check(await npane.isHidden(), "no pane until a file is opened on narrow screens");
await row(narrow.page, "photo").locator("td").nth(1).click();
await npane.waitFor();
check((await npane.evaluate((el) => getComputedStyle(el).position)) === "absolute", "narrow pane floats over the list");
await narrow.page.screenshot({ path: `${shots}/3-floating.png` });
await narrow.page.keyboard.press("Escape");
check(await npane.isHidden(), "Esc closes the floating pane");
await narrow.browser.close();

check(errors.length === 0 && narrow.errors.length === 0, `no page errors (${[...errors, ...narrow.errors].join("; ")})`);
await browser.close();
```

- [ ] **Step 2: Rebuild, then run it in both browsers with fresh data each time**

Run:

```bash
/var/tmp/fm-e2e/serve.sh
cd /var/tmp/fm-e2e/pw
for b in chromium firefox; do
  /var/tmp/fm-e2e/seed.sh >/dev/null
  PLAYWRIGHT_BROWSERS_PATH=/var/tmp/fm-e2e/pw/browsers node verify.mjs $b
done
```

Expected: every line `ok`, in both browsers. `seed.sh` wipes and re-creates the test folders, so
the second run doesn't trip over names the first run renamed or deleted. Look at the screenshots
in `/var/tmp/fm-e2e/shots/<browser>/` — layout, pinned bars, docked and floating pane — in light
and dark mode (toggle with the header's theme button if needed).

- [ ] **Step 3: Rename a 6 GiB file and check ranged reads against real Garage**

```bash
D=/var/tmp/fm-e2e; J=$D/cookies; W=http://127.0.0.1:13909/api
python3 -c "
import os
with open('$D/big.bin','wb') as f:
    f.truncate(6*1024**3)
    for off in range(0, 6*1024**3, 1<<20):
        f.seek(off); f.write(os.urandom(4096))"
SRC=$(sha256sum $D/big.bin | cut -d' ' -f1)
curl -s -b $J -X PUT -T $D/big.bin "$W/browse/e2e/large/big.bin" -o /dev/null -w "upload %{http_code}\n"
curl -s -b $J -X PATCH -H 'Content-Type: application/json' -d '{"name":"renamed.bin"}' "$W/browse/e2e/large/big.bin" -w "\nrename %{http_code}\n"
curl -s -b $J -o /dev/null -w "old key %{http_code}\n" "$W/browse/e2e/large/big.bin"
DST=$(curl -s -b $J "$W/browse/e2e/large/renamed.bin?dl=1" | sha256sum | cut -d' ' -f1)
[ "$SRC" = "$DST" ] && echo "checksum match" || echo "CHECKSUM MISMATCH"
curl -s -H "Authorization: Bearer $(cat $D/admin_token)" "http://127.0.0.1:13903/v2/GetBucketInfo?globalAlias=e2e" \
  | python3 -c 'import json,sys; print("unfinished uploads:", json.load(sys.stdin)["unfinishedMultipartUploads"])'
curl -s -b $J -H 'Range: bytes=0-9' -o /dev/null -w "range %{http_code} %{size_download} bytes\n" "$W/browse/e2e/large/renamed.bin?view=1"
rm -f $D/big.bin
```

Expected: `upload 200`, `rename 200` with `"moved":1`, `old key 404`, `checksum match`,
`unfinished uploads: 0`, `range 206 10 bytes`.

- [ ] **Step 4: Document the new behaviour**

In `README.md`, in the **Features → Object management** list, add after the upload-queue bullets:

```markdown
- **Search** the current folder by name (all pages, case-insensitive)
- **Right-click menu** on files and folders: preview, open, download, rename, share, move, delete
- **Rename** files and folders (never overwrites an existing name)
- **Preview and details pane** for images, video, audio, PDF and text, with size, type, dates and ETag
- **Shift-click** checkboxes to select a range of rows
```

In the **Object management** section, add after the paragraph that starts "Folders with many
objects are paginated":

```markdown
Use the search box in the toolbar to find files by name anywhere in the current folder. Right-click
any row (or use its ⋯ button) for the full set of actions; right-clicking one of several selected
rows acts on the whole selection. Click a checkbox, then shift-click another to select every row in
between. Clicking a file opens it in the details pane — docked on the right on wide screens (collapse
it with the toolbar button), floating over the list on narrower ones (close it with Esc).
```

- [ ] **Step 5: Final checks**

Run:

```bash
cd /home/gennux/Developer/adnu/s3-garagehq-webui
pnpm exec tsc -b && pnpm test
(cd backend && gofmt -l . && go vet ./... && go test ./...)
pnpm exec eslint . 2>&1 | tail -1
git status --short
```

Expected: all clean/passing, ESLint ≤ 73 problems, only `README.md` modified.

- [ ] **Step 6: Commit and tear down**

```bash
git add README.md
git commit -m "docs: document folder search, rename, context menus and the details pane."
/var/tmp/fm-e2e/teardown.sh
docker images   # the Garage and alpine images must be gone; other images untouched
```

# Garage Web UI

[![image](misc/img/login-dashboard.png)](misc/img/login-dashboard.png)

A simple admin web UI for [Garage](https://garagehq.deuxfleurs.fr/), a self-hosted, S3-compatible, distributed object storage service.

[ [Screenshots](misc/SCREENSHOTS.md) | [Install Garage](https://garagehq.deuxfleurs.fr/documentation/quick-start/) | [Garage Git](https://git.deuxfleurs.fr/Deuxfleurs/garage) ]

> **This is a fork** of [khairul169/garage-webui](https://github.com/khairul169/garage-webui) maintained at
> [genebit/s3-garagehq-webui](https://github.com/genebit/s3-garagehq-webui), extended with multi-user
> access control, Google sign-in, an audit log viewer, bulk object management with drag-and-drop
> uploads, and a redesigned UI. See [Contributors](#contributors) below.

## Features

**Core** (from upstream)

- Garage health status dashboard
- Cluster & layout management
- Create, update, or view bucket information
- Integrated objects/bucket browser
- Create & assign access keys

**Access control & security** _(added in this fork)_

- Multi-user accounts with **owner / admin / developer** roles, replacing the single shared login
- One-time **owner registration** screen on first launch (no users yet)
- **Developers** are scoped to only the buckets explicitly assigned to them (browse, upload,
  download, delete objects, view their own keys) — no cluster, key, or user management
- Optional **Google sign-in** (OpenID Connect), deny-by-default: a Google account can only sign in
  if an admin has already created a matching user, with a configurable hosted-domain allowlist
- Self-service **change password** for any signed-in user
- **Audit log viewer** (owner/admin only) recording human-readable footprint events — logins,
  failed logins, user management, object uploads/deletes/moves — each with IP, user agent, and actor

**Object management** _(added in this fork)_

- **Multi-select** files and folders in the object browser
- Bulk **delete**, **share**, and **move** — moving supports nested destination folders, created via
  a breadcrumb folder picker
- **Drag-and-drop upload**, including whole folders and nested folder trees (recreated in the bucket
  exactly as dropped), plus a folder picker button
- Background **upload queue** with a progress panel (per-file and overall progress, cancel, retry)
  so large uploads don't block the UI
- **Multi-gigabyte uploads** streamed to Garage as multipart uploads — no practical size limit, and
  nothing is buffered on the web UI's disk; failures always surface as an error with a retry option
- **Paginated** object browser (50 items per page) and bucket list (15 per page, grid or list view)

**UI** _(redesigned in this fork)_

- Rebuilt on [shadcn/ui](https://ui.shadcn.com/) + Radix primitives (previously DaisyUI)
- Simplified to **light/dark mode** only (previously a multi-theme picker)

## Screenshots

More in [misc/SCREENSHOTS.md](misc/SCREENSHOTS.md).

|                                                                                    |                                                                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [![Login and dashboard](misc/img/login-dashboard.png)](misc/img/login-dashboard.png) <br> Login (password + Google sign-in) and the cluster health dashboard, in light and dark mode | [![Cluster and access keys](misc/img/clusters-keys.png)](misc/img/clusters-keys.png) <br> Cluster node details and access key management |
| [![Bucket and object management](misc/img/object-mgt.png)](misc/img/object-mgt.png) <br> Buckets, multi-select bulk actions, and the background upload progress panel | [![User management](misc/img/user-mgt.png)](misc/img/user-mgt.png) <br> Managing users, roles, and Google-linked accounts |
| [![Audit logs](misc/img/logs.png)](misc/img/logs.png) <br> Searchable, filterable audit log with expandable request details | |

## Installation

The Garage Web UI is available as a single executable binary and docker image. You can install it using the command line or with Docker Compose.

> **Note on this fork:** this section references `genebit/garage-webui`, the image published from
> this fork. The upstream `khairul169/garage-webui` image does not include this fork's features
> (access control, Google sign-in, audit logs, bulk object management, drag-and-drop uploads, or
> the redesigned UI). You can also build the image yourself from source — see
> [Development](#development) → [Running the fork locally with Docker](#running-the-fork-locally-with-docker).

### Docker CLI

```sh
$ docker run -p 3909:3909 -v ./garage.toml:/etc/garage.toml:ro --restart unless-stopped --name garage-webui genebit/garage-webui:latest
```

### Docker Compose

If you install Garage using Docker, you can install this web UI alongside Garage as follows:

```yml
services:
  garage:
    image: dxflrs/garage:v2.0.0
    container_name: garage
    volumes:
      - ./garage.toml:/etc/garage.toml
      - ./meta:/var/lib/garage/meta
      - ./data:/var/lib/garage/data
    restart: unless-stopped
    ports:
      - 3900:3900
      - 3901:3901
      - 3902:3902
      - 3903:3903

  webui:
    image: genebit/garage-webui:latest # or build from source, see Development
    container_name: garage-webui
    restart: unless-stopped
    volumes:
      - ./garage.toml:/etc/garage.toml:ro
      - webui-data:/data # required: user accounts, audit logs
    ports:
      - 3909:3909
    environment:
      API_BASE_URL: "http://garage:3903"
      S3_ENDPOINT_URL: "http://garage:3900"

volumes:
  webui-data:
```

The `webui-data` volume is required by this fork — it persists the user accounts store and audit
logs. See
[Environment Variables](#environment-variables) to customize its layout.

### Without Docker

Get the latest upstream binary from the [release page](https://github.com/khairul169/garage-webui/releases/latest), or build this fork's binary yourself (see [Development](#development)):

```sh
$ wget -O garage-webui https://github.com/khairul169/garage-webui/releases/download/1.1.0/garage-webui-v1.1.0-linux-amd64
$ chmod +x garage-webui
$ sudo cp garage-webui /usr/local/bin
```

Run the program with specified `garage.toml` config path.

```sh
$ CONFIG_PATH=./garage.toml garage-webui
```

If you want to run the program at startup, you may want to create a systemd service.

```sh
$ sudo nano /etc/systemd/system/garage-webui.service
```

```
[Unit]
Description=Garage Web UI
After=network.target

[Service]
Environment="PORT=3919"
Environment="CONFIG_PATH=/etc/garage.toml"
ExecStart=/usr/local/bin/garage-webui
Restart=always

[Install]
WantedBy=default.target
```

Then reload and start the garage-webui service.

```sh
$ sudo systemctl daemon-reload
$ sudo systemctl enable --now garage-webui
```

### Configuration

To simplify installation, the Garage Web UI uses values from the Garage configuration, such as `rpc_public_addr`, `admin.admin_token`, `s3_web.root_domain`, etc.

Example content of `garage.toml`:

```toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
metadata_auto_snapshot_interval = "6h"

replication_factor = 3
compression_level = 2

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "localhost:3901" # Required
rpc_secret = "YOUR_RPC_SECRET_HERE"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.domain.com"

[s3_web] # Optional, if you want to expose bucket as web
bind_addr = "[::]:3902"
root_domain = ".web.domain.com"
index = "index.html"

[admin] # Required
api_bind_addr = "[::]:3903"
admin_token = "YOUR_ADMIN_TOKEN_HERE"
metrics_token = "YOUR_METRICS_TOKEN_HERE"
```

However, if it fails to load, you can set `API_BASE_URL` & `API_ADMIN_KEY` environment variables instead.

### Environment Variables

Configurable envs:

| Variable | Default | Description |
| --- | --- | --- |
| `CONFIG_PATH` | `/etc/garage.toml` | Path to the Garage `config.toml` file. |
| `BASE_PATH` | _(none)_ | Base path or prefix for the Web UI. |
| `API_BASE_URL` | _(from config)_ | Garage admin API endpoint URL. |
| `API_ADMIN_KEY` | _(from config)_ | Garage admin API key. |
| `S3_REGION` | `garage` | S3 region. |
| `S3_ENDPOINT_URL` | _(from config)_ | S3 endpoint URL. |
| `HOST` | `0.0.0.0` | Address the server listens on. |
| `PORT` | `3909` | Port the server listens on. |
| `AUTH_USER_PASS` | _(none)_ | Legacy single-user login, `username:bcrypt_hash`. Only used while no users are registered — see [Access Control](#access-control-users--roles). |
| `USERS_PATH` | `/data/users.json` | Where the multi-user account store is persisted. |
| `LOGS_PATH` | `/data/logs/app.log` | Where the audit log file is persisted. |
| `TMPDIR` | `/data/tmp` | General temp directory (the scratch image has no `/tmp`). Uploads are streamed and don't use it. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | _(none)_ | Enables Google sign-in when both are set — see [Google sign-in](#google-sign-in-optional). |
| `GOOGLE_ALLOWED_DOMAINS` | `gbox.adnu.edu.ph,adnu.edu.ph` | Comma-separated hosted-domain allowlist for Google sign-in. |

`USERS_PATH`, `LOGS_PATH`, and `TMPDIR` all default under `/data`, so make sure that directory is a
writable, persistent volume (see the `webui-data` volume in the Docker Compose example above).

### Authentication

Enable authentication by setting the `AUTH_USER_PASS` environment variable in the format `username:password_hash`, where `password_hash` is a bcrypt hash of the password.

Generate the username and password hash using the following command:

```bash
htpasswd -nbBC 10 "YOUR_USERNAME" "YOUR_PASSWORD"
```

> If command 'htpasswd' is not found, install `apache2-utils` using your package manager.

Then update your `docker-compose.yml`:

```yml
webui:
  ....
  environment:
    AUTH_USER_PASS: "username:$2y$10$DSTi9o..."
```

> This is a legacy, single-account fallback kept for compatibility with upstream deployments. It
> only takes effect while no users exist in the account store — see the next section for the
> recommended multi-user setup.

### Access Control (users & roles)

The Web UI supports multiple users with role-based access instead of a single
shared login. Users are stored in a JSON file on a mounted volume (default
`/data/users.json`, configurable via the `USERS_PATH` environment variable), so
make sure the `webui` service has a writable `/data` volume as shown above.

On first launch, when no users exist, the UI shows a one-time registration
screen to create the initial **owner** account. Afterwards, registration is
closed and users sign in normally.

Roles:

- **owner** — full access, including managing all users (owners included).
- **admin** — manage buckets, keys, cluster, and users (but cannot modify owner
  accounts).
- **developer** — can only browse, upload, download, delete, and move objects, and view
  info and their own keys for the buckets explicitly assigned to them. No cluster, bucket
  creation, key management, or user management.

Every signed-in user can change their own password from the sidebar (**Change password**),
except accounts authenticated via the legacy `AUTH_USER_PASS` fallback.

The legacy `AUTH_USER_PASS` variable still works as a single-owner fallback, but
only while the user store is empty. Once any user is registered, the user store
takes over.

#### Google sign-in (optional)

Users can also sign in with Google (OpenID Connect). Sign-in is **deny by
default**: a Google account can only sign in if an admin has already created a
user with that email address — no self-service provisioning. Password login
remains available as a break-glass method.

Configure it with these environment variables on the `webui` service:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — an OAuth 2.0 Client ID created in
  the Google Cloud console (APIs & Services → Credentials).
- `GOOGLE_ALLOWED_DOMAINS` — comma-separated hosted-domain allowlist
  (default `gbox.adnu.edu.ph,adnu.edu.ph`). Only verified emails in these
  domains are accepted; this is enforced server-side on the ID token.

In the Google console, add your app's origin(s) and register the redirect URI
`<origin>/api/v1/auth/google/callback` for each origin (e.g.
`http://localhost:3909/api/v1/auth/google/callback`). The callback URL is
derived from the incoming request (honoring `X-Forwarded-Proto`/`Host`), so a
single deployment works across localhost and a proxied production domain.

To let a Google user in: create a user in the **Users** page and set their
**Email** to their Google address (the password can be left blank for
Google-only accounts). Assign their role and, for developers, their buckets.

### Object management

The bucket **Browse** tab supports selecting multiple files and folders (checkbox per row, or
select-all) to:

- **Delete** — files and folders (recursively) in one action
- **Share** — generate shareable URLs for every selected file at once
- **Move** — relocate the selection into another folder, including nested folders, via a
  breadcrumb-style folder picker; you can create new destination folders on the fly

Files and folders can also be **dragged and dropped** directly onto the Browse tab — dropping a
folder recreates its structure (including nested subfolders) in the bucket. A folder-picker button
is available as an alternative to dragging. Uploads run through a background queue shown in a
progress panel at the bottom-right of the screen, with per-file and overall progress, so you can
keep navigating the app while an upload is in flight.

Uploads are streamed straight through to Garage — files larger than 16 MiB are sent as S3 multipart
uploads, so there is no practical size limit (S3 caps a single object at 5 TiB) and the web UI keeps
memory use bounded without buffering files on disk. If an upload fails for any reason (network
drop, expired session, Garage unavailable or unresponsive), the panel marks the file with a short
reason and a **Retry** button, and an error notification is shown; a cancelled or failed upload is
aborted on the Garage side so no partial object is left behind. The browser asks for confirmation
before you leave the page while uploads are still running.

Folders with many objects are paginated 50 items per page; select-all applies to the current page.

### Logs (audit trail)

Owners and admins have access to a **Logs** page in the sidebar, showing a searchable,
filterable, paginated view of application audit events — logins and failed login attempts,
registrations, password changes, Google sign-in denials, user account changes, and object
uploads/deletes/moves. Each entry is collapsible to reveal footprint details (IP address, user
agent, acting user/role, and action-specific fields like the bucket/key involved).

Logs are persisted to `LOGS_PATH` (default `/data/logs/app.log`) on the `webui-data` volume, so
history survives restarts.

### Running

Once your instance of Garage Web UI is started, you can open the web UI at http://your-ip:3909. You can place it behind a reverse proxy to secure it with SSL.

If you do, make sure the proxy allows large request bodies and streams them instead of buffering,
otherwise large uploads will be rejected (HTTP 413) or held in the proxy first. For nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3909;
    client_max_body_size 0;        # no upload size limit
    proxy_request_buffering off;   # stream uploads straight to the web UI
    proxy_read_timeout 300s;
}
```

## Development

This project is bootstrapped using TypeScript & React for the UI, and Go for the backend.

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ and [pnpm](https://pnpm.io/) (pinned automatically via
  corepack from the `packageManager` field in `package.json`)
- [Go](https://go.dev/) 1.23+
- [air](https://github.com/air-verse/air) for backend hot-reload during local (non-Docker) dev:
  `go install github.com/air-verse/air@latest`

### Setup

```sh
$ git clone https://github.com/genebit/s3-garagehq-webui.git
$ cd s3-garagehq-webui
$ pnpm install
```

The backend has no separate install step — its Go module dependencies resolve automatically when
you build or run it (`go build` / `air`).

### Running

Start both the client and server concurrently:

```sh
$ pnpm run dev # or npm run dev
```

Or start each instance separately:

```sh
$ pnpm run dev:client   # Vite dev server
$ cd backend && air     # Go backend with hot reload
```

The Vite dev server proxies `/api` requests to the Go backend — set `VITE_API_URL` in a `.env`
file if the backend isn't on the default `http://localhost:3909`.

### Running the fork locally with Docker

If you'd rather not install Go/Node locally, you can build and run this fork entirely through
Docker Compose, without touching the tracked `docker-compose.yml` (which points at the upstream
image):

1. Create a `garage.toml` at the repo root (gitignored) with a minimal single-node config — see
   [Configuration](#configuration). For local dev, `replication_factor = 1` is sufficient.
2. Create a `docker-compose.override.yml` (gitignored, automatically merged by `docker compose`)
   that builds the `webui` service from source instead of pulling the published image:

   ```yml
   services:
     webui:
       image: garage-webui:local
       build:
         context: .
         dockerfile: Dockerfile
   ```

3. Build and start the stack:

   ```sh
   $ docker compose build webui
   $ docker compose up -d
   ```

4. Open http://localhost:3909 — on first launch you'll see the owner registration screen. A fresh
   Garage cluster also needs a one-time layout assignment from the **Cluster** page before buckets
   work.

After changing source code, rebuild and restart just the `webui` service:

```sh
$ docker compose up -d --build webui
```

## Troubleshooting

Make sure you are using the latest version of Garage. If the data cannot be loaded, please check whether your instance of Garage has the admin API enabled and the ports are accessible.

If large uploads fail with "File too large for the server", a reverse proxy in front of the web UI
is limiting the request size — see the proxy settings under [Running](#running). If Garage stops
responding mid-upload, the upload fails after about three minutes (a 60-second stall timeout, retried)
rather than hanging. When Garage is unreachable the web UI can't abort the multipart upload, so its
parts may remain until you clean them up (e.g. `garage bucket cleanup-incomplete-uploads`).

If you encounter any problems, please do not hesitate to submit an issue [here](https://github.com/genebit/s3-garagehq-webui/issues). You can describe the problem and attach the error logs (the in-app **Logs** page, or `LOGS_PATH` on disk, may also help).

## Contributors

- [khairul169](https://github.com/khairul169) — original author of [garage-webui](https://github.com/khairul169/garage-webui)
- **Gene T. Bitara** — access control & RBAC, Google sign-in, audit log viewer, bulk object
  management (multi-select, move, share), drag-and-drop uploads with background progress, and the
  shadcn/ui redesign, in this fork ([genebit/s3-garagehq-webui](https://github.com/genebit/s3-garagehq-webui))

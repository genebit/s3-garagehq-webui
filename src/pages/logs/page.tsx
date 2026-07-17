import Page from "@/context/page-context";
import { Card } from "@/components/ui/card";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import { cn, dayjs, readableBytes } from "@/lib/utils";
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useLogs } from "./hooks";
import { LogEntry, LogLevel } from "./types";

const LIMIT = 100;

const levelFilters: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "INFO", label: "Info" },
  { key: "WARN", label: "Warn" },
  { key: "ERROR", label: "Error" },
];

const levelStyles: Record<LogLevel, string> = {
  ERROR: "bg-red-500/15 text-red-600 dark:text-red-400",
  WARN: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  INFO: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  DEBUG: "bg-muted text-muted-foreground",
};

const LogsPage = () => {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isFetching, refetch } = useLogs({
    search,
    level,
    page,
    limit: LIMIT,
    autoRefresh,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / LIMIT));

  const onFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="container">
      <Page title="Logs" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search logs..."
          className="sm:max-w-xs"
          value={search}
          onChange={(e) => onFilter(() => setSearch(e.target.value))}
        />

        <div className="flex flex-row flex-wrap items-center gap-1">
          {levelFilters.map((f) => {
            const count =
              f.key === "all"
                ? Object.values(data?.counts || {}).reduce((a, b) => a + b, 0)
                : data?.counts?.[f.key] || 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onFilter(() => setLevel(f.key))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  level === f.key
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded px-1 text-[10px]",
                    level === f.key
                      ? "bg-primary-foreground/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
        >
          <RefreshCw
            size={15}
            className={isFetching ? "animate-spin" : undefined}
          />
          Refresh
        </Button>
      </div>

      <Card className="mt-4 overflow-hidden md:mt-6">
        <div className="divide-y">
          {(data?.entries || []).map((entry, idx) => (
            <LogRow key={idx} entry={entry} />
          ))}

          {!data?.entries?.length ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No log entries.
            </p>
          ) : null}
        </div>
      </Card>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data?.total || 0} entries
          {data?.size != null ? ` · ${readableBytes(data.size)}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

const contextLabels: Record<string, string> = {
  ip: "IP address",
  userAgent: "User agent",
  user: "User",
  role: "Role",
  event: "Event",
  email: "Email",
  target: "Target",
  targetRole: "Target role",
  attemptedUser: "Attempted user",
  method: "Method",
  path: "Path",
  status: "Status",
  durationMs: "Duration (ms)",
  bucket: "Bucket",
  key: "Key",
  items: "Items",
  destination: "Destination",
  moved: "Moved",
  count: "Count",
  size: "Size (bytes)",
};

const LogRow = ({ entry }: { entry: LogEntry }) => {
  const [open, setOpen] = useState(false);
  const contextEntries = entry.context ? Object.entries(entry.context) : [];
  const expandable = contextEntries.length > 0 || entry.message.length > 140;

  return (
    <div>
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors",
          expandable && "cursor-pointer hover:bg-muted/50"
        )}
      >
        <ChevronDown
          size={14}
          className={cn(
            "mt-1 shrink-0 text-muted-foreground transition-transform",
            !expandable && "invisible",
            open && "rotate-180"
          )}
        />
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
            levelStyles[entry.level] || levelStyles.INFO
          )}
        >
          {entry.level}
        </span>
        <span className="mt-0.5 w-32 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {entry.timestamp
            ? dayjs(entry.timestamp).format("MMM D HH:mm:ss")
            : "—"}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 text-xs",
            open ? "whitespace-pre-wrap break-words" : "truncate"
          )}
        >
          {entry.message}
        </span>
      </button>

      {open && contextEntries.length ? (
        <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 border-t bg-muted/30 px-4 py-3 pl-11 text-xs">
          {contextEntries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">
                {contextLabels[key] || key}
              </dt>
              <dd className="break-all font-mono">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
};

export default LogsPage;

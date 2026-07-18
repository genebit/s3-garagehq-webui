import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readableBytes } from "@/lib/utils";
import { useMemo } from "react";
import { useStore } from "zustand";
import appStore from "@/stores/app-store";
import { Bucket } from "@/pages/buckets/types";

// Nominal categories (bucket names have no inherent order/severity), so every
// bar takes the same slot-1 hue rather than a value ramp — bar length alone
// encodes magnitude.
const BAR_COLOR = { light: "#2a78d6", dark: "#3987e5" };
const MAX_ROWS = 8;

type Props = {
  buckets?: Bucket[];
};

const BucketUsageChart = ({ buckets }: Props) => {
  const mode = useStore(appStore, (s) => s.mode);
  const color = BAR_COLOR[mode];

  const rows = useMemo(() => {
    const named = (buckets || []).map((b) => ({
      name: b.globalAliases?.[0] || b.id.slice(0, 8),
      bytes: b.bytes,
      objects: b.objects,
    }));
    const sorted = [...named].sort((a, b) => b.bytes - a.bytes);

    if (sorted.length <= MAX_ROWS) return sorted;

    const top = sorted.slice(0, MAX_ROWS - 1);
    const rest = sorted.slice(MAX_ROWS - 1);
    const other = {
      name: `Other (${rest.length})`,
      bytes: rest.reduce((a, r) => a + r.bytes, 0),
      objects: rest.reduce((a, r) => a + r.objects, 0),
    };
    return [...top, other];
  }, [buckets]);

  const max = Math.max(1, ...rows.map((r) => r.bytes));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage by Bucket</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No buckets yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              const pct = Math.max((row.bytes / max) * 100, row.bytes > 0 ? 1.5 : 0);
              return (
                <div
                  key={row.name}
                  tabIndex={0}
                  className="group relative grid grid-cols-[100px_1fr_auto] items-center gap-3 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring sm:grid-cols-[140px_1fr_auto]"
                >
                  <p className="truncate text-sm text-muted-foreground" title={row.name}>
                    {row.name}
                  </p>

                  <div className="h-4 w-full overflow-hidden rounded-r-[4px] bg-muted/50">
                    <div
                      className="h-full rounded-r-[4px] transition-[width]"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>

                  <p className="w-16 shrink-0 text-right text-sm tabular-nums text-foreground">
                    {readableBytes(row.bytes)}
                  </p>

                  {/* Hover/focus tooltip — supplements, never gates: the same
                      values are always visible as direct labels above. */}
                  <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {readableBytes(row.bytes)} · {row.objects.toLocaleString()}{" "}
                      object{row.objects === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BucketUsageChart;

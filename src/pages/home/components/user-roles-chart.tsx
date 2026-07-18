import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo, useState } from "react";
import { useStore } from "zustand";
import appStore from "@/stores/app-store";
import { User } from "@/pages/users/types";

// Role has a real hierarchy (owner > admin > developer), so it's ordinal, not
// nominal: one hue, monotone lightness, rather than three unrelated hues.
// Steps validated with scripts/validate_palette.js --ordinal against this
// app's actual card surfaces (light #ffffff / dark #0b111e).
const ROLE_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  owner: { light: "#1c5cab", dark: "#184f95", label: "Owner" },
  admin: { light: "#3987e5", dark: "#2a78d6", label: "Admin" },
  developer: { light: "#86b6ef", dark: "#5598e7", label: "Developer" },
};
const ROLE_ORDER = ["owner", "admin", "developer"];

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  users?: User[];
};

const UserRolesChart = ({ users }: Props) => {
  const mode = useStore(appStore, (s) => s.mode);
  const [active, setActive] = useState<string | null>(null);

  const counts = useMemo(() => {
    const byRole: Record<string, number> = { owner: 0, admin: 0, developer: 0 };
    for (const u of users || []) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
    }
    return byRole;
  }, [users]);

  const total = users?.length || 0;

  const segments = useMemo(() => {
    let offset = 0;
    return ROLE_ORDER.filter((role) => counts[role] > 0).map((role) => {
      const count = counts[role];
      const fraction = total > 0 ? count / total : 0;
      const dash = fraction * CIRCUMFERENCE;
      const segment = {
        role,
        count,
        pct: Math.round(fraction * 100),
        dashArray: `${dash} ${CIRCUMFERENCE - dash}`,
        dashOffset: -offset,
        color: ROLE_COLORS[role][mode],
      };
      offset += dash;
      return segment;
    });
  }, [counts, total, mode]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users by Role</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No users yet.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-around">
            <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
              <svg
                width={SIZE}
                height={SIZE}
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="-rotate-90"
              >
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={STROKE}
                  className="text-muted/40"
                />
                {segments.map((seg) => (
                  <circle
                    key={seg.role}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={active === seg.role ? STROKE + 3 : STROKE}
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                    className="cursor-pointer transition-[stroke-width]"
                    onMouseEnter={() => setActive(seg.role)}
                    onMouseLeave={() => setActive(null)}
                    tabIndex={0}
                    onFocus={() => setActive(seg.role)}
                    onBlur={() => setActive(null)}
                  >
                    <title>
                      {ROLE_COLORS[seg.role].label}: {seg.count} ({seg.pct}%)
                    </title>
                  </circle>
                ))}
              </svg>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-semibold">{total}</p>
                <p className="text-xs text-muted-foreground">
                  user{total === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {/* Legend: always present for 2+ series; counts double as the
                direct label since in-ring labels don't fit a thin donut. */}
            <ul className="flex flex-col gap-2">
              {ROLE_ORDER.map((role) => (
                <li
                  key={role}
                  className="flex items-center gap-2 text-sm"
                  onMouseEnter={() => setActive(role)}
                  onMouseLeave={() => setActive(null)}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ROLE_COLORS[role][mode] }}
                  />
                  <span className="text-muted-foreground">
                    {ROLE_COLORS[role].label}
                  </span>
                  <span className="font-medium tabular-nums">{counts[role]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UserRolesChart;

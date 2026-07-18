import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  value?: string | number | null;
  icon: LucideIcon;
  valueClassName?: string;
  children?: React.ReactNode;
};

const StatsCard = ({
  title,
  value,
  icon: Icon,
  valueClassName,
  children,
}: Props) => {
  return (
    <div className="flex flex-row items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={20} />
      </div>

      <div className="flex-1 truncate">
        {children != null ? (
          children
        ) : (
          <p className={cn("truncate text-2xl font-semibold", valueClassName)}>
            {typeof value === "undefined" ? "..." : value}
          </p>
        )}
        <p className="truncate text-sm text-muted-foreground">{title}</p>
      </div>
    </div>
  );
};

export default StatsCard;

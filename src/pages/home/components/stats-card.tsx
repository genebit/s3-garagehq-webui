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
    <div className="flex flex-row items-center rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:p-6">
      <div className="shrink-0 w-[60px]">
        <Icon size={32} />
      </div>

      <div className="flex-1 truncate">
        {children != null ? (
          children
        ) : (
          <p className={cn("flex-1 text-3xl font-bold", valueClassName)}>
            {typeof value === "undefined" ? "..." : value}
          </p>
        )}
        <p className="text-sm mt-0.5 truncate">{title}</p>
      </div>
    </div>
  );
};

export default StatsCard;

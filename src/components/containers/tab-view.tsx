import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type Tab = {
  name: string;
  title?: string;
  icon?: LucideIcon;
  Component?: () => JSX.Element | null;
};

type Props = {
  tabs: Tab[];
  name?: string;
  className?: string;
  contentClassName?: string;
};

const TabView = ({
  tabs,
  name = "tab",
  className,
  contentClassName,
}: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const curTab = searchParams.get(name) || tabs[0].name;

  const content = useMemo(() => {
    const Comp = tabs.find((tab) => tab.name === curTab)?.Component;
    return Comp ? <Comp /> : null;
  }, [curTab, tabs]);

  return (
    <>
      <div
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground",
          className
        )}
      >
        {tabs.map(({ icon: Icon, ...tab }) => (
          <button
            key={tab.name}
            type="button"
            onClick={() => {
              setSearchParams((params) => {
                params.set(name, tab.name);
                return params;
              });
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              curTab === tab.name
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground"
            )}
          >
            {Icon ? <Icon size={16} /> : null}
            <span>{tab.title || tab.name}</span>
          </button>
        ))}
      </div>

      <div className={cn("mt-4", contentClassName)}>{content}</div>
    </>
  );
};

export default TabView;

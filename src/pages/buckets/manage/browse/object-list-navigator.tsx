import Button from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Home, LucideIcon } from "lucide-react";
import { Fragment } from "react/jsx-runtime";

type Props = {
  curPrefix: number;
  setCurPrefix: React.Dispatch<React.SetStateAction<number>>;
  prefixHistory: string[];
  actions?: React.ReactNode;
};

const ObjectListNavigator = ({
  curPrefix,
  setCurPrefix,
  prefixHistory,
  actions,
}: Props) => {
  const onGoBack = () => {
    if (curPrefix >= 0) setCurPrefix(curPrefix - 1);
  };

  const onGoForward = () => {
    if (curPrefix < prefixHistory.length - 1) setCurPrefix(curPrefix + 1);
  };

  return (
    <div className="flex flex-row flex-wrap items-center gap-y-2 border-b p-2">
      <div className="order-1 flex flex-row items-center gap-1">
        <Button
          icon={ChevronLeft}
          variant="ghost"
          size="icon"
          disabled={curPrefix < 0}
          onClick={onGoBack}
        />
        <Button
          icon={ChevronRight}
          variant="ghost"
          size="icon"
          disabled={curPrefix >= prefixHistory.length - 1}
          onClick={onGoForward}
        />
      </div>

      <div className="order-3 mx-2 flex h-9 w-full min-w-[80%] flex-1 shrink-0 flex-row items-center gap-0.5 overflow-x-auto rounded-md border bg-muted/50 px-1.5 md:order-2 md:min-w-0">
        <HistoryItem
          icon={Home}
          isActive={curPrefix === -1}
          onClick={() => setCurPrefix(-1)}
        />

        {prefixHistory.map((prefix, i) => (
          <Fragment key={prefix}>
            <ChevronRight
              className="shrink-0 text-muted-foreground"
              size={14}
            />
            <HistoryItem
              title={prefix
                .substring(0, prefix.lastIndexOf("/"))
                .split("/")
                .pop()}
              isActive={i === curPrefix}
              onClick={() => setCurPrefix(i)}
            />
          </Fragment>
        ))}
      </div>

      <div className="order-2 flex flex-1 flex-row items-center justify-end gap-1 md:order-3 md:flex-initial">
        {actions}
      </div>
    </div>
  );
};

type HistoryItemProps = {
  icon?: LucideIcon;
  title?: string;
  isActive: boolean;
  onClick: () => void;
};

const HistoryItem = ({
  icon: Icon,
  title,
  isActive,
  onClick,
}: HistoryItemProps) => {
  if (!title && !Icon) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 max-w-[150px] shrink-0 items-center truncate rounded px-2 text-sm transition-colors hover:text-foreground",
        isActive
          ? "border bg-background font-medium text-foreground shadow-sm"
          : "text-muted-foreground"
      )}
    >
      {Icon ? <Icon size={15} /> : null}
      {title}
    </button>
  );
};

export default ObjectListNavigator;

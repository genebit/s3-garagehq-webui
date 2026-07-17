import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import React, { forwardRef } from "react";

type Props = React.ComponentPropsWithoutRef<"div"> & {
  onClick?: () => void;
  onRemove?: () => void;
};

const Chips = forwardRef<HTMLDivElement, Props>(
  ({ className, children, onRemove, ...props }, ref) => {
    const Comp = props.onClick ? "button" : "div";

    return (
      <Comp
        ref={ref as never}
        className={cn(
          "inline-flex h-8 cursor-default flex-row items-center gap-1 rounded-full border border-input bg-secondary/50 px-3 text-sm text-foreground",
          className
        )}
        {...(props as any)}
      >
        {children}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove"
            className="-mr-2 ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-destructive hover:text-destructive-foreground"
          >
            <X size={14} />
          </button>
        ) : null}
      </Comp>
    );
  }
);

export default Chips;

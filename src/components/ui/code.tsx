import { cn, copyToClipboard } from "@/lib/utils";
import React from "react";
import Button from "./button";
import { Copy } from "lucide-react";

type Props = Omit<React.ComponentPropsWithoutRef<"code">, "children"> & {
  children?: string;
};

const Code = ({ className, children, ...props }: Props) => {
  return (
    <code
      className={cn(
        "relative block rounded-lg border bg-muted px-4 py-3 pr-12 font-mono text-sm",
        className
      )}
      {...props}
    >
      {children}
      <Button
        icon={Copy}
        className="absolute right-1 top-1"
        variant="ghost"
        size="icon"
        onClick={() => copyToClipboard(children || "")}
      />
    </code>
  );
};

export default Code;

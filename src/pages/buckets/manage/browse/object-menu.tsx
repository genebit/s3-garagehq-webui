import { Fragment, ReactNode } from "react";
import { EllipsisVertical } from "lucide-react";
import Button from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { MenuTarget, useObjectMenuItems } from "./use-object-menu-items";

const destructiveClass = "text-destructive focus:text-destructive";

/** The ⋯ button menu at the end of each row. */
export const ObjectRowMenu = ({ target }: { target: MenuTarget }) => {
  const items = useObjectMenuItems(target);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={EllipsisVertical}
          variant="ghost"
          size="icon"
          aria-label="More actions"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(item.destructive && destructiveClass)}
            >
              <item.icon /> {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Wraps a row so right-clicking it opens the same actions. */
export const ObjectContextMenu = ({
  target,
  children,
}: {
  target: MenuTarget;
  children: ReactNode;
}) => {
  const items = useObjectMenuItems(target);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(item.destructive && destructiveClass)}
            >
              <item.icon /> {item.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
};

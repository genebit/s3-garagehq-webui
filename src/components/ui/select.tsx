import { cn } from "@/lib/utils";
import { ComponentPropsWithoutRef, forwardRef } from "react";
import BaseSelect from "react-select";
import Creatable from "react-select/creatable";

type Props = ComponentPropsWithoutRef<typeof BaseSelect> & {
  creatable?: boolean;
  onCreateOption?: (inputValue: string) => void;
};

const Select = forwardRef<any, Props>(({ creatable, ...props }, ref) => {
  const Comp = creatable ? Creatable : BaseSelect;

  return (
    <Comp
      ref={ref}
      unstyled
      classNames={{
        // Marks the portaled menu so ancestor Radix layers (e.g. Dialog) can
        // recognize clicks on it as "inside" and not dismiss on selection.
        menuPortal: () => "select-menu-portal",
        control: (p) =>
          cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm transition-colors",
            p.isFocused && "ring-1 ring-ring",
            p.isMulti && "py-1.5 flex flex-row gap-2 items-center flex-wrap",
            p.isMulti && p.hasValue ? "h-auto px-2 py-1" : null
          ),
        placeholder: () => "text-muted-foreground",
        input: () => "text-foreground",
        menuList: () =>
          "z-50 mt-1 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        noOptionsMessage: () => "py-4 text-sm text-muted-foreground",
        option: (p) =>
          cn(
            "!cursor-pointer rounded-sm px-2 py-1.5 text-sm text-popover-foreground",
            p.isSelected || p.isFocused ? "bg-accent text-accent-foreground" : null
          ),
        singleValue: () => "text-foreground",
        multiValue: () =>
          "mr-1 mt-0.5 flex flex-row items-center rounded-md bg-secondary pl-2 text-xs text-secondary-foreground",
        multiValueRemove: () =>
          "px-1.5 py-1.5 rounded-r-md hover:bg-primary hover:text-primary-foreground",
      }}
      noOptionsMessage={() =>
        creatable ? "Type something to add..." : undefined
      }
      menuPortalTarget={
        typeof document !== "undefined" ? document.body : undefined
      }
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
      {...props}
    />
  );
});

export default Select;

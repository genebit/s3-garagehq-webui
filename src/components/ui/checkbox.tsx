import { cn } from "@/lib/utils";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import React, { forwardRef, useId } from "react";
import FormControl from "./form-control";
import { FieldValues } from "react-hook-form";

type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "form"
> & {
  label?: React.ReactNode;
  /** Classes for the box itself; `className` styles the wrapping label. */
  inputClassName?: string;
};

const Checkbox = forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ label, className, inputClassName, id, ...props }, ref) => {
  const autoId = useId();
  const boxId = id ?? autoId;

  const box = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={boxId}
      className={cn(
        "peer grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        !label && className,
        inputClassName
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? (
          <Minus className="h-3.5 w-3.5" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) {
    return box;
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      {box}
      <label
        htmlFor={boxId}
        className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
      </label>
    </div>
  );
});

Checkbox.displayName = "Checkbox";

type CheckboxFieldProps<T extends FieldValues> = Omit<
  React.ComponentPropsWithoutRef<typeof FormControl<T>>,
  "render"
> &
  Omit<CheckboxProps, "name">;

export const CheckboxField = <T extends FieldValues>({
  form,
  name,
  ...props
}: CheckboxFieldProps<T>) => {
  return (
    <FormControl
      form={form}
      name={name}
      render={(field) => (
        <Checkbox
          {...props}
          ref={field.ref}
          name={field.name}
          onBlur={field.onBlur}
          disabled={field.disabled || props.disabled}
          checked={field.value || false}
          onCheckedChange={(checked) => field.onChange(checked === true)}
        />
      )}
    />
  );
};

export default Checkbox;

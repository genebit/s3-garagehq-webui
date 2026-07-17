import { cn } from "@/lib/utils";
import React, { forwardRef, InputHTMLAttributes } from "react";
import FormControl from "./form-control";
import { FieldValues } from "react-hook-form";

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "form"> & {
  label?: string;
};

// A shadcn-style switch built on a native checkbox for form compatibility.
const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <label
        className={cn(
          "inline-flex cursor-pointer items-center justify-start gap-2 py-1 text-sm font-medium",
          className
        )}
      >
        <span className="relative inline-flex">
          <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
          <span className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary" />
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4" />
        </span>
        {label}
      </label>
    );
  }
);

type ToggleFieldProps<T extends FieldValues> = Omit<
  React.ComponentPropsWithoutRef<typeof FormControl<T>>,
  "render"
> &
  ToggleProps & {
    inputClassName?: string;
  };

export const ToggleField = <T extends FieldValues>({
  form,
  name,
  title,
  className,
  inputClassName,
  ...props
}: ToggleFieldProps<T>) => {
  return (
    <FormControl
      form={form}
      name={name}
      title={title}
      className={className}
      render={(field) => (
        <Toggle
          {...props}
          {...field}
          className={inputClassName}
          checked={field.value || false}
          onChange={(e) => field.onChange(e.target.checked)}
        />
      )}
    />
  );
};

export default Toggle;

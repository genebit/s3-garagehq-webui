import { cn } from "@/lib/utils";
import React, { forwardRef, InputHTMLAttributes } from "react";
import FormControl from "./form-control";
import { FieldValues } from "react-hook-form";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "form"> & {
  label?: string;
  inputClassName?: string;
};

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, inputClassName, ...props }, ref) => {
    return (
      <label
        className={cn(
          "inline-flex cursor-pointer items-center justify-start gap-2 text-sm font-medium",
          className
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            "h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary",
            inputClassName
          )}
          {...props}
        />
        {label}
      </label>
    );
  }
);

type CheckboxFieldProps<T extends FieldValues> = Omit<
  React.ComponentPropsWithoutRef<typeof FormControl<T>>,
  "render"
> &
  CheckboxProps;

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
          {...field}
          checked={field.value || false}
          onChange={(e) => field.onChange(e.target.checked)}
        />
      )}
    />
  );
};

export default Checkbox;

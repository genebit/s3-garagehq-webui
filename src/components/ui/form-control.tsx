import { cn } from "@/lib/utils";
import { ComponentPropsWithoutRef } from "react";
import {
  FieldValues,
  UseFormReturn,
  Controller,
  ControllerRenderProps,
  ControllerFieldState,
  FieldPath,
  UseFormStateReturn,
} from "react-hook-form";

type FormControlProps<
  T extends FieldValues,
  U extends FieldPath<T> = FieldPath<T>
> = ComponentPropsWithoutRef<"div"> & {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  title?: string;

  render: (
    field: ControllerRenderProps<T, U>,
    fieldProps: {
      fieldState: ControllerFieldState;
      formState: UseFormStateReturn<T>;
    }
  ) => React.ReactElement;
};

const FormControl = <T extends FieldValues>({
  form,
  name,
  title,
  className,
  render,
}: FormControlProps<T>) => {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState, formState }) => (
        <div className={cn("flex flex-col gap-1.5", className)}>
          {title ? (
            <label className="text-sm font-medium leading-none">{title}</label>
          ) : null}

          {render(field, { fieldState, formState })}

          {fieldState.error ? (
            <p className="text-xs text-destructive">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
};

export default FormControl;

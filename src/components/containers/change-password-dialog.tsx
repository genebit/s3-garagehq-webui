import Button from "@/components/ui/button";
import { InputField } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import api from "@/lib/api";
import { handleError } from "@/lib/utils";
import { useEffect } from "react";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Schema = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ChangePasswordDialog = ({ open, onOpenChange }: Props) => {
  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (open) form.reset();
  }, [open]);

  const changePassword = useMutation({
    mutationFn: (values: Schema) =>
      api.post("/auth/change-password", {
        body: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      }),
    onSuccess: () => {
      toast.success("Password changed!");
      onOpenChange(false);
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => changePassword.mutate(values));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Confirm your current password, then choose a new one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <InputField
            form={form}
            name="currentPassword"
            title="Current Password"
            type="password"
          />
          <InputField
            form={form}
            name="newPassword"
            title="New Password"
            type="password"
          />
          <InputField
            form={form}
            name="confirmPassword"
            title="Confirm New Password"
            type="password"
          />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            loading={changePassword.isPending}
            onClick={onSubmit}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;

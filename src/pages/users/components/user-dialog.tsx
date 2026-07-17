import Button from "@/components/ui/button";
import Select from "@/components/ui/select";
import { InputField } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBuckets } from "@/pages/buckets/hooks";
import { createUserSchema, editUserSchema, UserSchema } from "../schema";
import { useCreateUser, useUpdateUser } from "../hooks";
import { User } from "../types";

type Props = {
  user?: User;
};

const UserDialog = ({ user }: Props) => {
  const isEdit = !!user;
  const [isOpen, setOpen] = useState(false);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { data: buckets } = useBuckets();

  const form = useForm<UserSchema>({
    resolver: zodResolver(isEdit ? editUserSchema : createUserSchema) as any,
    defaultValues: {
      username: user?.username || "",
      email: user?.email || "",
      password: "",
      role: user?.role || "developer",
      buckets: user?.buckets || [],
    },
  });

  const role = form.watch("role");

  const bucketOptions = useMemo(
    () =>
      (buckets || []).map((b) => ({
        value: b.id,
        label: b.globalAliases?.[0] || b.id,
      })),
    [buckets]
  );

  const roleOptions = useMemo(
    () => [
      ...(auth.isOwner ? [{ value: "owner", label: "Owner" }] : []),
      { value: "admin", label: "Admin" },
      { value: "developer", label: "Developer" },
    ],
    [auth.isOwner]
  );

  useEffect(() => {
    if (isOpen) {
      form.reset({
        username: user?.username || "",
        email: user?.email || "",
        password: "",
        role: user?.role || "developer",
        buckets: user?.buckets || [],
      });
    }
  }, [isOpen]);

  const onDone = () => {
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["users"] });
    toast.success(isEdit ? "User updated!" : "User created!");
  };

  const createUser = useCreateUser({ onSuccess: onDone, onError: handleError });
  const updateUser = useUpdateUser({ onSuccess: onDone, onError: handleError });

  const onSubmit = form.handleSubmit((values) => {
    const body: Record<string, any> = {
      username: values.username,
      email: values.email || "",
      role: values.role,
      buckets: values.role === "developer" ? values.buckets || [] : [],
    };
    if (values.password) {
      body.password = values.password;
    }

    if (isEdit) {
      updateUser.mutate({ id: user!.id, body });
    } else {
      createUser.mutate(body);
    }
  });

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {isEdit ? (
        <Button
          icon={Pencil}
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
        />
      ) : (
        <Button variant="default" icon={Plus} onClick={() => setOpen(true)}>
          Add User
        </Button>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add New User"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <InputField form={form} name="username" title="Username" />

          <InputField
            form={form}
            name="email"
            title="Email (for Google sign-in)"
            placeholder="name@adnu.edu.ph"
          />

          <InputField
            form={form}
            name="password"
            title={isEdit ? "New Password" : "Password"}
            type="password"
            placeholder={
              isEdit
                ? "Leave blank to keep current"
                : "Optional if an email is set"
            }
          />

          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">
                  Role
                </label>
                <Select
                  options={roleOptions}
                  value={
                    roleOptions.find((o) => o.value === field.value) || null
                  }
                  onChange={(selected) =>
                    field.onChange((selected as { value: string })?.value)
                  }
                  isSearchable={false}
                  placeholder="Select a role..."
                />
              </div>
            )}
          />

          {role === "developer" ? (
            <Controller
              control={form.control}
              name="buckets"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">
                    Assigned Buckets
                  </label>
                  <Select
                    isMulti
                    options={bucketOptions}
                    value={bucketOptions.filter((o) =>
                      (field.value || []).includes(o.value)
                    )}
                    onChange={(selected) =>
                      field.onChange(
                        (selected as { value: string }[]).map((s) => s.value)
                      )
                    }
                    placeholder="Select buckets..."
                  />
                </div>
              )}
            />
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" disabled={isPending} onClick={onSubmit}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserDialog;

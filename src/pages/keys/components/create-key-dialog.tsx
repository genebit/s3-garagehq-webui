import Button from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { createKeySchema, CreateKeySchema } from "../schema";
import { InputField } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/checkbox";
import { useCreateKey } from "../hooks";
import { useQueryClient } from "@tanstack/react-query";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const CreateKeyDialog = () => {
  const [isOpen, setOpen] = useState(false);
  const form = useForm<CreateKeySchema>({
    resolver: zodResolver(createKeySchema),
    defaultValues: { name: "" },
  });
  const isImport = useWatch({ control: form.control, name: "isImport" });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) form.reset({ name: "" });
  }, [isOpen]);

  const createKey = useCreateKey({
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      toast.success("Key created!");
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => {
    createKey.mutate(values);
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <Button variant="default" icon={Plus} onClick={() => setOpen(true)}>
        Create Key
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Key</DialogTitle>
          <DialogDescription>
            Enter the details of the key you wish to create.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <InputField form={form} name="name" title="Key Name" />
          <CheckboxField form={form} name="isImport" label="Import existing" />

          {isImport && (
            <>
              <InputField form={form} name="accessKeyId" title="Access Key ID" />
              <InputField
                form={form}
                name="secretAccessKey"
                title="Secret Access Key"
              />
            </>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={createKey.isPending}
            onClick={onSubmit}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateKeyDialog;

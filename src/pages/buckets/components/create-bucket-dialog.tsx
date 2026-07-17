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
import { useForm } from "react-hook-form";
import { createBucketSchema, CreateBucketSchema } from "../schema";
import { InputField } from "@/components/ui/input";
import { useCreateBucket } from "../hooks";
import { useQueryClient } from "@tanstack/react-query";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const CreateBucketDialog = () => {
  const [isOpen, setOpen] = useState(false);
  const form = useForm<CreateBucketSchema>({
    resolver: zodResolver(createBucketSchema),
    defaultValues: { globalAlias: "" },
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) form.reset({ globalAlias: "" });
  }, [isOpen]);

  const createBucket = useCreateBucket({
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
      toast.success("Bucket created!");
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => {
    createBucket.mutate(values);
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <Button variant="default" icon={Plus} onClick={() => setOpen(true)}>
        Create Bucket
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Bucket</DialogTitle>
          <DialogDescription>
            Enter the details of the bucket you wish to create.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <InputField form={form} name="globalAlias" title="Bucket Name" />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={createBucket.isPending}
            onClick={onSubmit}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateBucketDialog;

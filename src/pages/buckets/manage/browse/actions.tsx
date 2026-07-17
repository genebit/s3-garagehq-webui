import { FolderPlus, FolderUp, UploadIcon } from "lucide-react";
import Button from "@/components/ui/button";
import { usePutObject } from "./hooks";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useBucketContext } from "../context";
import { uploadStore } from "@/stores/upload-store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createFolderSchema, CreateFolderSchema } from "./schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InputField } from "@/components/ui/input";
import { useEffect, useState } from "react";

type Props = {
  prefix: string;
};

const Actions = ({ prefix }: Props) => {
  const { bucketName } = useBucketContext();

  const pickAndUpload = (directory: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (directory) {
      // Non-standard but widely supported directory picker.
      (input as any).webkitdirectory = true;
    }

    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files?.length) return;

      uploadStore.enqueue(
        Array.from(files).map((file) => ({
          bucket: bucketName,
          // webkitRelativePath preserves nested folders when a directory is picked.
          key: prefix + ((file as any).webkitRelativePath || file.name),
          file,
        }))
      );
    };

    input.click();
    input.remove();
  };

  return (
    <>
      <CreateFolderAction prefix={prefix} />
      <Button
        icon={FolderUp}
        variant="ghost"
        size="icon"
        title="Upload Folder"
        onClick={() => pickAndUpload(true)}
      />
      <Button
        icon={UploadIcon}
        variant="ghost"
        size="icon"
        title="Upload Files"
        onClick={() => pickAndUpload(false)}
      />
    </>
  );
};

type CreateFolderActionProps = {
  prefix: string;
};

const CreateFolderAction = ({ prefix }: CreateFolderActionProps) => {
  const [isOpen, setOpen] = useState(false);
  const { bucketName } = useBucketContext();
  const queryClient = useQueryClient();

  const form = useForm<CreateFolderSchema>({
    resolver: zodResolver(createFolderSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (isOpen) form.reset({ name: "" });
  }, [isOpen]);

  const createFolder = usePutObject(bucketName, {
    onSuccess: () => {
      toast.success("Folder created!");
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
      setOpen(false);
      form.reset();
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => {
    createFolder.mutate({ key: `${prefix}${values.name}/`, file: null });
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <Button
        icon={FolderPlus}
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="Create Folder"
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <InputField form={form} name="name" title="Name" />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onSubmit}
            disabled={createFolder.isPending}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Actions;

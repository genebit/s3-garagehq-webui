import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { handleError } from "@/lib/utils";
import { useBucketContext } from "../context";
import { keyName, splitExtension } from "./browse-utils";
import { useRenameObject } from "./hooks";

type Props = {
  /** Key being renamed; the dialog is open while this is set. */
  objectKey: string | null;
  onClose: () => void;
  onRenamed: (oldKey: string, newKey: string) => void;
};

const RenameDialog = ({ objectKey, onClose, onRenamed }: Props) => {
  const { bucketName } = useBucketContext();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isDir = !!objectKey?.endsWith("/");
  const current = objectKey ? keyName(objectKey) : "";

  useEffect(() => {
    if (!objectKey) return;
    setName(current);
    setError(null);
    // Select the name up to its extension, like a desktop file manager.
    const timer = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(
        0,
        isDir ? current.length : splitExtension(current)[0].length
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [objectKey, current, isDir]);

  const rename = useRenameObject(bucketName, {
    onSuccess: (res, vars) => {
      toast.success(`Renamed to "${keyName(res.key)}"`);
      queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
      onRenamed(vars.key, res.key);
      onClose();
    },
    onError: (err) => {
      if (err.status === 400 || err.status === 409) {
        setError(err.message);
      } else {
        handleError(err);
      }
    },
  });

  const validate = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "Enter a name";
    if (trimmed.includes("/")) return 'Names can\'t contain "/"';
    if (trimmed === "." || trimmed === "..") return "That name isn't allowed";
    if (trimmed === current) return "Enter a different name";
    return null;
  };

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const problem = validate(name);
    if (problem) {
      setError(problem);
      return;
    }
    if (objectKey) {
      rename.mutate({ key: objectKey, name: name.trim() });
    }
  };

  return (
    <Dialog open={!!objectKey} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {isDir ? "folder" : "file"}</DialogTitle>
          {isDir ? (
            <DialogDescription>
              Everything inside the folder moves to the new name. Large
              folders can take a while.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
          <Input
            ref={inputRef}
            value={name}
            aria-label="New name"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </form>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit()} loading={rename.isPending}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameDialog;

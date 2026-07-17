import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import Chips from "@/components/ui/chips";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AddAliasSchema, addAliasSchema } from "../schema";
import Button from "@/components/ui/button";
import { useAddAlias, useRemoveAlias } from "../hooks";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { InputField } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBucketContext } from "../context";

const AliasesSection = () => {
  const { bucket: data, canManage } = useBucketContext();

  const queryClient = useQueryClient();
  const removeAlias = useRemoveAlias(data?.id, {
    onSuccess: () => {
      toast.success("Alias removed!");
      queryClient.invalidateQueries({ queryKey: ["bucket", data?.id] });
    },
    onError: handleError,
  });

  const onRemoveAlias = (alias: string) => {
    if (window.confirm("Are you sure you want to remove this alias?")) {
      removeAlias.mutate(alias);
    }
  };

  const aliases = data?.globalAliases || [];

  return (
    <div>
      <p className="text-sm font-medium">Aliases</p>

      <div className="mt-2 flex flex-row flex-wrap gap-2">
        {aliases.map((alias: string) => (
          <Chips
            key={alias}
            onRemove={canManage ? () => onRemoveAlias(alias) : undefined}
          >
            {alias}
          </Chips>
        ))}
        {canManage ? <AddAliasDialog id={data?.id} /> : null}
      </div>
    </div>
  );
};

const AddAliasDialog = ({ id }: { id?: string }) => {
  const [isOpen, setOpen] = useState(false);
  const form = useForm<AddAliasSchema>({
    resolver: zodResolver(addAliasSchema),
    defaultValues: { alias: "" },
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) form.reset({ alias: "" });
  }, [isOpen]);

  const addAlias = useAddAlias(id, {
    onSuccess: () => {
      form.reset();
      setOpen(false);
      toast.success("Alias added!");
      queryClient.invalidateQueries({ queryKey: ["bucket", id] });
    },
    onError: handleError,
  });

  const onSubmit = form.handleSubmit((values) => {
    addAlias.mutate(values.alias);
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" icon={Plus} onClick={() => setOpen(true)}>
        Add Alias
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Alias</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <InputField form={form} name="alias" title="Name" />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onSubmit}
            disabled={addAlias.isPending}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AliasesSection;

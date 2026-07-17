import Button from "@/components/ui/button";
import { useKeys } from "@/pages/keys/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Checkbox, { CheckboxField } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFieldArray, useForm } from "react-hook-form";
import { AllowKeysSchema, allowKeysSchema } from "../schema";
import { useAllowKey } from "../hooks";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useBucketContext } from "../context";

type Props = {
  currentKeys?: string[];
};

const AllowKeyDialog = ({ currentKeys }: Props) => {
  const { bucket } = useBucketContext();
  const [isOpen, setOpen] = useState(false);
  const { data: keys } = useKeys();
  const form = useForm<AllowKeysSchema>({
    resolver: zodResolver(allowKeysSchema),
  });
  const { fields: keyFields } = useFieldArray({
    control: form.control,
    name: "keys",
  });
  const queryClient = useQueryClient();

  const allowKey = useAllowKey(bucket.id, {
    onSuccess: () => {
      form.reset();
      setOpen(false);
      toast.success("Key allowed!");
      queryClient.invalidateQueries({ queryKey: ["bucket", bucket.id] });
    },
    onError: handleError,
  });

  useEffect(() => {
    const _keys = keys
      ?.filter((key) => !currentKeys?.includes(key.id))
      ?.map((key) => ({
        checked: false,
        keyId: key.id,
        name: key.name,
        read: false,
        write: false,
        owner: false,
      }));

    form.setValue("keys", _keys || []);
  }, [keys, currentKeys]);

  const onToggleAll = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof AllowKeysSchema["keys"][number]
  ) => {
    const curValues = form.getValues("keys");
    const newValues = curValues.map((item) => ({
      ...item,
      [field]: e.target.checked,
    }));
    form.setValue("keys", newValues);
  };

  const onSubmit = form.handleSubmit((values) => {
    const data = values.keys
      .filter((key) => key.checked)
      .map((key) => ({
        keyId: key.keyId,
        permissions: { read: key.read, write: key.write, owner: key.owner },
      }));
    allowKey.mutate(data);
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <Button variant="default" icon={Plus} onClick={() => setOpen(true)}>
        Allow Key
      </Button>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Allow Key</DialogTitle>
          <DialogDescription>
            Enter the key you want to allow access to.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox
                    label="Key"
                    onChange={(e) => onToggleAll(e, "checked")}
                  />
                </TableHead>
                <TableHead>Local Aliases</TableHead>
                <TableHead>
                  <Checkbox
                    label="Read"
                    onChange={(e) => onToggleAll(e, "read")}
                  />
                </TableHead>
                <TableHead>
                  <Checkbox
                    label="Write"
                    onChange={(e) => onToggleAll(e, "write")}
                  />
                </TableHead>
                <TableHead>
                  <Checkbox
                    label="Owner"
                    onChange={(e) => onToggleAll(e, "owner")}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {!keyFields.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    No keys found
                  </TableCell>
                </TableRow>
              ) : null}
              {keyFields.map((field, index) => {
                const curKey = bucket.keys.find(
                  (key) => key.accessKeyId === field.keyId
                );
                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <CheckboxField
                        form={form}
                        name={`keys.${index}.checked`}
                        label={field.name || field.keyId?.substring(0, 8)}
                      />
                    </TableCell>
                    <TableCell>
                      {curKey?.bucketLocalAliases?.join(", ") || "-"}
                    </TableCell>
                    <TableCell>
                      <CheckboxField form={form} name={`keys.${index}.read`} />
                    </TableCell>
                    <TableCell>
                      <CheckboxField form={form} name={`keys.${index}.write`} />
                    </TableCell>
                    <TableCell>
                      <CheckboxField form={form} name={`keys.${index}.owner`} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={allowKey.isPending}
            onClick={onSubmit}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AllowKeyDialog;

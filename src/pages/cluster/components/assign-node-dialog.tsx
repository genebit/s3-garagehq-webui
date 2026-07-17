import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Checkbox from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAssignNode, useClusterLayout, useClusterStatus } from "../hooks";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AssignNodeSchema,
  assignNodeSchema,
  capacityUnits,
  calculateCapacity,
  parseCapacity,
} from "../schema";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { assignNodeDialog } from "../stores";
import FormControl from "@/components/ui/form-control";
import Select2 from "@/components/ui/select";

const defaultValues: AssignNodeSchema = {
  nodeId: "",
  zone: "",
  capacity: 1,
  capacityUnit: "GB",
  isGateway: false,
  tags: [],
};

const AssignNodeDialog = () => {
  const { isOpen, data } = assignNodeDialog.use();
  const { data: cluster } = useClusterStatus();
  const { data: layout } = useClusterLayout();
  const queryClient = useQueryClient();

  const form = useForm<AssignNodeSchema>({
    resolver: zodResolver(assignNodeSchema),
    defaultValues,
  });
  const isGateway = useWatch({ control: form.control, name: "isGateway" });

  const assignNode = useAssignNode({
    onSuccess() {
      form.reset();
      toast.success("Node staged for assignment!");
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: ["layout"] });
      assignNodeDialog.close();
    },
    onError(err) {
      toast.error(err?.message || "Unknown error");
    },
  });

  useEffect(() => {
    if (data) {
      const isGateway = data.capacity === null;
      const cap = parseCapacity(data.capacity);

      form.reset({
        ...defaultValues,
        ...data,
        capacity: cap.value,
        capacityUnit: cap.unit,
        isGateway,
      });
    }
  }, [data]);

  const zoneList = useMemo(() => {
    const nodes = cluster?.nodes || cluster?.knownNodes || [];
    const list = nodes
      .flatMap((i) => {
        const role = layout?.roles.find((role) => role.id === i.id);
        const staged = layout?.stagedRoleChanges.find(
          (role) => role.id === i.id
        );
        return staged?.zone || role?.zone || i.role?.zone;
      })
      .filter(Boolean);

    return [...new Set(list)].map((zone) => ({
      label: zone,
      value: zone,
    }));
  }, [cluster, layout]);

  const tagsList = useMemo(() => {
    const nodes = cluster?.nodes || cluster?.knownNodes || [];
    const list = nodes
      .flatMap((i) => {
        const role = layout?.roles.find((role) => role.id === i.id);
        const staged = layout?.stagedRoleChanges.find(
          (role) => role.id === i.id
        );
        return staged?.tags || role?.tags || i.role?.tags;
      })
      .filter(Boolean);

    return [...new Set(list)].map((tag) => ({
      label: tag,
      value: tag,
    }));
  }, [cluster, layout]);

  const onSubmit = form.handleSubmit((values) => {
    const capacity = !values.isGateway
      ? calculateCapacity(values.capacity, values.capacityUnit)
      : null;
    const data = {
      id: values.nodeId,
      zone: values.zone,
      capacity,
      tags: values.tags,
    };
    assignNode.mutate(data);
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && assignNodeDialog.close()}
    >
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Assign Node</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium leading-none">
              Node ID:
            </label>
            <Input
              placeholder="..."
              className="w-full"
              {...form.register("nodeId")}
              readOnly
            />
          </div>

          <FormControl
            form={form}
            name="zone"
            title="Zone"
            render={(field) => (
              <Select2
                creatable
                {...field}
                value={
                  field.value
                    ? { label: field.value, value: field.value }
                    : null
                }
                options={zoneList}
                onChange={({ value }: any) => field.onChange(value)}
              />
            )}
          />

          <div className="flex items-center justify-between">
            <label className="flex-1 truncate text-sm font-medium">
              Capacity
            </label>
            <Controller
              control={form.control}
              name="isGateway"
              render={({ field }) => (
                <Checkbox
                  label="Gateway"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              )}
            />
          </div>

          {!isGateway && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <FormControl
                form={form}
                name="capacity"
                render={(field) => <Input type="number" {...(field as any)} />}
              />
              <FormControl
                form={form}
                name="capacityUnit"
                render={(field) => (
                  <Select2
                    {...field}
                    value={
                      field.value
                        ? { label: field.value, value: field.value }
                        : null
                    }
                    options={capacityUnits.map((unit) => ({
                      label: unit,
                      value: unit,
                    }))}
                    onChange={({ value }: any) => field.onChange(value)}
                    isSearchable={false}
                    placeholder="Select Unit"
                  />
                )}
              />
            </div>
          )}

          <FormControl
            form={form}
            name="tags"
            title="Tags"
            render={(field) => (
              <Select2
                creatable
                isMulti
                {...field}
                value={
                  field.value
                    ? (field.value as string[]).map((value) => ({
                        label: value,
                        value,
                      }))
                    : null
                }
                options={tagsList}
                onChange={(values) => {
                  if (Array.isArray(values)) {
                    field.onChange(values.map((value) => value.value));
                  }
                }}
              />
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={assignNodeDialog.close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={assignNode.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AssignNodeDialog;

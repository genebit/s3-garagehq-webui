import Code from "@/components/ui/code";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConnectNode } from "../hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ConnectNodeSchema, connectNodeSchema } from "../schema";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plug } from "lucide-react";

const ConnectNodeDialog = () => {
  const [isOpen, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<ConnectNodeSchema>({
    resolver: zodResolver(connectNodeSchema),
    defaultValues: { nodeId: "" },
  });

  const connectNode = useConnectNode({
    onSuccess() {
      form.reset({ nodeId: "" });
      setOpen(false);
      toast.success("Node connected!");
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError(err) {
      setOpen(false);
      toast.error(err?.message || "Unknown error");
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    connectNode.mutate(values.nodeId);
  });

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <Button variant="default" icon={Plug} onClick={() => setOpen(true)}>
        Connect
      </Button>

      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Connect Node</DialogTitle>
          </DialogHeader>

          <div>
            <p className="text-sm">
              Run this command in your target node to get node id:
            </p>
            <Code className="mt-2">docker exec garage /garage node id</Code>

            <p className="mt-6 text-sm">Enter node id:</p>
            <Input
              placeholder="..."
              className="mt-2 w-full"
              {...form.register("nodeId")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={connectNode.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectNodeDialog;

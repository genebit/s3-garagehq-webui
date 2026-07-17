import { Node } from "../types";
import { cn, handleError, readableBytes } from "@/lib/utils";
import {
  Check,
  CheckCircle,
  Cylinder,
  EllipsisVertical,
  Info,
  Network,
  RouteIcon,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import ConnectNodeDialog from "./connect-node-dialog";
import AssignNodeDialog from "./assign-node-dialog";
import { assignNodeDialog } from "../stores";
import {
  useApplyChanges,
  useClusterLayout,
  useRevertChanges,
  useUnassignNode,
} from "../hooks";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NodeListProps = {
  nodes: Node[];
};

const NodesList = ({ nodes }: NodeListProps) => {
  const { data, refetch } = useClusterLayout();
  const [filter, setFilter] = useState({
    search: "",
  });
  const queryClient = useQueryClient();

  const unassignNode = useUnassignNode({
    onSuccess: () => {
      toast.success("Node unassigned!");
      refetch();
    },
    onError: handleError,
  });

  const revertChanges = useRevertChanges({
    onSuccess: () => {
      toast.success("Layout reverted!");
      refetch();
    },
    onError: handleError,
  });

  const applyChanges = useApplyChanges({
    onSuccess: () => {
      toast.success("Layout applied!");
      setTimeout(refetch, 100);
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    onError: handleError,
  });

  const items = useMemo(() => {
    return nodes
      .filter((item) => {
        if (filter.search) {
          const q = filter.search.toLowerCase();
          return (
            item.hostname.toLowerCase().includes(q) ||
            item.id.includes(q) ||
            item.addr.includes(q) ||
            item.role?.zone?.includes(q) ||
            item.role?.tags?.find((tag) => tag.toLowerCase().includes(q))
          );
        }

        return true;
      })
      .map((item) => {
        const role = data?.roles?.find((r) => r.id === item.role?.id);
        const stagedChanges = data?.stagedRoleChanges?.find(
          (i) => i.id === item.id
        );
        return {
          ...item,
          role: stagedChanges || role || item.role,
          isStaged: !!stagedChanges,
        };
      });
  }, [nodes, data, filter]);

  const onAssign = (node: Node) => {
    assignNodeDialog.open({
      nodeId: node.id,
      zone: node.role?.zone,
      capacity: node.role?.capacity,
      tags: node.role?.tags,
    });
  };

  const onUnassign = (id: string) => {
    if (window.confirm("Are you sure you want to unassign this node?")) {
      unassignNode.mutate(id);
    }
  };

  const onRevert = () => {
    if (
      window.confirm("Are you sure you want to revert any changes made?") &&
      data?.version != null
    ) {
      revertChanges.mutate(data?.version + 1);
    }
  };

  const onApply = () => {
    if (
      window.confirm("Are you sure you want to apply your layout changes?") &&
      data?.version != null
    ) {
      applyChanges.mutate(data?.version + 1);
    }
  };

  const hasStagedChanges = data && data.stagedRoleChanges?.length > 0;

  return (
    <>
      <div className="my-2 flex flex-col items-stretch gap-x-4 gap-y-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search..."
          className="sm:max-w-xs"
          value={filter.search}
          onChange={(e) => {
            setFilter((state) => ({ ...state, search: e.target.value }));
          }}
        />
        <div className="flex-1" />

        {hasStagedChanges ? (
          <>
            <Button
              variant="outline"
              onClick={onRevert}
              disabled={revertChanges.isPending || applyChanges.isPending}
            >
              Revert
            </Button>
            <Button
              variant="default"
              icon={Check}
              onClick={onApply}
              disabled={revertChanges.isPending || applyChanges.isPending}
            >
              Apply
            </Button>
          </>
        ) : (
          <ConnectNodeDialog />
        )}
      </div>

      {hasStagedChanges && (
        <Alert>
          <Info />
          <AlertDescription>
            There are staged layout changes that need to be applied. Press
            Apply to apply them, or Revert to discard them.
          </AlertDescription>
        </Alert>
      )}

      {applyChanges.data?.message ? (
        <Alert className="relative overflow-x-auto">
          <CheckCircle />
          <AlertDescription>
            <pre className="text-xs">{applyChanges.data.message.join("\n")}</pre>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            onClick={applyChanges.reset}
            className="absolute right-2 top-2 rounded-full"
          >
            <X size={16} />
          </Button>
        </Alert>
      ) : null}

      <div className="min-h-[400px] w-full overflow-x-auto overflow-y-hidden">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Hostname</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((item, idx) => (
              <TableRow
                key={item.id}
                className={cn(
                  item.isStaged && "bg-amber-500/10",
                  item.role && "remove" in item.role ? "bg-red-500/10" : null
                )}
              >
                <TableCell>{idx + 1}</TableCell>
                <TableCell>
                  <p className="max-w-[80px] truncate" title={item.id}>
                    {item.id}
                  </p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{item.hostname}</p>
                  <div className="flex flex-row items-center gap-1">
                    <Share2 size={12} />
                    <p className="text-xs text-muted-foreground">{item.addr}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <p>{item.role?.zone || "-"}</p>
                  <div className="flex flex-row flex-wrap items-center gap-1">
                    {item.role?.tags?.map((tag: any) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <p>
                    {item.role?.capacity === null ? (
                      <>
                        <Network className="mr-1 inline" size={18} />
                        Gateway
                      </>
                    ) : (
                      readableBytes(item.role?.capacity, 1000)
                    )}
                  </p>

                  {item.role?.capacity !== null && item.dataPartition ? (
                    <div className="flex flex-row items-center gap-1">
                      <Cylinder size={12} />

                      <p className="text-xs text-muted-foreground">
                        {readableBytes(item.dataPartition?.available) +
                          ` (${Math.round(
                            (item.dataPartition.available /
                              item.dataPartition.total) *
                              100
                          )}%)`}
                      </p>
                    </div>
                  ) : null}
                </TableCell>

                <TableCell>
                  <Badge
                    variant={
                      item.draining
                        ? "warning"
                        : item.isUp
                          ? "success"
                          : "error"
                    }
                  >
                    {item.draining
                      ? "Draining"
                      : item.isUp
                        ? "Active"
                        : "Inactive"}
                  </Badge>
                </TableCell>

                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full">
                        <EllipsisVertical size={18} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem onSelect={() => onAssign(item)}>
                        <RouteIcon /> Assign
                      </DropdownMenuItem>
                      {item.role != null && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => onUnassign(item.id)}
                        >
                          <Trash2 /> Remove
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AssignNodeDialog />
    </>
  );
};

export default NodesList;

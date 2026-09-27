import Button from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, Trash } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useRemoveBucket } from "../hooks";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { confirmDialog } from "@/lib/confirm";

const MenuButton = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const removeBucket = useRemoveBucket({
    onSuccess: () => {
      toast.success("Bucket removed!");
      navigate("/buckets", { replace: true });
    },
    onError: handleError,
  });

  const onRemove = async () => {
    const ok = await confirmDialog({
      title: "Remove this bucket?",
      description: "The bucket must be empty. This can't be undone.",
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) {
      removeBucket.mutate(id!);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <EllipsisVertical size={18} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={onRemove}
        >
          <Trash /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default MenuButton;

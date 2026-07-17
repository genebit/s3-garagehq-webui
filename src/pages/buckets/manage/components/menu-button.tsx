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

  const onRemove = () => {
    if (window.confirm("Are you sure you want to remove this bucket?")) {
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

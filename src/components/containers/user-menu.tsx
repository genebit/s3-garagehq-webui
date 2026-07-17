import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import * as utils from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChangePasswordDialog from "./change-password-dialog";

const UserMenu = () => {
  const auth = useAuth();
  const [pwOpen, setPwOpen] = useState(false);

  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      window.location.href = utils.url("/auth/login");
    },
    onError: (err) => {
      toast.error(err?.message || "Unknown error");
    },
  });

  if (!auth.user) {
    return null;
  }

  const initials = auth.user.username.slice(0, 2).toUpperCase();
  const canChangePassword = auth.user.id !== "__legacy__";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="truncate">{auth.user.username}</p>
            <p className="text-xs font-normal capitalize text-muted-foreground">
              {auth.user.role}
              {auth.user.email ? ` · ${auth.user.email}` : ""}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canChangePassword ? (
            <DropdownMenuItem onSelect={() => setPwOpen(true)}>
              <KeyRound />
              Change password
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => logout.mutate()}
          >
            <LogOut />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
};

export default UserMenu;

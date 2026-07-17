import Button from "@/components/ui/button";
import Page from "@/context/page-context";
import { Trash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeleteUser, useUsers } from "./hooks";
import UserDialog from "./components/user-dialog";
import { toast } from "sonner";
import { handleError, dayjs } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { User } from "./types";

const UsersPage = () => {
  const { data, refetch } = useUsers();
  const auth = useAuth();

  const deleteUser = useDeleteUser({
    onSuccess: () => {
      refetch();
      toast.success("User removed!");
    },
    onError: handleError,
  });

  const onRemove = (user: User) => {
    if (window.confirm(`Remove user "${user.username}"?`)) {
      deleteUser.mutate(user.id);
    }
  };

  // Admins cannot modify owner accounts.
  const canModify = (user: User) => auth.isOwner || user.role !== "owner";

  return (
    <div className="container">
      <Page title="Users" />

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          Manage who can access this instance and what they can do.
        </p>
        <UserDialog />
      </div>

      <Card className="mt-4 md:mt-8">
        <CardContent className="p-4">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Buckets</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.map((user, idx) => (
                  <TableRow key={user.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">
                      {user.username}
                      {user.id === auth.user?.id ? (
                        <span className="text-muted-foreground"> (you)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === "owner" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.role === "developer" ? user.buckets.length : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dayjs(user.createdAt).fromNow()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-row items-center justify-end gap-1">
                        {canModify(user) ? <UserDialog user={user} /> : null}
                        {canModify(user) && user.id !== auth.user?.id ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            icon={Trash}
                            onClick={() => onRemove(user)}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersPage;

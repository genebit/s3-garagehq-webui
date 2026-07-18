import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Button from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dayjs } from "@/lib/utils";
import { User } from "@/pages/users/types";
import { useMemo } from "react";

const MAX_ROWS = 6;

type Props = {
  users?: User[];
};

const UsersTable = ({ users }: Props) => {
  const rows = useMemo(
    () =>
      [...(users || [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [users]
  );
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Users</CardTitle>
        <Button variant="outline" size="sm" href="/users">
          View all
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Buckets</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="max-w-[140px] truncate font-medium">
                  {user.username}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === "owner" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {user.role === "developer" ? user.buckets.length : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {dayjs(user.createdAt).fromNow()}
                </TableCell>
              </TableRow>
            ))}

            {!shown.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  No users yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        {rows.length > MAX_ROWS ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            +{rows.length - MAX_ROWS} more
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default UsersTable;

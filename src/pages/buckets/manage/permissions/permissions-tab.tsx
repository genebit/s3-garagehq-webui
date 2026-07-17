import { useDenyKey } from "../hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Checkbox from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Button from "@/components/ui/button";
import { Trash } from "lucide-react";
import AllowKeyDialog from "./allow-key-dialog";
import { useMemo } from "react";
import { toast } from "sonner";
import { handleError } from "@/lib/utils";
import { useBucketContext } from "../context";

const PermissionsTab = () => {
  const { bucket, refetch } = useBucketContext();

  const denyKey = useDenyKey(bucket.id, {
    onSuccess: () => {
      toast.success("Key removed!");
      refetch();
    },
    onError: handleError,
  });

  const keys = useMemo(() => {
    return bucket?.keys.filter(
      (key) =>
        key.permissions.read !== false ||
        key.permissions.write !== false ||
        key.permissions.owner !== false
    );
  }, [bucket?.keys]);

  const onRemove = (id: string) => {
    if (window.confirm("Are you sure you want to remove this key?")) {
      denyKey.mutate({
        keyId: id,
        permissions: { read: true, write: true, owner: true },
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center space-y-0">
        <CardTitle className="flex-1 truncate">Access Keys</CardTitle>
        <AllowKeyDialog currentKeys={keys?.map((key) => key.accessKeyId)} />
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Aliases</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Write</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>

            <TableBody>
              {keys?.map((key, idx) => (
                <TableRow key={key.accessKeyId}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    {key.name || key.accessKeyId?.substring(0, 8)}
                  </TableCell>
                  <TableCell>
                    {key.bucketLocalAliases?.join(", ") || "-"}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={key.permissions?.read}
                      readOnly
                      className="cursor-default"
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={key.permissions?.write}
                      readOnly
                      className="cursor-default"
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={key.permissions?.owner}
                      readOnly
                      className="cursor-default"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      icon={Trash}
                      onClick={() => onRemove(key.accessKeyId)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default PermissionsTab;

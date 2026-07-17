import Button from "@/components/ui/button";
import { Copy, Eye } from "lucide-react";
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
import { useMemo, useState, useCallback } from "react";
import { copyToClipboard, handleError } from "@/lib/utils";
import api from "@/lib/api";
import { useBuckets } from "@/pages/buckets/hooks";

type DevKey = {
  id: string;
  name: string;
  buckets: { alias: string; read: boolean; write: boolean; owner: boolean }[];
};

const DeveloperKeys = () => {
  const { data: buckets } = useBuckets();
  const [secretKeys, setSecretKeys] = useState<Record<string, string>>({});

  // Collect the unique keys that grant access to the developer's assigned
  // buckets, along with which bucket each key can access.
  const keys = useMemo<DevKey[]>(() => {
    const map = new Map<string, DevKey>();

    for (const bucket of buckets || []) {
      const alias = bucket.globalAliases?.[0] || bucket.id;
      for (const key of bucket.keys || []) {
        const existing = map.get(key.accessKeyId) || {
          id: key.accessKeyId,
          name: key.name,
          buckets: [],
        };
        existing.buckets.push({
          alias,
          read: key.permissions.read,
          write: key.permissions.write,
          owner: key.permissions.owner,
        });
        map.set(key.accessKeyId, existing);
      }
    }

    return Array.from(map.values());
  }, [buckets]);

  const fetchSecretKey = useCallback(async (id: string) => {
    try {
      const result = await api.get("/v2/GetKeyInfo", {
        params: { id, showSecretKey: "true" },
      });
      if (!result?.secretAccessKey) {
        throw new Error("Failed to fetch secret key");
      }
      setSecretKeys((prev) => ({ ...prev, [id]: result.secretAccessKey }));
    } catch (err) {
      handleError(err);
    }
  }, []);

  return (
    <Card className="mt-4 md:mt-8">
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">
          Access keys for the buckets assigned to you. Use these credentials to
          connect S3-compatible tools directly to your buckets.
        </p>

        <div className="mt-2 w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Key ID</TableHead>
                <TableHead>Secret Key</TableHead>
                <TableHead>Access</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {keys.map((key, idx) => (
                <TableRow key={key.id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{key.name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-row items-center gap-1">
                      <p className="max-w-20 truncate" title={key.id}>
                        {key.id}
                      </p>
                      <Button
                        size="icon"
                        variant="ghost"
                        icon={Copy}
                        onClick={() => copyToClipboard(key.id)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {!secretKeys[key.id] ? (
                      <Button
                        icon={Eye}
                        size="sm"
                        variant="outline"
                        onClick={() => fetchSecretKey(key.id)}
                        className="min-w-[80px] shrink-0"
                      >
                        View
                      </Button>
                    ) : (
                      <div className="flex flex-row items-center gap-1">
                        <p
                          className="max-w-20 truncate font-mono"
                          title={secretKeys[key.id]}
                        >
                          {secretKeys[key.id]}
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          icon={Copy}
                          onClick={() => copyToClipboard(secretKeys[key.id])}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-row flex-wrap gap-1">
                      {key.buckets.map((b) => (
                        <Badge key={b.alias}>
                          {b.alias}
                          <span className="text-muted-foreground">
                            {[b.read && "r", b.write && "w", b.owner && "o"]
                              .filter(Boolean)
                              .join("")}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {keys.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No access keys are granted to your buckets yet. Ask an
              administrator to add a key.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default DeveloperKeys;

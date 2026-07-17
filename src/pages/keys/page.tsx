import Button from "@/components/ui/button";
import Page from "@/context/page-context";
import { Copy, Eye, Trash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Input from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useKeys, useRemoveKey } from "./hooks";
import CreateKeyDialog from "./components/create-key-dialog";
import { toast } from "sonner";
import { copyToClipboard, handleError } from "@/lib/utils";
import { useCallback, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import DeveloperKeys from "./components/developer-keys";

const KeysPage = () => {
  const auth = useAuth();

  if (auth.isDeveloper) {
    return (
      <div className="container">
        <Page title="Keys" />
        <DeveloperKeys />
      </div>
    );
  }

  return <ManagerKeysPage />;
};

const ManagerKeysPage = () => {
  const { data, refetch } = useKeys();
  const [search, setSearch] = useState("");
  const [secretKeys, setSecretKeys] = useState<Record<string, string>>({});

  const removeKey = useRemoveKey({
    onSuccess: () => {
      refetch();
      toast.success("Key removed!");
    },
    onError: handleError,
  });

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

  const onRemove = (id: string) => {
    if (window.confirm("Are you sure you want to remove this key?")) {
      removeKey.mutate(id);
    }
  };

  const items = useMemo(() => {
    if (!search?.length) {
      return data;
    }

    const q = search.toLowerCase();
    return data?.filter((item) => item.id.includes(q) || item.name.includes(q));
  }, [data, search]);

  return (
    <div className="container">
      <Page title="Keys" />

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search..."
          className="sm:max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <CreateKeyDialog />
      </div>

      <Card className="mt-4 md:mt-8">
        <CardContent className="p-4">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Secret Key</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {items?.map((key, idx) => (
                  <TableRow key={key.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>{key.name}</TableCell>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={Trash}
                        onClick={() => onRemove(key.id)}
                      />
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

export default KeysPage;

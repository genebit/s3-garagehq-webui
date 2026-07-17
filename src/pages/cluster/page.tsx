import Page from "@/context/page-context";
import { useClusterStatus, useNodeInfo } from "./hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import NodesList from "./components/nodes-list";
import { useMemo } from "react";

const ClusterPage = () => {
  const { data } = useClusterStatus();
  const { data: node } = useNodeInfo();

  const nodes = useMemo(() => {
    if (!data) return [];

    if (Array.isArray(data.knownNodes)) {
      return data.knownNodes.map((node) => ({
        ...node,
        role: data.layout?.roles.find((role) => role.id === node.id),
      }));
    }

    return data.nodes || [];
  }, [data]);

  return (
    <div className="container">
      <Page title="Cluster" />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailItem title="Garage Version" value={node?.garageVersion} />
          <DetailItem title="DB engine" value={node?.dbEngine} />
          <DetailItem
            title="Layout version"
            value={data?.layoutVersion || data?.layout?.version || "-"}
          />
        </CardContent>
      </Card>

      <Card className="mt-4 md:mt-8">
        <CardHeader>
          <CardTitle>Nodes</CardTitle>
        </CardHeader>
        <CardContent>
          <NodesList nodes={nodes} />
        </CardContent>
      </Card>
    </div>
  );
};

type DetailItemProps = {
  title: string;
  value?: string | number | null;
};

const DetailItem = ({ title, value }: DetailItemProps) => {
  return (
    <div className="flex max-w-xl flex-row items-start gap-3 text-left text-sm">
      <div className="w-1/3 max-w-[200px] shrink-0">
        <p className="text-muted-foreground">{title}</p>
      </div>
      <div className="flex-1 truncate">
        <p className="truncate">{value}</p>
      </div>
    </div>
  );
};

export default ClusterPage;
